import type { WidgetConfig } from "inochi2d-web" with { "resolution-mode": "import" };

import type { HexoLike, HexoWidgetConfig, ModelAssetBundle } from "./types";

export interface EnabledConfig {
  widget: WidgetConfig;
  breakpoint: number;
  showOnMobile: boolean;
}

export function readEnabledConfig(
  hexo: HexoLike,
  modelBundle?: ModelAssetBundle,
): EnabledConfig | undefined {
  const input = hexo.config.inochi2d_widget;
  if (!input?.enable) {
    return undefined;
  }

  const root = normalizeRoot(hexo.config.root);
  const artifactUrls = resolveArtifactUrls(input, root, modelBundle);
  const breakpoint = input.mobile?.breakpoint ?? 768;
  const showOnMobile = input.mobile?.show ?? false;
  const widget = toWidgetConfig(
    input,
    artifactUrls,
    modelBundle?.suggestedParameters,
    modelBundle?.animations,
  );
  validateConfiguredAnimation(widget);
  return {
    widget,
    breakpoint,
    showOnMobile,
  };
}

function resolveArtifactUrls(
  input: HexoWidgetConfig,
  root: string,
  modelBundle?: ModelAssetBundle,
): Pick<WidgetConfig, "fallback" | "model"> {
  if (nonEmpty(input.bundle)) {
    if (!modelBundle) {
      throw new Error("inochi2d_widget.bundle could not be loaded");
    }
    if (input.publication?.confirm !== true) {
      throw new Error(
        "inochi2d_widget.publication.confirm must be true before a local model bundle is published",
      );
    }
    if (input.publication.allowRedistribution !== true) {
      throw new Error(
        "inochi2d_widget.publication.allowRedistribution must be true before a local model bundle is published",
      );
    }
    if (
      input.publication.sourceSha256?.toLowerCase() !==
      modelBundle.sourceSha256.toLowerCase()
    ) {
      throw new Error(
        "inochi2d_widget.publication.sourceSha256 must match the reviewed source model",
      );
    }
    if (!modelBundle.fallbackFile) {
      throw new Error("the Inochi2D pipeline bundle has no fallback image");
    }
    const base = `${root}${modelBundle.routePrefix}`;
    return {
      model: `${base}/${modelBundle.modelFile}`,
      fallback: `${base}/${modelBundle.fallbackFile}`,
    };
  }

  if (!nonEmpty(input.model)) {
    throw new Error("inochi2d_widget.model is required when the widget is enabled");
  }
  if (!nonEmpty(input.fallback)) {
    throw new Error("inochi2d_widget.fallback is required when the widget is enabled");
  }
  return {
    model: resolveUrl(root, input.model),
    fallback: resolveUrl(root, input.fallback),
  };
}

function toWidgetConfig(
  input: HexoWidgetConfig,
  artifactUrls: Pick<WidgetConfig, "fallback" | "model">,
  suggestedParameters?: NonNullable<WidgetConfig["parameters"]>,
  bundleAnimations?: NonNullable<WidgetConfig["animations"]>,
): WidgetConfig {
  return {
    ...artifactUrls,
    ...(input.network ? { network: input.network } : {}),
    ...(input.display ? { display: input.display } : {}),
    ...(input.render ? { render: input.render } : {}),
    ...(input.mobile ? { mobile: input.mobile } : {}),
    ...(bundleAnimations || input.animations
      ? { animations: bundleAnimations ?? input.animations }
      : {}),
    ...(suggestedParameters || input.parameters
      ? { parameters: { ...suggestedParameters, ...input.parameters } }
      : {}),
    interactions: {
      ...input.interactions,
      click: input.interactions?.click ?? { animation: "Click" },
    },
  };
}

function validateConfiguredAnimation(config: WidgetConfig): void {
  const click = config.interactions?.click;
  if (click === false) {
    return;
  }
  if (click !== undefined && (typeof click !== "object" || click === null)) {
    throw new Error(
      "inochi2d_widget.interactions.click must be false or contain an animation name",
    );
  }
  const name = click?.animation?.trim() || "Click";
  if (!config.animations?.some((animation) => animation.name === name)) {
    throw new Error(
      `inochi2d_widget.interactions.click.animation ${JSON.stringify(name)} is not present in the validated model bundle`,
    );
  }
}

export function resolveUrl(root: string, value: string): string {
  if (/^(?:[a-z]+:)?\/\//iu.test(value) || value.startsWith("data:") || value.startsWith("/")) {
    return value;
  }
  return `${normalizeRoot(root)}${value.replace(/^\.\//u, "")}`;
}

export function normalizeRoot(root: string | undefined): string {
  const value = root?.trim() || "/";
  return `/${value.replace(/^\/+|\/+$/gu, "")}/`.replace(/^\/\/$/u, "/");
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
