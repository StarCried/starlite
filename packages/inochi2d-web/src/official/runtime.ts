import type { Inochi2dWasmRuntime } from "../types.js";
import { OfficialWebGlRenderer } from "./renderer.js";
import {
  OfficialInochi2dSdk,
  type OfficialParameter,
  type OfficialPuppet,
} from "./sdk.js";

export class OfficialInochi2dRuntime implements Inochi2dWasmRuntime {
  readonly #sdk: OfficialInochi2dSdk;
  readonly #renderer: OfficialWebGlRenderer;
  #puppet: OfficialPuppet | undefined;
  #lastTimestampMs: number | undefined;
  #destroyed = false;

  private constructor(
    sdk: OfficialInochi2dSdk,
    renderer: OfficialWebGlRenderer,
  ) {
    this.#sdk = sdk;
    this.#renderer = renderer;
  }

  static async create(
    canvas: HTMLCanvasElement,
    options: { initialScale: number },
    wasmUrl: URL,
    signal?: AbortSignal,
  ): Promise<OfficialInochi2dRuntime> {
    const sdk = await OfficialInochi2dSdk.create(wasmUrl, signal);
    try {
      return new OfficialInochi2dRuntime(
        sdk,
        new OfficialWebGlRenderer(canvas, options.initialScale),
      );
    } catch (error) {
      sdk.destroy();
      throw error;
    }
  }

  loadModel(bytes: Uint8Array): void {
    this.#assertActive();
    const next = this.#sdk.loadPuppet(bytes);
    try {
      const textures = this.#sdk.readTextures(next);
      this.#renderer.uploadTextures(textures);
    } catch (error) {
      this.#sdk.freePuppet(next);
      throw error;
    }
    this.#sdk.freePuppet(this.#puppet);
    this.#puppet = next;
    this.#lastTimestampMs = undefined;
  }

  setParameterScalar(id: string, value: number): void {
    this.#sdk.setParameter(this.#parameter(id), value);
  }

  setParameterVector(id: string, x: number, y: number): void {
    this.#sdk.setParameter(this.#parameter(id), [x, y]);
  }

  setCameraTransform(x: number, y: number, scale: number): void {
    this.#renderer.setCameraTransform(x, y, scale);
  }

  resize(width: number, height: number, devicePixelRatio: number): void {
    this.#renderer.resize(width, height, devicePixelRatio);
  }

  renderFrame(timestampMs: number): void {
    this.#assertActive();
    const puppet = this.#puppet;
    if (!puppet) {
      throw new Error("no Inochi2D model is loaded");
    }
    const deltaSeconds =
      this.#lastTimestampMs === undefined
        ? 0
        : Math.max(0, timestampMs - this.#lastTimestampMs) / 1_000;
    this.#lastTimestampMs = timestampMs;
    this.#renderer.render(this.#sdk.updateAndDraw(puppet, deltaSeconds));
  }

  destroy(): void {
    if (this.#destroyed) {
      return;
    }
    this.#renderer.destroy();
    this.#sdk.freePuppet(this.#puppet);
    this.#puppet = undefined;
    this.#sdk.destroy();
    this.#destroyed = true;
  }

  #parameter(id: string): OfficialParameter {
    this.#assertActive();
    const parameter = this.#puppet?.parameters.get(id);
    if (!parameter) {
      throw new Error(`model does not expose parameter ${id}`);
    }
    return parameter;
  }

  #assertActive(): void {
    if (this.#destroyed) {
      throw new Error("official Inochi2D runtime is destroyed");
    }
  }
}
