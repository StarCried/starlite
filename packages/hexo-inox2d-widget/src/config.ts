import type { WidgetConfig } from "inochi2d-web" with { "resolution-mode": "import" };

import type { HexoLike, HexoWidgetConfig } from "./types";

export interface EnabledConfig {
  widget: WidgetConfig;
  breakpoint: number;
  showOnMobile: boolean;
}

export function readEnabledConfig(hexo: HexoLike): EnabledConfig | undefined {
  const input = hexo.config.inochi2d_widget;
  if (!input?.enable) {
    return undefined;
  }
  if (!nonEmpty(input.model)) {
    hexo.log.warn("inochi2d_widget.model is required when the widget is enabled");
    return undefined;
  }
  if (!nonEmpty(input.fallback)) {
    hexo.log.warn("inochi2d_widget.fallback is required when the widget is enabled");
    return undefined;
  }

  const root = normalizeRoot(hexo.config.root);
  const breakpoint = input.mobile?.breakpoint ?? 768;
  const showOnMobile = input.mobile?.show ?? false;
  return {
    widget: toWidgetConfig(input, root),
    breakpoint,
    showOnMobile,
  };
}

function toWidgetConfig(input: HexoWidgetConfig, root: string): WidgetConfig {
  return {
    model: resolveUrl(root, input.model),
    fallback: resolveUrl(root, input.fallback ?? ""),
    ...(input.display ? { display: input.display } : {}),
    ...(input.render ? { render: input.render } : {}),
    ...(input.mobile ? { mobile: input.mobile } : {}),
    ...(input.parameters ? { parameters: input.parameters } : {}),
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
