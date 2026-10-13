export type DialogueSceneName = 'enter' | 'idle' | 'click';
export interface DialogueSceneConfig {
  animation: string;
  animations?: readonly string[];
  /** Shared sentence library used when linesByAnimation is absent. */
  lines?: readonly string[];
  /** Complete sentence libraries for the selected animation or animation pool. */
  linesByAnimation?: Readonly<Record<string, readonly string[]>>;
  durationMs?: number;
}
export interface ResolvedDialogueScene extends DialogueSceneConfig { durationMs: number }

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
  animation: string;
  line: string;
  durationMs: number;
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
      this.#config.idle &&
      this.#nextIdleAt !== undefined &&
      timestampMs >= this.#nextIdleAt
    ) {
      const action = this.#action("idle", this.#config.idle);
      this.#scheduleIdle(timestampMs + action.durationMs);
      return action;
    }
    return undefined;
  }

  triggerClick(timestampMs: number): DialogueAction | undefined {
    this.deferIdle(timestampMs);
    if (!this.#config.click) {
      return undefined;
    }
    const action = this.#action("click", this.#config.click);
    this.#scheduleIdle(timestampMs + action.durationMs);
    return action;
  }

  /** Postpones natural speech after visibility changes or direct interaction. */
  deferIdle(timestampMs: number): void {
    if (this.#started) {
      this.#scheduleIdle(timestampMs);
    }
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
    return {
      scene,
      animation: animation ?? chooseAnimation(),
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
    if (!idle) {
      this.#nextIdleAt = undefined;
      return;
    }
    const interval =
      idle.intervalMinMs +
      (idle.intervalMaxMs - idle.intervalMinMs) * this.#unitRandom();
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
