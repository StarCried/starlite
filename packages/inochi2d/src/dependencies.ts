import type { WidgetDependencies } from "./types.js";
import { createDefaultRuntime } from "./wasm.js";

export function createDefaultDependencies(): WidgetDependencies {
  return {
    async fetchModel(url, options) {
      const request: RequestInit = { credentials: "same-origin" };
      if (options?.signal) {
        request.signal = options.signal;
      }
      const response = await fetch(url, request);
      if (!response.ok) {
        throw new Error(`model request failed with HTTP ${response.status}`);
      }
      return readBoundedResponse(response, options?.maximumBytes ?? 16 * 1024 * 1024);
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

async function readBoundedResponse(
  response: Response,
  maximumBytes: number,
): Promise<Uint8Array> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new Error(`model response exceeds ${maximumBytes} bytes`);
  }
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maximumBytes) {
      throw new Error(`model response exceeds ${maximumBytes} bytes`);
    }
    return bytes;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel("model response exceeded the byte limit");
        throw new Error(`model response exceeds ${maximumBytes} bytes`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}
