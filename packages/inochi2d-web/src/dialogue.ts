import type {
  DialogueSceneName,
  ResolvedDialogueScene,
  ResolvedWidgetConfig,
} from "./types.js";

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
  readonly #config: ResolvedWidgetConfig["dialogue"];
  readonly #random: () => number;
  #started = false;
  #enterDueAt: number | undefined;
  #nextIdleAt: number | undefined;

  constructor(
    config: ResolvedWidgetConfig["dialogue"],
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
    const index = Math.min(
      config.lines.length - 1,
      Math.floor(this.#unitRandom() * config.lines.length),
    );
    return {
      scene,
      animation: config.animation,
      line: config.lines[index]!,
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
