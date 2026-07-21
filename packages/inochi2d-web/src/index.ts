import { mountWithDependencies } from "./controller.js";
import { createDefaultDependencies } from "./dependencies.js";

export type {
  Inochi2dWasmRuntime,
  ParameterIds,
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
): Promise<import("./types.js").WidgetController> {
  return mountWithDependencies(element, config, createDefaultDependencies());
}
