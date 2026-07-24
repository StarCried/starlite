import type {
  AnimationClip,
  AnimationInterpolation,
  ParameterBinding,
  ParameterIds,
  ResolvedParameterBindings,
  ResolvedParameterTarget,
  ResolvedWidgetConfig,
  WidgetConfig,
} from "./types.js";

const DEFAULT_PARAMETER_IDS: { [Channel in keyof ParameterIds]: string } = {
  breath: "Breath",
  eyeOpenLeft: "EyeOpenL",
  eyeOpenRight: "EyeOpenR",
  eyeX: "EyeX",
  eyeY: "EyeY",
  headX: "HeadX",
  headY: "HeadY",
  bodyX: "BodyX",
};

const DEFAULTS: Omit<
  ResolvedWidgetConfig,
  "model" | "fallback" | "parameters" | "animations"
> = {
  network: {
    requestTimeoutMs: 30_000,
    modelMaxBytes: 16 * 1024 * 1024,
  },
  display: {
    width: 260,
    height: 360,
  },
  render: {
    fps: 30,
    maxDevicePixelRatio: 1.25,
    initialScale: 0.15,
  },
  mobile: {
    show: false,
    breakpoint: 768,
  },
  interactions: {
    pointer: true,
    click: false,
    drag: true,
    dragModelUnitsPerPixel: 4,
  },
};

export function resolveConfig(config: WidgetConfig): ResolvedWidgetConfig {
  if (config.model.trim().length === 0) {
    throw new Error("model URL must not be empty");
  }
  if (config.fallback.trim().length === 0) {
    throw new Error("fallback URL must not be empty");
  }
  const animations = resolveAnimations(config.animations);
  const click = resolveClick(config.interactions?.click, animations);

  return {
    model: config.model,
    fallback: config.fallback,
    network: {
      requestTimeoutMs: bounded(
        config.network?.requestTimeoutMs,
        DEFAULTS.network.requestTimeoutMs,
        1_000,
        120_000,
        "network.requestTimeoutMs",
      ),
      modelMaxBytes: bounded(
        config.network?.modelMaxBytes,
        DEFAULTS.network.modelMaxBytes,
        1,
        64 * 1024 * 1024,
        "network.modelMaxBytes",
      ),
    },
    display: {
      width: positive(config.display?.width, DEFAULTS.display.width, "display.width"),
      height: positive(config.display?.height, DEFAULTS.display.height, "display.height"),
    },
    render: {
      fps: bounded(config.render?.fps, DEFAULTS.render.fps, 1, 60, "render.fps"),
      maxDevicePixelRatio: bounded(
        config.render?.maxDevicePixelRatio,
        DEFAULTS.render.maxDevicePixelRatio,
        0.5,
        3,
        "render.maxDevicePixelRatio",
      ),
      initialScale: positive(
        config.render?.initialScale,
        DEFAULTS.render.initialScale,
        "render.initialScale",
      ),
    },
    mobile: {
      show: config.mobile?.show ?? DEFAULTS.mobile.show,
      breakpoint: positive(
        config.mobile?.breakpoint,
        DEFAULTS.mobile.breakpoint,
        "mobile.breakpoint",
      ),
    },
    animations,
    parameters: resolveParameterBindings(config.parameters),
    interactions: {
      pointer: config.interactions?.pointer ?? DEFAULTS.interactions.pointer,
      click,
      drag: config.interactions?.drag ?? DEFAULTS.interactions.drag,
      dragModelUnitsPerPixel: bounded(
        config.interactions?.dragModelUnitsPerPixel,
        DEFAULTS.interactions.dragModelUnitsPerPixel,
        0.01,
        100,
        "interactions.dragModelUnitsPerPixel",
      ),
    },
  };
}

function resolveClick(
  input: false | { animation?: string } | undefined,
  animations: ReadonlyMap<string, AnimationClip>,
): false | { animation: string } {
  const resolved = input ?? DEFAULTS.interactions.click;
  if (resolved === false) {
    return false;
  }
  if (typeof resolved !== "object" || resolved === null || Array.isArray(resolved)) {
    throw new Error("interactions.click must be false or an animation configuration");
  }
  const animation = resolved.animation?.trim();
  if (!animation) {
    throw new Error("interactions.click.animation must not be empty");
  }
  if (!animations.has(animation)) {
    throw new Error(
      `interactions.click.animation ${JSON.stringify(animation)} is not present in the validated model animations`,
    );
  }
  return { animation };
}

function resolveAnimations(
  input: readonly AnimationClip[] | undefined,
): ReadonlyMap<string, AnimationClip> {
  const clips = input ?? [];
  if (clips.length > 64) {
    throw new Error("animations must contain at most 64 clips");
  }
  const result = new Map<string, AnimationClip>();
  for (const [clipIndex, clip] of clips.entries()) {
    const field = `animations[${clipIndex}]`;
    if (
      typeof clip !== "object" ||
      clip === null ||
      typeof clip.name !== "string" ||
      clip.name.trim().length === 0 ||
      new TextEncoder().encode(clip.name).byteLength > 128
    ) {
      throw new Error(`${field}.name must contain 1..=128 UTF-8 bytes`);
    }
    if (result.has(clip.name)) {
      throw new Error(`${field}.name is duplicated`);
    }
    finiteRange(clip.timestepMs, Number.MIN_VALUE, 1_000, `${field}.timestepMs`);
    integerRange(clip.length, 1, 18_000, `${field}.length`);
    integerRange(clip.leadIn, -1, clip.length, `${field}.leadIn`);
    integerRange(clip.leadOut, -1, clip.length, `${field}.leadOut`);
    if (clip.weight !== 1) {
      throw new Error(`${field}.weight must be 1 for forced alpha playback`);
    }
    if (!Array.isArray(clip.lanes) || clip.lanes.length < 1 || clip.lanes.length > 128) {
      throw new Error(`${field}.lanes must contain 1..=128 lanes`);
    }

    const targets = new Set<string>();
    let keyframeCount = 0;
    for (const [laneIndex, lane] of clip.lanes.entries()) {
      const laneField = `${field}.lanes[${laneIndex}]`;
      if (
        typeof lane.parameter !== "string" ||
        lane.parameter.trim().length === 0
      ) {
        throw new Error(`${laneField}.parameter must not be empty`);
      }
      if (lane.axis !== undefined && lane.axis !== "x" && lane.axis !== "y") {
        throw new Error(`${laneField}.axis must be x or y`);
      }
      if (!isAnimationInterpolation(lane.interpolation)) {
        throw new Error(`${laneField}.interpolation is unsupported`);
      }
      if (
        !Array.isArray(lane.defaultValues) ||
        lane.defaultValues.length !== 2
      ) {
        throw new Error(`${laneField}.defaultValues must contain two entries`);
      }
      for (const [axis, value] of lane.defaultValues.entries()) {
        finiteRange(
          value,
          -Number.MAX_VALUE,
          Number.MAX_VALUE,
          `${laneField}.defaultValues[${axis}]`,
        );
      }
      const target = `${lane.parameter}\0${lane.axis ?? ""}`;
      if (targets.has(target)) {
        throw new Error(`${laneField} duplicates another parameter target`);
      }
      targets.add(target);
      if (
        !Array.isArray(lane.keyframes) ||
        lane.keyframes.length < 2
      ) {
        throw new Error(`${laneField}.keyframes must contain at least two entries`);
      }
      keyframeCount += lane.keyframes.length;
      if (keyframeCount > 4_096) {
        throw new Error(`${field} contains more than 4096 keyframes`);
      }
      let previousFrame = -1;
      for (const [keyframeIndex, keyframe] of lane.keyframes.entries()) {
        const keyframeField = `${laneField}.keyframes[${keyframeIndex}]`;
        integerRange(keyframe.frame, 0, clip.length, `${keyframeField}.frame`);
        if (keyframe.frame <= previousFrame) {
          throw new Error(`${laneField}.keyframes must be strictly increasing`);
        }
        finiteRange(
          keyframe.value,
          -Number.MAX_VALUE,
          Number.MAX_VALUE,
          `${keyframeField}.value`,
        );
        finiteRange(
          keyframe.tension,
          -Number.MAX_VALUE,
          Number.MAX_VALUE,
          `${keyframeField}.tension`,
        );
        previousFrame = keyframe.frame;
      }
    }
    result.set(clip.name, clip);
  }
  return result;
}

function isAnimationInterpolation(
  input: unknown,
): input is AnimationInterpolation {
  return (
    input === "nearest" ||
    input === "stepped" ||
    input === "linear" ||
    input === "cubic"
  );
}

function integerRange(
  value: number,
  minimum: number,
  maximum: number,
  field: string,
): void {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${field} must be a safe integer`);
  }
  finiteRange(value, minimum, maximum, field);
}

function finiteRange(
  value: number,
  minimum: number,
  maximum: number,
  field: string,
): void {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${field} must be between ${minimum} and ${maximum}`);
  }
}

function resolveParameterBindings(
  input: Partial<ParameterIds> | undefined,
): ResolvedParameterBindings {
  return Object.fromEntries(
    Object.entries(DEFAULT_PARAMETER_IDS).map(([channel, fallback]) => [
      channel,
      normalizeParameterBinding(input?.[channel as keyof ParameterIds], fallback, channel),
    ]),
  ) as ResolvedParameterBindings;
}

function normalizeParameterBinding(
  input: ParameterBinding | undefined,
  fallback: string,
  field: string,
): readonly ResolvedParameterTarget[] {
  if (input === null) {
    return [];
  }
  const entries = Array.isArray(input) ? input : [input ?? fallback];
  return entries.map((entry, index) => normalizeParameterTarget(entry, `${field}[${index}]`));
}

function normalizeParameterTarget(
  input: string | import("./types.js").ParameterTarget,
  field: string,
): ResolvedParameterTarget {
  const target = typeof input === "string" ? { id: input } : input;
  const id = target.id.trim();
  if (id.length === 0) {
    throw new Error(`parameters.${field}.id must not be empty`);
  }
  const scale = target.scale ?? 1;
  const offset = target.offset ?? 0;
  if (!Number.isFinite(scale) || !Number.isFinite(offset)) {
    throw new Error(`parameters.${field} scale and offset must be finite`);
  }
  if (target.axis !== undefined && target.axis !== "x" && target.axis !== "y") {
    throw new Error(`parameters.${field}.axis must be x or y`);
  }
  return {
    id,
    ...(target.axis ? { axis: target.axis } : {}),
    scale,
    offset,
  };
}

function positive(value: number | undefined, fallback: number, field: string): number {
  return bounded(value, fallback, Number.MIN_VALUE, Number.MAX_VALUE, field);
}

function bounded(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  field: string,
): number {
  const resolved = value ?? fallback;
  if (!Number.isFinite(resolved) || resolved < minimum || resolved > maximum) {
    throw new Error(`${field} must be between ${minimum} and ${maximum}`);
  }
  return resolved;
}
