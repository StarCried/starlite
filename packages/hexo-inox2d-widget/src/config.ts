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
  const artifactUrls = resolveArtifactUrls(hexo, input, root, modelBundle);
  if (!artifactUrls) {
    return undefined;
  }
  const breakpoint = input.mobile?.breakpoint ?? 768;
  const showOnMobile = input.mobile?.show ?? false;
  return {
    widget: toWidgetConfig(input, artifactUrls, modelBundle?.suggestedParameters),
    breakpoint,
    showOnMobile,
  };
}

function resolveArtifactUrls(
  hexo: HexoLike,
  input: HexoWidgetConfig,
  root: string,
  modelBundle?: ModelAssetBundle,
): Pick<WidgetConfig, "fallback" | "model"> | undefined {
  if (nonEmpty(input.bundle)) {
    if (!modelBundle) {
      hexo.log.warn("inochi2d_widget.bundle could not be loaded");
      return undefined;
    }
    if (input.publication?.confirm !== true) {
      hexo.log.warn(
        "inochi2d_widget.publication.confirm must be true before a local model bundle is published",
      );
      return undefined;
    }
    if (input.publication.allowRedistribution !== true) {
      hexo.log.warn(
        "inochi2d_widget.publication.allowRedistribution must be true before a local model bundle is published",
      );
      return undefined;
    }
    if (
      input.publication.sourceSha256?.toLowerCase() !==
      modelBundle.sourceSha256.toLowerCase()
    ) {
      hexo.log.warn(
        "inochi2d_widget.publication.sourceSha256 must match the reviewed source model",
      );
      return undefined;
    }
    if (!modelBundle.fallbackFile) {
      hexo.log.warn("the Inochi2D pipeline bundle has no fallback image");
      return undefined;
    }
    const base = `${root}${modelBundle.routePrefix}`;
    return {
      model: `${base}/${modelBundle.modelFile}`,
      fallback: `${base}/${modelBundle.fallbackFile}`,
    };
  }

  if (!nonEmpty(input.model)) {
    hexo.log.warn("inochi2d_widget.model is required when the widget is enabled");
    return undefined;
  }
  if (!nonEmpty(input.fallback)) {
    hexo.log.warn("inochi2d_widget.fallback is required when the widget is enabled");
    return undefined;
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
): WidgetConfig {
  return {
    ...artifactUrls,
    ...(input.network ? { network: input.network } : {}),
    ...(input.display ? { display: input.display } : {}),
    ...(input.render ? { render: input.render } : {}),
    ...(input.mobile ? { mobile: input.mobile } : {}),
    ...(suggestedParameters || input.parameters
      ? { parameters: { ...suggestedParameters, ...input.parameters } }
      : {}),
    ...(input.interactions ? { interactions: input.interactions } : {}),
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
