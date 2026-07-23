import type {
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
  click: "HeadZ",
};

const DEFAULTS: Omit<ResolvedWidgetConfig, "model" | "fallback" | "parameters"> = {
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
    click: true,
    drag: true,
    clickAmplitude: 0.35,
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
    parameters: resolveParameterBindings(config.parameters),
    interactions: {
      pointer: config.interactions?.pointer ?? DEFAULTS.interactions.pointer,
      click: config.interactions?.click ?? DEFAULTS.interactions.click,
      drag: config.interactions?.drag ?? DEFAULTS.interactions.drag,
      clickAmplitude: bounded(
        config.interactions?.clickAmplitude,
        DEFAULTS.interactions.clickAmplitude,
        0,
        2,
        "interactions.clickAmplitude",
      ),
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
