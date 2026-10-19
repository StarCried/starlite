import { resolveDialogueSentences } from "./dialogue.js";
import { validatePerformanceConfig } from "./performance.js";
import type {
  AmbientParameterOscillatorConfig,
  AnimationClip,
  AnimationInterpolation,
  DialogueConfig,
  DialogueSceneConfig,
  EnterDialogueSceneConfig,
  IdleDialogueSceneConfig,
  ParameterBinding,
  ParameterIds,
  ResolvedDialogueScene,
  ResolvedEnterDialogueScene,
  ResolvedIdleDialogueScene,
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
  performance: { show: false },
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
    autoFit: false,
    fitPadding: 0.9,
  },
  mobile: {
    show: false,
    breakpoint: 768,
  },
  ambient: {
    animations: [],
    parameters: [],
  },
  dialogue: {
    enter: false,
    idle: false,
    click: false,
  },
  interactions: {
    pointer: true,
    passThrough: false,
    click: false,
    drag: true,
    dragModelUnitsPerPixel: 4,
  },
};

export function resolveConfig(config: WidgetConfig): ResolvedWidgetConfig {
  if (typeof config !== "object" || config === null || Array.isArray(config)) {
    throw new Error("widget config must be an object");
  }
  validatePerformanceConfig(config.performance);
  for (const field of [
    "network",
    "display",
    "render",
    "mobile",
    "interactions",
    "parameters",
  ] as const) {
    assertOptionalRecord(config[field], field);
  }
  if (typeof config.model !== "string" || config.model.trim().length === 0) {
    throw new Error("model URL must not be empty");
  }
  if (
    typeof config.fallback !== "string" ||
    config.fallback.trim().length === 0
  ) {
    throw new Error("fallback URL must not be empty");
  }
  const animations = resolveAnimations(config.animations);
  const ambient = resolveAmbient(config.ambient, animations);
  const dialogue = resolveDialogue(config.dialogue, animations);
  const click = resolveClick(config.interactions?.click, animations);
  const passThrough = booleanValue(config.interactions?.passThrough, false, "interactions.passThrough");
  const drag = booleanValue(config.interactions?.drag, passThrough ? false : DEFAULTS.interactions.drag, "interactions.drag");
  if (passThrough && drag) throw new Error("interactions.passThrough cannot be combined with interactions.drag");
  if (
    click &&
    dialogue.click &&
    click.animation !== dialogue.click.animation
  ) {
    throw new Error(
      "interactions.click.animation and dialogue.click.animation must match when both are enabled",
    );
  }

  return {
    model: config.model,
    fallback: config.fallback,
    performance: { show: config.performance?.show ?? false },
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
      autoFit: booleanValue(
        config.render?.autoFit,
        DEFAULTS.render.autoFit,
        "render.autoFit",
      ),
      fitPadding: bounded(
        config.render?.fitPadding,
        DEFAULTS.render.fitPadding,
        0.1,
        1,
        "render.fitPadding",
      ),
    },
    mobile: {
      show: booleanValue(
        config.mobile?.show,
        DEFAULTS.mobile.show,
        "mobile.show",
      ),
      breakpoint: positive(
        config.mobile?.breakpoint,
        DEFAULTS.mobile.breakpoint,
        "mobile.breakpoint",
      ),
    },
    animations,
    ambient,
    dialogue,
    parameters: resolveParameterBindings(config.parameters),
    interactions: {
      pointer: booleanValue(
        config.interactions?.pointer,
        DEFAULTS.interactions.pointer,
        "interactions.pointer",
      ),
      click,
      passThrough,
      drag,
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

/**
 * Validates a complete widget configuration without retaining its resolved
 * representation. This pure entry point is safe for build-time adapters.
 */
export function validateInochi2DWidgetConfig(config: WidgetConfig): void {
  resolveConfig(config);
}

function resolveAmbient(
  input: WidgetConfig["ambient"],
  animations: ReadonlyMap<string, AnimationClip>,
): ResolvedWidgetConfig["ambient"] {
  if (input === undefined) {
    return DEFAULTS.ambient;
  }
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("ambient must be an animation configuration");
  }
  const names = input.animations ?? [];
  if (!Array.isArray(names) || names.length > 8) {
    throw new Error("ambient.animations must contain at most 8 names");
  }

  const resolved: string[] = [];
  const nameSet = new Set<string>();
  const targets: Array<{ id: string; axis?: "x" | "y" }> = [];
  for (const [index, value] of names.entries()) {
    const field = `ambient.animations[${index}]`;
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error(`${field} must be a non-empty animation name`);
    }
    const name = value.trim();
    if (nameSet.has(name)) {
      throw new Error(`${field} duplicates animation ${JSON.stringify(name)}`);
    }
    const clip = animations.get(name);
    if (!clip) {
      throw new Error(
        `${field} ${JSON.stringify(name)} is not present in the validated model animations`,
      );
    }
    const loopBegin = hasLeadIn(clip) ? clip.leadIn : 0;
    const loopEnd = hasLeadOut(clip) ? clip.leadOut : clip.length;
    if (loopEnd <= loopBegin) {
      throw new Error(
        `${field} has an invalid Creator loop range ${loopBegin}..${loopEnd}`,
      );
    }
    for (const lane of clip.lanes) {
      const target = {
        id: lane.parameter,
        ...(lane.axis ? { axis: lane.axis } : {}),
      };
      if (targets.some((existing) => ambientTargetsOverlap(existing, target))) {
        throw new Error(
          `${field} overlaps another ambient animation on ${JSON.stringify(lane.parameter)}${lane.axis ? ` axis ${lane.axis}` : ""}`,
        );
      }
      targets.push(target);
    }
    nameSet.add(name);
    resolved.push(name);
  }

  const parameters = input.parameters ?? [];
  if (!Array.isArray(parameters) || parameters.length > 16) {
    throw new Error("ambient.parameters must contain at most 16 oscillators");
  }
  const resolvedParameters = parameters.map((value, index) =>
    resolveAmbientParameter(value, index, targets),
  );
  return { animations: resolved, parameters: resolvedParameters };
}

function resolveAmbientParameter(
  input: AmbientParameterOscillatorConfig,
  index: number,
  targets: Array<{ id: string; axis?: "x" | "y" }>,
): ResolvedWidgetConfig["ambient"]["parameters"][number] {
  const field = `ambient.parameters[${index}]`;
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error(`${field} must be a parameter oscillator`);
  }
  const id = typeof input.id === "string" ? input.id.trim() : "";
  if (id.length === 0 || new TextEncoder().encode(id).byteLength > 256) {
    throw new Error(`${field}.id must contain 1..=256 UTF-8 bytes`);
  }
  if (input.axis !== undefined && input.axis !== "x" && input.axis !== "y") {
    throw new Error(`${field}.axis must be x or y`);
  }
  finiteRange(input.minimum, -1_000, 1_000, `${field}.minimum`);
  finiteRange(input.maximum, -1_000, 1_000, `${field}.maximum`);
  if (input.maximum <= input.minimum) {
    throw new Error(`${field}.maximum must be greater than minimum`);
  }
  finiteRange(input.periodMs, 500, 120_000, `${field}.periodMs`);
  const phase = input.phase ?? 0;
  finiteRange(phase, 0, 1, `${field}.phase`);
  const target = { id, ...(input.axis ? { axis: input.axis } : {}) };
  if (targets.some((existing) => ambientTargetsOverlap(existing, target))) {
    throw new Error(
      `${field} overlaps another ambient source on ${JSON.stringify(id)}${input.axis ? ` axis ${input.axis}` : ""}`,
    );
  }
  targets.push(target);
  return {
    id,
    ...(input.axis ? { axis: input.axis } : {}),
    minimum: input.minimum,
    maximum: input.maximum,
    periodMs: input.periodMs,
    phase,
  };
}

function ambientTargetsOverlap(
  left: { id: string; axis?: "x" | "y" },
  right: { id: string; axis?: "x" | "y" },
): boolean {
  return (
    left.id === right.id &&
    (left.axis === undefined ||
      right.axis === undefined ||
      left.axis === right.axis)
  );
}

function resolveDialogue(
  input: DialogueConfig | undefined,
  animations: ReadonlyMap<string, AnimationClip>,
): ResolvedWidgetConfig["dialogue"] {
  if (input === undefined) {
    return DEFAULTS.dialogue;
  }
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("dialogue must be a scene configuration");
  }
  const enter = resolveDialogueScene(
    input.enter,
    "dialogue.enter",
    animations,
  );
  const idle = resolveDialogueScene(
    input.idle,
    "dialogue.idle",
    animations,
  );
  const click = resolveDialogueScene(
    input.click,
    "dialogue.click",
    animations,
  );
  return {
    enter:
      enter &&
      ({
        ...enter,
        delayMs: bounded(
          (input.enter as EnterDialogueSceneConfig).delayMs,
          0,
          0,
          120_000,
          "dialogue.enter.delayMs",
        ),
      } satisfies ResolvedEnterDialogueScene),
    idle:
      idle &&
      resolveIdleDialogueScene(
        idle,
        input.idle as IdleDialogueSceneConfig,
      ),
    click,
  };
}

function resolveDialogueScene(
  input: false | DialogueSceneConfig | undefined,
  field: string,
  animations: ReadonlyMap<string, AnimationClip>,
): false | ResolvedDialogueScene {
  if (input === false || input === undefined) {
    return false;
  }
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error(`${field} must be false or a scene configuration`);
  }
  const animation =
    typeof input.animation === "string" ? input.animation.trim() : "";
  if (!animation) {
    throw new Error(`${field}.animation must not be empty`);
  }
  if (!animations.has(animation)) {
    throw new Error(
      `${field}.animation ${JSON.stringify(animation)} is not present in the validated model animations`,
    );
  }
  if (input.animations !== undefined && (!Array.isArray(input.animations) || input.animations.length < 1 || input.animations.length > 20 || new Set(input.animations).size !== input.animations.length || input.animations.some(name => typeof name !== "string" || !animations.has(name)))) {
    throw new Error(`${field}.animations must contain 1..=20 distinct validated animation names`);
  }
  const sentences = resolveDialogueSentences(input, input.animations ?? [animation], field);
  return {
    animation,
    ...(input.animations ? { animations: [...input.animations] } : {}),
    ...sentences,
    durationMs: bounded(
      input.durationMs,
      5_000,
      500,
      60_000,
      `${field}.durationMs`,
    ),
  };
}

function resolveIdleDialogueScene(
  scene: ResolvedDialogueScene,
  input: IdleDialogueSceneConfig,
): ResolvedIdleDialogueScene {
  const intervalMinMs = bounded(
    input.intervalMinMs,
    30_000,
    5_000,
    3_600_000,
    "dialogue.idle.intervalMinMs",
  );
  const intervalMaxMs = bounded(
    input.intervalMaxMs,
    60_000,
    5_000,
    3_600_000,
    "dialogue.idle.intervalMaxMs",
  );
  if (intervalMaxMs < intervalMinMs) {
    throw new Error(
      "dialogue.idle.intervalMaxMs must be greater than or equal to intervalMinMs",
    );
  }
  return { ...scene, intervalMinMs, intervalMaxMs };
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

function hasLeadIn(clip: AnimationClip): boolean {
  return clip.leadIn > 0 && clip.leadIn + 1 < clip.length;
}

function hasLeadOut(clip: AnimationClip): boolean {
  return clip.leadOut > 0 && clip.leadOut + 1 < clip.length;
}

function resolveAnimations(
  input: readonly AnimationClip[] | undefined,
): ReadonlyMap<string, AnimationClip> {
  const clips = input ?? [];
  if (!Array.isArray(clips) || clips.length > 64) {
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
  const target =
    typeof input === "string"
      ? { id: input }
      : typeof input === "object" && input !== null && !Array.isArray(input)
        ? input
        : undefined;
  if (!target || typeof target.id !== "string") {
    throw new Error(`parameters.${field}.id must be a string`);
  }
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

function booleanValue(
  value: boolean | undefined,
  fallback: boolean,
  field: string,
): boolean {
  const resolved = value ?? fallback;
  if (typeof resolved !== "boolean") {
    throw new Error(`${field} must be a boolean`);
  }
  return resolved;
}

function assertOptionalRecord(value: unknown, field: string): void {
  if (
    value !== undefined &&
    (typeof value !== "object" || value === null || Array.isArray(value))
  ) {
    throw new Error(`${field} must be an object`);
  }
}
