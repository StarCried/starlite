export type DialogueSceneName = 'enter' | 'idle' | 'click';
export interface DialogueSceneConfig {
  animation?: string;
  animations?: readonly string[];
  /** Shared sentence library used when linesByAnimation is absent. */
  lines?: readonly string[];
  /** Complete sentence libraries for the selected animation or animation pool. */
  linesByAnimation?: Readonly<Record<string, readonly string[]>>;
  durationMs?: number;
}
export interface ResolvedDialogueScene extends DialogueSceneConfig { durationMs: number }

export interface DialogueContext {
  id: string;
  lines: readonly string[];
  animation?: string;
  triggers: readonly ("click" | "idle")[];
  mode: "replace" | "merge";
  order: "sequential" | "random";
}

/** Copy bounded data before a host replaces an active dialogue context. */
export function resolveDialogueContext(input: unknown): DialogueContext {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("dialogue context must be an object");
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some(key => !["id", "lines", "animation", "triggers", "mode", "order"].includes(key))) throw new Error("dialogue context has an unknown field");
  const text = (item: unknown, maximum: number, field: string): string => {
    if (typeof item !== "string" || !item.trim() || new TextEncoder().encode(item.trim()).byteLength > maximum) throw new Error(`dialogue context ${field} is invalid`);
    return item.trim();
  };
  const id = text(value.id, 2048, "id");
  const lines = resolveDialogueSentences({ lines: value.lines as readonly string[] }, [], "dialogue context").lines!;
  if (!Array.isArray(value.triggers) || !value.triggers.length || value.triggers.length > 2 || new Set(value.triggers).size !== value.triggers.length || value.triggers.some(trigger => trigger !== "click" && trigger !== "idle")) throw new Error("dialogue context triggers are invalid");
  if (value.mode !== "replace" && value.mode !== "merge") throw new Error("dialogue context mode is invalid");
  if (value.order !== "sequential" && value.order !== "random") throw new Error("dialogue context order is invalid");
  return { id, lines, ...(value.animation !== undefined ? { animation: text(value.animation, 1024, "animation") } : {}),
    triggers: (["click", "idle"] as const).filter(trigger => (value.triggers as unknown[]).includes(trigger)), mode: value.mode, order: value.order };
}

/** Validate and copy plain-text libraries at the backend configuration boundary. */
export function resolveDialogueSentences(
  input: Pick<DialogueSceneConfig, "lines" | "linesByAnimation">,
  animations: readonly string[],
  field: string,
): Pick<DialogueSceneConfig, "lines" | "linesByAnimation"> {
  const resolve = (value: unknown, path: string): string[] => {
    if (!Array.isArray(value) || value.length < 1 || value.length > 128) {
      throw new Error(`${path} must contain 1..=128 sentences`);
    }
    return value.map((line: unknown, index: number) => {
      if (typeof line !== "string") throw new Error(`${path}[${index}] must be a string`);
      const text = line.trim();
      const bytes = new TextEncoder().encode(text).byteLength;
      if (bytes < 1 || bytes > 1024) throw new Error(`${path}[${index}] must contain 1..=1024 UTF-8 bytes`);
      return text;
    });
  };
  const lines = input.lines === undefined ? undefined : resolve(input.lines, `${field}.lines`);
  const mapping = input.linesByAnimation;
  if (mapping === undefined) {
    if (!lines) throw new Error(`${field}.lines or linesByAnimation is required`);
    return { lines };
  }
  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) {
    throw new Error(`${field}.linesByAnimation must be an animation-to-sentences object`);
  }
  if (!animations.length) throw new Error(`${field}.linesByAnimation needs an animation`);
  const selected = new Set(animations);
  const keys = Object.keys(mapping);
  if (keys.length !== selected.size || keys.some(name => !selected.has(name)) || animations.some(name => !Object.hasOwn(mapping, name))) {
    throw new Error(`${field}.linesByAnimation must cover exactly the selected animations`);
  }
  const linesByAnimation = Object.fromEntries(keys.map(name => [name, resolve(mapping[name], `${field}.linesByAnimation[${JSON.stringify(name)}]`)]));
  return { ...(lines ? { lines } : {}), linesByAnimation };
}
export interface DialogueSchedule {
 enter: false | (ResolvedDialogueScene & { delayMs: number });
 idle: false | (ResolvedDialogueScene & { intervalMinMs: number; intervalMaxMs: number });
 click: false | ResolvedDialogueScene;
}
export interface DialogueAction {
  scene: DialogueSceneName;
  animation?: string;
  line: string;
  durationMs: number;
}

interface ContextEntry {
  line: string;
  animation?: string;
  durationMs?: number;
  triggers: readonly ("click" | "idle")[];
}

/**
 * Schedules model-authored foreground actions and selects plain-text sentences.
 *
 * Clicks are delivered synchronously by the controller. Enter and idle scenes
 * are polled from the existing render loop, avoiding a second animation loop
 * or duplicate timers across PJAX navigation.
 */
export class DialogueScheduler {
  readonly #config: DialogueSchedule;
  readonly #random: () => number;
  #started = false;
  #enterDueAt: number | undefined;
  #nextIdleAt: number | undefined;
  #context: DialogueContext | null = null;
  #contextSignature = "null";
  #contextEntries: readonly ContextEntry[] = [];
  #contextCursor = 0;

  constructor(
    config: DialogueSchedule,
    random: () => number,
  ) {
    this.#config = config;
    this.#random = random;
  }

  start(timestampMs: number, immediateEnter = false): void {
    if (this.#started) {
      return;
    }
    this.#started = true;
    if (this.#config.enter) {
      this.#enterDueAt =
        timestampMs + (immediateEnter ? 0 : this.#config.enter.delayMs);
    }
    this.#scheduleIdle(timestampMs);
  }

  /** Preserve the model and first entrance while replacing host-owned text. */
  setContext(input: DialogueContext | null, timestampMs: number): boolean {
    if (!Number.isFinite(timestampMs)) throw new Error("dialogue context timestamp is invalid");
    const context = input === null ? null : resolveDialogueContext(input);
    const signature = JSON.stringify(context);
    if (signature === this.#contextSignature) return false;
    this.#context = context; this.#contextSignature = signature; this.#contextCursor = 0;
    this.#contextEntries = context ? [
      ...context.lines.map(line => ({ line, ...(context.animation !== undefined ? { animation: context.animation } : {}), triggers: context.triggers })),
      ...(context.mode === "merge" ? context.triggers.flatMap(scene => this.#entries(scene)) : []),
    ] : [];
    if (this.#started) this.#scheduleIdle(timestampMs);
    return true;
  }

  poll(timestampMs: number, foregroundActive: boolean): DialogueAction | undefined {
    if (!this.#started || foregroundActive) {
      return undefined;
    }
    if (
      this.#config.enter &&
      this.#enterDueAt !== undefined &&
      timestampMs >= this.#enterDueAt
    ) {
      this.#enterDueAt = undefined;
      const action = this.#action("enter", this.#config.enter);
      this.#scheduleIdle(timestampMs + action.durationMs);
      return action;
    }
    if (
      (this.#config.idle || this.#context?.triggers.includes("idle")) &&
      this.#nextIdleAt !== undefined &&
      timestampMs >= this.#nextIdleAt
    ) {
      const action = this.#contextAction("idle") ?? this.#action("idle", this.#config.idle as ResolvedDialogueScene);
      this.#scheduleIdle(timestampMs + action.durationMs);
      return action;
    }
    return undefined;
  }

  triggerClick(timestampMs: number): DialogueAction | undefined {
    this.deferIdle(timestampMs);
    if (!this.#config.click && !this.#context?.triggers.includes("click")) {
      return undefined;
    }
    const action = this.#contextAction("click") ?? this.#action("click", this.#config.click as ResolvedDialogueScene);
    this.#scheduleIdle(timestampMs + action.durationMs);
    return action;
  }

  /** Postpones natural speech after visibility changes or direct interaction. */
  deferIdle(timestampMs: number): void {
    if (this.#started) {
      this.#scheduleIdle(timestampMs);
    }
  }

  #entries(scene: "click" | "idle"): ContextEntry[] {
    const config = this.#config[scene];
    if (!config) return [];
    const animations = config.animations?.length ? config.animations : config.animation ? [config.animation] : [];
    if (config.linesByAnimation) return animations.flatMap(animation => (config.linesByAnimation![animation] ?? []).map(line => ({ line, animation, durationMs: config.durationMs, triggers: [scene] })));
    return (animations.length ? animations : [undefined]).flatMap(animation => (config.lines ?? []).map(line => ({ line, ...(animation !== undefined ? { animation } : {}), durationMs: config.durationMs, triggers: [scene] })));
  }

  #contextAction(scene: "click" | "idle"): DialogueAction | undefined {
    const context = this.#context;
    if (!context?.triggers.includes(scene)) return undefined;
    let entry: ContextEntry | undefined;
    if (context.order === "random") {
      const eligible = this.#contextEntries.filter(item => item.triggers.includes(scene));
      entry = eligible[Math.floor(this.#unitRandom() * eligible.length)];
    } else {
      for (let offset = 0; offset < this.#contextEntries.length; offset++) {
        const index = (this.#contextCursor + offset) % this.#contextEntries.length;
        const item = this.#contextEntries[index]!;
        if (!item.triggers.includes(scene)) continue;
        entry = item; this.#contextCursor = (index + 1) % this.#contextEntries.length; break;
      }
    }
    if (!entry) return undefined;
    const config = this.#config[scene];
    return { scene, line: entry.line, ...(entry.animation !== undefined ? { animation: entry.animation } : {}), durationMs: entry.durationMs ?? (config ? config.durationMs : 4000) };
  }

  #action(
    scene: DialogueSceneName,
    config: ResolvedDialogueScene,
  ): DialogueAction {
    // Preserve the historical random draw order for shared sentence libraries.
    // Bound libraries choose the animation first, then only its own sentences.
    const chooseAnimation = () => config.animations?.length
      ? config.animations[Math.floor(this.#unitRandom() * config.animations.length)]!
      : config.animation;
    const animation = config.linesByAnimation ? chooseAnimation() : undefined;
    const lines = animation === undefined ? config.lines! : config.linesByAnimation![animation]!;
    const index = Math.floor(this.#unitRandom() * lines.length);
    const chosenAnimation = animation ?? chooseAnimation();
    return {
      scene,
      ...(chosenAnimation !== undefined ? { animation: chosenAnimation } : {}),
      line: lines[index]!,
      durationMs: config.durationMs,
    };
  }

  #scheduleIdle(timestampMs: number): void {
    if (this.#enterDueAt !== undefined) {
      this.#nextIdleAt = undefined;
      return;
    }
    const idle = this.#config.idle;
    if (!idle && !this.#context?.triggers.includes("idle")) {
      this.#nextIdleAt = undefined;
      return;
    }
    const interval =
      (idle ? idle.intervalMinMs : 30000) +
      ((idle ? idle.intervalMaxMs : 60000) - (idle ? idle.intervalMinMs : 30000)) * this.#unitRandom();
    this.#nextIdleAt = timestampMs + interval;
  }

  #unitRandom(): number {
    const value = this.#random();
    if (!Number.isFinite(value)) {
      return 0;
    }
    return Math.min(1 - Number.EPSILON, Math.max(0, value));
  }
}
