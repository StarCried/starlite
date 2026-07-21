import type { Inochi2dWasmRuntime, RuntimeFactory } from "./types.js";

interface WasmBindings {
  default(): Promise<unknown>;
  Inochi2dRuntime: new (
    canvas: HTMLCanvasElement,
    options: { initialScale: number },
  ) => Inochi2dWasmRuntime;
}

let bindingsPromise: Promise<WasmBindings> | undefined;

async function loadBindings(): Promise<WasmBindings> {
  bindingsPromise ??= import(
    /* @vite-ignore */ new URL("./generated/runtime.js", import.meta.url).href
  ) as Promise<WasmBindings>;
  const bindings = await bindingsPromise;
  await bindings.default();
  return bindings;
}

export const createDefaultRuntime: RuntimeFactory = async (canvas, options) => {
  const bindings = await loadBindings();
  return new bindings.Inochi2dRuntime(canvas, options);
};
