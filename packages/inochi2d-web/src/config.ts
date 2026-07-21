import type { ResolvedWidgetConfig, WidgetConfig } from "./types.js";

const DEFAULTS: Omit<ResolvedWidgetConfig, "model" | "fallback"> = {
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
  parameters: {
    breath: "Breath",
    eyeOpenLeft: "EyeOpenL",
    eyeOpenRight: "EyeOpenR",
    eyeX: "EyeX",
    eyeY: "EyeY",
    headX: "HeadX",
    headY: "HeadY",
    bodyX: "BodyX",
    click: "HeadZ",
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
    parameters: {
      ...DEFAULTS.parameters,
      ...config.parameters,
    },
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
