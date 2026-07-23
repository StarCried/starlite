import { OfficialInochi2dRuntime } from "./official/runtime.js";
import type { RuntimeFactory } from "./types.js";

export const createDefaultRuntime: RuntimeFactory = (canvas, options, signal) =>
  OfficialInochi2dRuntime.create(
    canvas,
    options,
    new URL("./generated/inochi2d.wasm", import.meta.url),
    signal,
  );
