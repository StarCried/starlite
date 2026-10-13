import type {
  ResolvedParameterBindings,
  ResolvedParameterTarget,
} from "./types.js";

type ParameterValue = number | readonly [number, number];
type MixedParameters = ReadonlyMap<string, ParameterValue>;

interface MotionOptions {
  bindings: ResolvedParameterBindings;
  random: () => number;
}

const BREATH_PHASE_MILLISECONDS = 700;

/** Returns one calm breath cycle in the normalized 0..1 parameter range. */
export function idleBreathValue(timestampMs: number): number {
  return (Math.sin(timestampMs / BREATH_PHASE_MILLISECONDS) + 1) / 2;
}

/** Mixes neutral, idle, pointer, and drag values in priority order. */
export class MotionMixer {
  readonly #bindings: ResolvedParameterBindings;
  readonly #random: () => number;
  #pointerX = 0;
  #pointerY = 0;
  #dragBodyX = 0;
  #blinkStartedAt: number | undefined;
  #nextBlinkAt = 0;

  constructor(options: MotionOptions) {
    this.#bindings = options.bindings;
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

  sample(timestampMs: number, reducedMotion: boolean): MixedParameters {
    const values = new Map<string, ParameterValue>();

    // Neutral values.
    this.#set(values, "breath", 0);
    this.#set(values, "eyeOpenLeft", 1);
    this.#set(values, "eyeOpenRight", 1);
    this.#set(values, "eyeX", 0);
    this.#set(values, "eyeY", 0);
    this.#set(values, "headX", 0);
    this.#set(values, "headY", 0);
    this.#set(values, "bodyX", 0);

    if (reducedMotion) {
      return values;
    }

    // Idle motion.
    this.#set(values, "breath", idleBreathValue(timestampMs));
    const eyeOpen = this.#sampleBlink(timestampMs);
    this.#set(values, "eyeOpenLeft", eyeOpen);
    this.#set(values, "eyeOpenRight", eyeOpen);

    // Pointer following overrides neutral head and eye values.
    this.#set(values, "eyeX", this.#pointerX);
    this.#set(values, "eyeY", -this.#pointerY);
    this.#set(values, "headX", this.#pointerX * 0.45);
    this.#set(values, "headY", -this.#pointerY * 0.35);

    // Drag has the highest automatic priority in the idle mixer. A model
    // animation is applied by AnimationPlayer after this map is returned.
    this.#set(values, "bodyX", this.#dragBodyX);
    return values;
  }

  #set(
    values: Map<string, ParameterValue>,
    channel: keyof ResolvedParameterBindings,
    input: number,
  ): void {
    for (const target of this.#bindings[channel]) {
      setTargetValue(values, target, input * target.scale + target.offset);
    }
  }

  #sampleBlink(timestampMs: number): number {
    if (
      this.#blinkStartedAt === undefined &&
      timestampMs >= this.#nextBlinkAt
    ) {
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

  #scheduleBlink(timestampMs: number): void {
    this.#nextBlinkAt = timestampMs + 2200 + this.#unitRandom() * 3800;
  }

  #unitRandom(): number {
    const value = this.#random();
    return Number.isFinite(value) ? clamp(value, 0, 1) : 0.5;
  }
}

function setTargetValue(
  values: Map<string, ParameterValue>,
  target: ResolvedParameterTarget,
  value: number,
): void {
  if (!target.axis) {
    values.set(target.id, value);
    return;
  }
  const current = values.get(target.id);
  const vector: [number, number] = Array.isArray(current)
    ? [current[0], current[1]]
    : [0, 0];
  vector[target.axis === "x" ? 0 : 1] = value;
  values.set(target.id, vector);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
