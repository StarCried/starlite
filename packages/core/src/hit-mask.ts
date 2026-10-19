/** Model-only alpha coverage. Coordinates are CSS pixels in the host viewport. */
export interface ModelHitMask {
  width: number;
  height: number;
  left: number;
  top: number;
  displayWidth: number;
  displayHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  bits: Uint8Array;
}
export type ModelHitMaskListener = (mask: ModelHitMask | undefined) => void;

export function packAlphaMask(rgba: Uint8ClampedArray): Uint8Array {
  const bits = new Uint8Array(Math.ceil(rgba.length / 4 / 8));
  for (let pixel = 0; pixel < rgba.length / 4; pixel++) {
    // Include visible translucent fur and anti-aliased edges, not transparent quads.
    if (rgba[pixel * 4 + 3]! >= 16) bits[pixel >> 3]! |= 1 << (pixel & 7);
  }
  return bits;
}

/** Opt-in readback, called immediately after rendering before WebGL clears its buffer. */
export class RenderedHitMask {
  #listener: ModelHitMaskListener | undefined;
  #surface: HTMLCanvasElement | undefined;
  #lastTime = -Infinity;
  setListener(listener?: ModelHitMaskListener): void {
    this.#listener?.(undefined);
    this.#listener = listener;
    this.#lastTime = -Infinity;
    if (!listener) this.#surface = undefined;
  }
  capture(canvas: HTMLCanvasElement, timestamp: number, force = false): void {
    if (!this.#listener || (!force && timestamp - this.#lastTime < 50)) return;
    this.#lastTime = timestamp;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || !canvas.width || !canvas.height) return;
    // At most 512² bits. Normally one sample per two CSS pixels (240 × 360).
    const scale = Math.min(.5, 512 / rect.width, 512 / rect.height);
    const width = Math.max(1, Math.ceil(rect.width * scale));
    const height = Math.max(1, Math.ceil(rect.height * scale));
    const surface = this.#surface ??= document.createElement("canvas");
    if (surface.width !== width) surface.width = width;
    if (surface.height !== height) surface.height = height;
    try {
      const context = surface.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("alpha sampling unavailable");
      context.clearRect(0, 0, width, height);
      context.drawImage(canvas, 0, 0, width, height);
      this.#listener({ width, height, left: rect.left, top: rect.top,
        displayWidth: rect.width, displayHeight: rect.height,
        viewportWidth: innerWidth, viewportHeight: innerHeight,
        bits: packAlphaMask(context.getImageData(0, 0, width, height).data) });
    } catch {
      // Unreadable/tainted output must never become a rectangular hit target.
      this.#listener(undefined);
    }
  }
  clear(): void { this.#listener?.(undefined); }
  destroy(): void { this.setListener(); }
}
