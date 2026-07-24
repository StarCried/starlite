import type {
  AnimationClip,
  AnimationKeyframe,
  AnimationLane,
} from "./types.js";

export type AnimatedParameterValue = number | readonly [number, number];
export type AnimatedParameterMap = Map<string, AnimatedParameterValue>;

interface ActiveAnimation {
  clip: AnimationClip;
  startedAt: number;
}

/**
 * Plays one validated, model-authored animation at a time.
 *
 * Animation lanes are applied after idle/pointer motion, so a click clip has
 * deterministic priority without teaching the renderer about Creator's
 * animation format.
 */
export class AnimationPlayer {
  readonly #clips: ReadonlyMap<string, AnimationClip>;
  #active: ActiveAnimation | undefined;
  #restore: AnimationClip | undefined;

  constructor(clips: ReadonlyMap<string, AnimationClip>) {
    this.#clips = clips;
  }

  trigger(name: string, timestampMs: number): void {
    const clip = this.#clips.get(name);
    if (!clip) {
      throw new Error(`animation ${JSON.stringify(name)} is unavailable`);
    }
    this.#active = { clip, startedAt: timestampMs };
    this.#restore = undefined;
  }

  apply(
    values: AnimatedParameterMap,
    timestampMs: number,
    reducedMotion: boolean,
  ): void {
    if (reducedMotion) {
      if (this.#active) {
        this.#restore = this.#active.clip;
      }
      this.#active = undefined;
      this.#restoreDefaults(values);
      return;
    }
    if (!this.#active) {
      this.#restoreDefaults(values);
      return;
    }

    const elapsed = Math.max(0, timestampMs - this.#active.startedAt);
    const duration = this.#active.clip.length * this.#active.clip.timestepMs;
    const frame = Math.min(
      this.#active.clip.length,
      elapsed / this.#active.clip.timestepMs,
    );
    for (const lane of this.#active.clip.lanes) {
      setLaneValue(values, lane, sampleLane(lane, frame));
    }
    if (elapsed >= duration) {
      this.#restore = this.#active.clip;
      this.#active = undefined;
    }
  }

  #restoreDefaults(values: AnimatedParameterMap): void {
    if (!this.#restore) {
      return;
    }
    for (const lane of this.#restore.lanes) {
      // Existing automatic/manual motion is the new source of truth. Restore
      // only lanes that would otherwise retain the final animation value.
      if (!values.has(lane.parameter)) {
        setLaneValue(values, lane, laneDefaultValue(lane));
      }
    }
    this.#restore = undefined;
  }
}

export function sampleLane(lane: AnimationLane, frame: number): number {
  const keyframes = lane.keyframes;
  const first = keyframes[0]!;
  if (frame <= first.frame) {
    return first.value;
  }
  const final = keyframes[keyframes.length - 1]!;
  if (frame >= final.frame) {
    return final.value;
  }

  let rightIndex = 1;
  while (keyframes[rightIndex]!.frame < frame) {
    rightIndex += 1;
  }
  const leftIndex = rightIndex - 1;
  const left = keyframes[leftIndex]!;
  const right = keyframes[rightIndex]!;
  const progress = (frame - left.frame) / (right.frame - left.frame);
  switch (lane.interpolation) {
    case "nearest":
      return progress > 0.5 ? right.value : left.value;
    case "stepped":
      return left.value;
    case "linear":
      return mix(left.value, right.value, progress);
    case "cubic":
      return cubicValue(keyframes, leftIndex, rightIndex, progress);
  }
}

function cubicValue(
  keyframes: readonly AnimationKeyframe[],
  leftIndex: number,
  rightIndex: number,
  progress: number,
): number {
  const previous = keyframes[Math.max(0, leftIndex - 1)]!.value;
  const current = keyframes[leftIndex]!.value;
  const next = keyframes[rightIndex]!.value;
  const following =
    keyframes[Math.min(keyframes.length - 1, rightIndex + 1)]!.value;
  const squared = progress * progress;
  const cubed = squared * progress;
  const a = -0.5 * previous + 1.5 * current - 1.5 * next + 0.5 * following;
  const b = previous - 2.5 * current + 2 * next - 0.5 * following;
  const c = -0.5 * previous + 0.5 * next;
  return a * cubed + b * squared + c * progress + current;
}

function setLaneValue(
  values: AnimatedParameterMap,
  lane: AnimationLane,
  value: number,
): void {
  if (!lane.axis) {
    values.set(lane.parameter, value);
    return;
  }
  const current = values.get(lane.parameter);
  const vector: [number, number] = Array.isArray(current)
    ? [current[0], current[1]]
    : [lane.defaultValues[0], lane.defaultValues[1]];
  vector[lane.axis === "x" ? 0 : 1] = value;
  values.set(lane.parameter, vector);
}

function laneDefaultValue(lane: AnimationLane): number {
  return lane.defaultValues[lane.axis === "y" ? 1 : 0];
}

function mix(left: number, right: number, progress: number): number {
  return left + (right - left) * progress;
}
