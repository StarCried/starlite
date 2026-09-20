import { mountWithDependencies } from "./controller.js";
import { createDefaultDependencies } from "./dependencies.js";

export { validateInochi2DWidgetConfig } from "./config.js";

export type {
  AmbientAnimationConfig,
  AnimationClip,
  AnimationInterpolation,
  AnimationKeyframe,
  AnimationLane,
  AnimationPlaybackMode,
  AnimationPlaybackOptions,
  AnimationPlaybackResult,
  DialogueConfig,
  DialogueSceneConfig,
  DialogueSceneName,
  EnterDialogueSceneConfig,
  IdleDialogueSceneConfig,
  Inochi2dWasmRuntime,
  ModelAnimationInfo,
  ParameterAxis,
  ParameterBinding,
  ParameterIds,
  ParameterTarget,
  ResolvedParameterBindings,
  ResolvedParameterTarget,
  ResolvedWidgetConfig,
  RuntimeFactory,
  WidgetConfig,
  WidgetController,
  WidgetStatus,
} from "./types.js";

/** Mount an Inochi2D widget and resolve once it is running or in fallback state. */
export async function mountInochi2DWidget(
  element: HTMLElement,
  config: import("./types.js").WidgetConfig,
  options: import("model-widget-core").MountOptions = {},
): Promise<import("./types.js").WidgetController> {
  return mountWithDependencies(element, config, createDefaultDependencies(), options.signal);
}

/** Common component entry point; the existing Inochi2D API remains supported. */
export const mountModelWidget = mountInochi2DWidget;
