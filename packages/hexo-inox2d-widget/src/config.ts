import type { WidgetConfig } from "inochi2d-web" with { "resolution-mode": "import" };

import type { HexoLike, HexoWidgetConfig, ModelAssetBundle } from "./types";

const { validateInochi2DWidgetConfig } = require("inochi2d-web/config") as {
  validateInochi2DWidgetConfig(config: WidgetConfig): void;
};

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
    modelBundle?.suggestedAmbient,
    modelBundle?.animations,
    modelBundle !== undefined,
  );
  validateInochi2DWidgetConfig(widget);
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
    if (!modelBundle.localPreview && input.publication?.confirm !== true) {
      throw new Error(
        "inochi2d_widget.publication.confirm must be true before a local model bundle is published",
      );
    }
    if (
      !modelBundle.localPreview &&
      input.publication?.allowRedistribution !== true
    ) {
      throw new Error(
        "inochi2d_widget.publication.allowRedistribution must be true before a local model bundle is published",
      );
    }
    if (
      !modelBundle.localPreview &&
      input.publication?.sourceSha256?.toLowerCase() !==
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
  suggestedAmbient?: NonNullable<WidgetConfig["ambient"]>,
  bundleAnimations?: NonNullable<WidgetConfig["animations"]>,
  autoFitBundle = false,
): WidgetConfig {
  const dialogueClickEnabled =
    input.dialogue?.click !== undefined && input.dialogue.click !== false;
  const ambientAnimations =
    input.ambient?.animations ?? suggestedAmbient?.animations;
  const ambientParameters =
    input.ambient?.parameters ?? suggestedAmbient?.parameters;
  const render =
    input.render || autoFitBundle
      ? {
          ...input.render,
          ...(autoFitBundle && input.render?.autoFit === undefined
            ? { autoFit: true }
            : {}),
        }
      : undefined;
  return {
    ...artifactUrls,
    ...(input.network ? { network: input.network } : {}),
    ...(input.display ? { display: input.display } : {}),
    ...(render ? { render } : {}),
    ...(input.mobile ? { mobile: input.mobile } : {}),
    ...(bundleAnimations || input.animations
      ? { animations: bundleAnimations ?? input.animations }
      : {}),
    ...(ambientAnimations !== undefined || ambientParameters !== undefined
      ? {
          ambient: {
            ...(ambientAnimations !== undefined
              ? { animations: ambientAnimations }
              : {}),
            ...(ambientParameters !== undefined
              ? { parameters: ambientParameters }
              : {}),
          },
        }
      : {}),
    ...(input.dialogue ? { dialogue: input.dialogue } : {}),
    ...(suggestedParameters || input.parameters
      ? { parameters: { ...suggestedParameters, ...input.parameters } }
      : {}),
    interactions: {
      ...input.interactions,
      click:
        input.interactions?.click ??
        (dialogueClickEnabled ? false : { animation: "Click" }),
    },
  };
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
