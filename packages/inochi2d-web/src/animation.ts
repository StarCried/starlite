import type {
  AnimationClip,
  AnimationKeyframe,
  AnimationLane,
  AnimationPlaybackOptions,
  AnimationPlaybackResult,
} from "./types.js";

export type AnimatedParameterValue = number | readonly [number, number];
export type AnimatedParameterMap = Map<string, AnimatedParameterValue>;

interface ActiveAnimation {
  clip: AnimationClip;
  startedAt: number;
  mode: "once" | "loop";
  result: Promise<AnimationPlaybackResult>;
  resolve(result: AnimationPlaybackResult): void;
}

/**
 * Mixes validated model-authored ambient loops with one foreground animation.
 *
 * Ambient lanes are applied after idle/pointer motion. The foreground clip is
 * applied last, so an enter/idle/click action temporarily owns overlapping
 * lanes and the current loop phase becomes visible again when the action ends.
 */
export class AnimationPlayer {
  readonly #clips: ReadonlyMap<string, AnimationClip>;
  readonly #loops: readonly AnimationClip[];
  #loopsStartedAt: number | undefined;
  #active: ActiveAnimation | undefined;
  readonly #restore = new Set<AnimationClip>();

  constructor(
    clips: ReadonlyMap<string, AnimationClip>,
    loopNames: readonly string[] = [],
  ) {
    this.#clips = clips;
    this.#loops = loopNames.map((name) => {
      const clip = clips.get(name);
      if (!clip) {
        throw new Error(`ambient animation ${JSON.stringify(name)} is unavailable`);
      }
      return clip;
    });
  }

  trigger(
    name: string,
    timestampMs: number,
    options: AnimationPlaybackOptions = {},
  ): Promise<AnimationPlaybackResult> {
    const clip = this.#clips.get(name);
    if (!clip) {
      throw new Error(`animation ${JSON.stringify(name)} is unavailable`);
    }
    const mode = options.mode ?? "once";
    if (
      this.#active?.clip === clip &&
      this.#active.mode === mode &&
      options.restart === false
    ) {
      return this.#active.result;
    }
    this.#finishActive("interrupted");
    let settle!: (result: AnimationPlaybackResult) => void;
    const result = new Promise<AnimationPlaybackResult>((resolve) => {
      settle = resolve;
    });
    this.#active = {
      clip,
      startedAt: Number.isFinite(timestampMs) ? timestampMs : 0,
      mode,
      result,
      resolve: settle,
    };
    return result;
  }

  stop(): void {
    this.#finishActive("stopped");
  }

  isActive(timestampMs: number): boolean {
    return (
      this.#active !== undefined &&
      (this.#active.mode === "loop" ||
        Math.max(0, timestampMs - this.#active.startedAt) <
          animationDurationMs(this.#active.clip))
    );
  }

  apply(
    values: AnimatedParameterMap,
    timestampMs: number,
    reducedMotion: boolean,
  ): void {
    if (reducedMotion) {
      this.#restoreLoopDefaults(values);
      this.#finishActive("stopped");
      this.#restoreDefaults(values);
      return;
    }

    this.#restoreDefaults(values);
    this.#applyLoops(values, timestampMs);
    if (!this.#active) {
      return;
    }

    const elapsed = Math.max(0, timestampMs - this.#active.startedAt);
    const duration = animationDurationMs(this.#active.clip);
    const frame =
      this.#active.mode === "loop"
        ? loopFrame(this.#active.clip, elapsed)
        : Math.min(
            this.#active.clip.length,
            elapsed / this.#active.clip.timestepMs,
          );
    for (const lane of this.#active.clip.lanes) {
      setLaneValue(values, lane, sampleLane(lane, frame));
    }
    if (this.#active.mode === "once" && elapsed >= duration) {
      this.#finishActive("completed");
    }
  }

  #finishActive(result: AnimationPlaybackResult): void {
    const active = this.#active;
    if (!active) {
      return;
    }
    this.#restore.add(active.clip);
    this.#active = undefined;
    active.resolve(result);
  }

  #applyLoops(values: AnimatedParameterMap, timestampMs: number): void {
    if (this.#loops.length === 0) {
      return;
    }
    this.#loopsStartedAt ??= timestampMs;
    const elapsed = Math.max(0, timestampMs - this.#loopsStartedAt);
    for (const clip of this.#loops) {
      const frame = loopFrame(clip, elapsed);
      for (const lane of clip.lanes) {
        setLaneValue(values, lane, sampleLane(lane, frame));
      }
    }
  }

  #restoreLoopDefaults(values: AnimatedParameterMap): void {
    if (this.#loopsStartedAt === undefined) {
      return;
    }
    for (const clip of this.#loops) {
      for (const lane of clip.lanes) {
        if (!values.has(lane.parameter)) {
          setLaneValue(values, lane, laneDefaultValue(lane));
        }
      }
    }
    this.#loopsStartedAt = undefined;
  }

  #restoreDefaults(values: AnimatedParameterMap): void {
    if (this.#restore.size === 0) {
      return;
    }
    for (const clip of this.#restore) {
      for (const lane of clip.lanes) {
        // Existing automatic/manual motion is the new source of truth. Restore
        // only lanes that would otherwise retain the interrupted animation.
        if (!values.has(lane.parameter)) {
          setLaneValue(values, lane, laneDefaultValue(lane));
        }
      }
    }
    this.#restore.clear();
  }
}

/** Samples Creator's lead-in/lead-out loop region for an elapsed time. */
export function loopFrame(clip: AnimationClip, elapsedMs: number): number {
  const rawFrame = Math.max(0, elapsedMs) / clip.timestepMs;
  const begin = hasLeadIn(clip) ? clip.leadIn : 0;
  const end = hasLeadOut(clip) ? clip.leadOut : clip.length;
  if (rawFrame < end) {
    return rawFrame;
  }
  return begin + ((rawFrame - begin) % (end - begin));
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

export function animationDurationMs(clip: AnimationClip): number {
  return clip.length * clip.timestepMs;
}

function hasLeadIn(clip: AnimationClip): boolean {
  return clip.leadIn > 0 && clip.leadIn + 1 < clip.length;
}

function hasLeadOut(clip: AnimationClip): boolean {
  return clip.leadOut > 0 && clip.leadOut + 1 < clip.length;
}

function mix(left: number, right: number, progress: number): number {
  return left + (right - left) * progress;
}
