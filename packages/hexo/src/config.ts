import type { WidgetConfig } from "@starcried/starlite-inochi2d" with { "resolution-mode": "import" };

import type { BrowserWidgetConfig, HexoLike, HexoWidgetConfig, ModelAssetBundle } from "./types";

const { validateInochi2DWidgetConfig } = require("@starcried/starlite-inochi2d/config") as {
  validateInochi2DWidgetConfig(config: WidgetConfig): void;
};

export interface EnabledConfig {
  widget: BrowserWidgetConfig;
  breakpoint: number;
  showOnMobile: boolean;
  position: { right: number; bottom: number; zIndex: number };
}

export function readEnabledConfig(
  hexo: HexoLike,
  modelBundle?: ModelAssetBundle,
): EnabledConfig | undefined {
  const input = hexo.config.starlite;
  if (!input?.enable) {
    return undefined;
  }

  if (input.backend !== undefined && input.backend !== "inochi2d" && input.backend !== "vrm") throw new Error("unknown model backend");
  const position = {
    right: input.position?.right ?? 16,
    bottom: input.position?.bottom ?? 0,
    zIndex: input.position?.zIndex ?? 20,
  };
  if ([position.right, position.bottom].some(value => !Number.isFinite(value) || value < 0 || value > 10000)
      || !Number.isInteger(position.zIndex) || position.zIndex < 0 || position.zIndex > 2147483647) {
    throw new Error("starlite.position requires finite right/bottom offsets from 0 to 10000 and a non-negative integer zIndex");
  }
  const root = normalizeRoot(hexo.config.root);
  const artifactUrls = resolveArtifactUrls(input, root, modelBundle);
  const breakpoint = input.mobile?.breakpoint ?? 768;
  const showOnMobile = input.mobile?.show ?? false;
  if (input.backend === "vrm") {
    const base = modelBundle ? `${root}${modelBundle.routePrefix}/` : root;
    const preparedAnimations = modelBundle?.vrm?.animations.map(a => ({...a,url:base+a.url}));
    const animations = nonEmpty(input.bundle) ? preparedAnimations : input.animations?.map(a => ({...a,url:resolveUrl(root,a.url)})) ?? preparedAnimations;
    const embeddedAnimations = modelBundle?.vrm?.embeddedAnimations ?? input.embeddedAnimations;
    const animationNames = [...(embeddedAnimations ?? []), ...(animations ?? []).map(a=>a.name)];
    const profile = modelBundle?.vrm?.profile ? base + modelBundle.vrm.profile : typeof input.profile === "string" ? resolveUrl(root,input.profile) : input.profile;
    const profileNeutralAnimation = profile && typeof profile !== "string" ? profile.neutralAnimation
      : (modelBundle?.vrm?.profile || profile === undefined) ? modelBundle?.vrm?.neutralAnimation : undefined;
    if (profileNeutralAnimation !== undefined && profileNeutralAnimation !== "StarLiteIdle" && !animationNames.includes(profileNeutralAnimation)) {
      throw new Error(`starlite.profile.neutralAnimation references unavailable animation ${JSON.stringify(profileNeutralAnimation)}; choose an embedded/configured VRMA animation or StarLiteIdle`);
    }
    // A fetched profile owns its baseline once loaded. Do not silently replace
    // that unknown choice with the discovered Idle; explicit user settings win.
    const neutralAnimation = input.neutralAnimation ?? profileNeutralAnimation ?? (profile === undefined && animationNames.includes("Idle") ? "Idle" : undefined);
    if (neutralAnimation !== undefined && neutralAnimation !== "StarLiteIdle" && !animationNames.includes(neutralAnimation)) {
      throw new Error(`starlite.neutralAnimation references unavailable animation ${JSON.stringify(neutralAnimation)}; choose an embedded/configured VRMA animation or StarLiteIdle`);
    }
    const widget = {
      backend:"vrm" as const, ...artifactUrls,
      ...(animations ? {animations} : {}), ...(profile ? {profile} : {}),
      ...(embeddedAnimations ? {embeddedAnimations} : {}), ...(neutralAnimation ? {neutralAnimation} : {}),
      ...(input.display ? {display:input.display} : {}), ...(input.mobile ? {mobile:input.mobile} : {}),
      ...(input.gaze ? {gaze:input.gaze} : {}),
      ...(input.camera ? {camera:input.camera} : {}),
      ...(input.performance ? {performance:input.performance} : {}),
      render:{fps:30,maxDevicePixelRatio:1.5,autoFit:true,...input.render},
      ...(input.network ? {network:input.network} : {}),
      ...(input.ambient ? {ambient:input.ambient} : {}), ...(input.dialogue ? {dialogue:input.dialogue} : {}),
      interactions:{...input.interactions,passThrough:input.interactions?.passThrough ?? !input.interactions?.drag,click:input.interactions?.click ?? false},
    };
    (require("@starcried/starlite-vrm/config") as typeof import("@starcried/starlite-vrm/config", {with:{"resolution-mode":"import"}})).validateVrmWidgetConfig(widget);
    return {widget,breakpoint,showOnMobile,position};
  }
  const widget = toWidgetConfig(
    input as Extract<HexoWidgetConfig, {backend?: "inochi2d"}>,
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
    position,
  };
}

function resolveArtifactUrls(
  input: HexoWidgetConfig,
  root: string,
  modelBundle?: ModelAssetBundle,
): Pick<WidgetConfig, "fallback" | "model"> {
  if (nonEmpty(input.bundle) || modelBundle) {
    if (!modelBundle) {
      throw new Error("starlite.bundle could not be loaded");
    }
    if (!modelBundle.localPreview && input.publication?.confirm !== true) {
      throw new Error(
        "starlite.publication.confirm must be true before a local model bundle is published",
      );
    }
    if (
      !modelBundle.localPreview &&
      input.publication?.allowRedistribution !== true
    ) {
      throw new Error(
        "starlite.publication.allowRedistribution must be true before a local model bundle is published",
      );
    }
    if (
      !modelBundle.localPreview &&
      (nonEmpty(input.bundle) || input.publication?.sourceSha256 !== undefined) &&
      input.publication?.sourceSha256?.toLowerCase() !==
      modelBundle.sourceSha256.toLowerCase()
    ) {
      throw new Error(
        "starlite.publication.sourceSha256 must match the reviewed source model",
      );
    }
    if (!modelBundle.fallbackFile && !(input.backend === "vrm" && nonEmpty(input.fallback))) {
      throw new Error("the Inochi2D pipeline bundle has no fallback image");
    }
    const base = `${root}${modelBundle.routePrefix}`;
    return {
      model: `${base}/${modelBundle.modelFile}`,
      fallback: input.backend === "vrm" && nonEmpty(input.fallback) ? resolveUrl(root,input.fallback) : modelBundle.fallbackFile ? `${base}/${modelBundle.fallbackFile}` : resolveUrl(root, input.fallback!),
    };
  }

  if (!nonEmpty(input.model)) {
    throw new Error("starlite.model is required when the widget is enabled");
  }
  if (!nonEmpty(input.fallback)) {
    throw new Error("starlite.fallback is required when the widget is enabled");
  }
  return {
    model: resolveUrl(root, input.model),
    fallback: resolveUrl(root, input.fallback),
  };
}

function toWidgetConfig(
  input: Extract<HexoWidgetConfig, {backend?: "inochi2d"}>,
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
    ...(input.performance ? { performance: input.performance } : {}),
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
