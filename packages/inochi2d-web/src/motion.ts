import type { ParameterIds } from "./types.js";

type ScalarParameters = ReadonlyMap<string, number>;

interface MotionOptions {
  ids: ParameterIds;
  clickAmplitude: number;
  random: () => number;
}

/** Mixes neutral, idle, pointer, drag, and click values in priority order. */
export class MotionMixer {
  readonly #ids: ParameterIds;
  readonly #clickAmplitude: number;
  readonly #random: () => number;
  #pointerX = 0;
  #pointerY = 0;
  #dragBodyX = 0;
  #clickStartedAt: number | undefined;
  #blinkStartedAt: number | undefined;
  #nextBlinkAt = 0;

  constructor(options: MotionOptions) {
    this.#ids = options.ids;
    this.#clickAmplitude = options.clickAmplitude;
    this.#random = options.random;
    this.#scheduleBlink(0);
  }

  setPointer(x: number, y: number): void {
    this.#pointerX = clamp(x, -1, 1);
    this.#pointerY = clamp(y, -1, 1);
  }

  setDragBody(value: number): void {
    this.#dragBodyX = clamp(value, -1, 1);
  }

  releaseDrag(): void {
    this.#dragBodyX = 0;
  }

  triggerClick(timestampMs: number): void {
    this.#clickStartedAt = timestampMs;
  }

  sample(timestampMs: number, reducedMotion: boolean): ScalarParameters {
    const values = new Map<string, number>();

    // Neutral values.
    values.set(this.#ids.breath, 0);
    values.set(this.#ids.eyeOpenLeft, 1);
    values.set(this.#ids.eyeOpenRight, 1);
    values.set(this.#ids.eyeX, 0);
    values.set(this.#ids.eyeY, 0);
    values.set(this.#ids.headX, 0);
    values.set(this.#ids.headY, 0);
    values.set(this.#ids.bodyX, 0);
    values.set(this.#ids.click, 0);

    if (reducedMotion) {
      return values;
    }

    // Idle motion.
    values.set(this.#ids.breath, (Math.sin(timestampMs / 1400) + 1) / 2);
    const eyeOpen = this.#sampleBlink(timestampMs);
    values.set(this.#ids.eyeOpenLeft, eyeOpen);
    values.set(this.#ids.eyeOpenRight, eyeOpen);

    // Pointer following overrides neutral head and eye values.
    values.set(this.#ids.eyeX, this.#pointerX);
    values.set(this.#ids.eyeY, -this.#pointerY);
    values.set(this.#ids.headX, this.#pointerX * 0.45);
    values.set(this.#ids.headY, -this.#pointerY * 0.35);

    // Drag and click have the highest automatic priority.
    values.set(this.#ids.bodyX, this.#dragBodyX);
    values.set(this.#ids.click, this.#sampleClick(timestampMs));
    return values;
  }

  #sampleBlink(timestampMs: number): number {
    if (this.#blinkStartedAt === undefined && timestampMs >= this.#nextBlinkAt) {
      this.#blinkStartedAt = timestampMs;
    }
    if (this.#blinkStartedAt === undefined) {
      return 1;
    }

    const progress = (timestampMs - this.#blinkStartedAt) / 160;
    if (progress >= 1) {
      this.#blinkStartedAt = undefined;
      this.#scheduleBlink(timestampMs);
      return 1;
    }
    return Math.abs(progress * 2 - 1);
  }

  #sampleClick(timestampMs: number): number {
    if (this.#clickStartedAt === undefined) {
      return 0;
    }
    const progress = (timestampMs - this.#clickStartedAt) / 360;
    if (progress >= 1 || progress < 0) {
      this.#clickStartedAt = undefined;
      return 0;
    }
    return Math.sin(progress * Math.PI) * this.#clickAmplitude;
  }

  #scheduleBlink(timestampMs: number): void {
    this.#nextBlinkAt = timestampMs + 2200 + this.#random() * 3800;
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
