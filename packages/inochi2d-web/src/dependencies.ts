import type { WidgetDependencies } from "./types.js";
import { createDefaultRuntime } from "./wasm.js";

export function createDefaultDependencies(): WidgetDependencies {
  return {
    async fetchModel(url) {
      const response = await fetch(url, { credentials: "same-origin" });
      if (!response.ok) {
        throw new Error(`model request failed with HTTP ${response.status}`);
      }
      return new Uint8Array(await response.arrayBuffer());
    },
    createRuntime: createDefaultRuntime,
    requestFrame: (callback) => window.requestAnimationFrame(callback),
    cancelFrame: (handle) => window.cancelAnimationFrame(handle),
    isMobile: (query) => window.matchMedia(query).matches,
    prefersReducedMotion: () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    isWebGl2Available: () =>
      document.createElement("canvas").getContext("webgl2", {
        alpha: true,
        premultipliedAlpha: true,
        stencil: true,
      }) !== null,
    devicePixelRatio: () => window.devicePixelRatio || 1,
    createResizeObserver: (callback) =>
      typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(callback),
    random: Math.random,
  };
}
