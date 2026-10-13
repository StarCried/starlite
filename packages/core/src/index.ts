export type ModelBackend = "inochi2d" | "vrm";
export type WidgetStatus = "disabled" | "loading" | "running" | "paused" | "fallback" | "destroyed";
export type AnimationPlaybackResult = "completed" | "interrupted" | "stopped";
export interface AnimationPlaybackOptions { mode?: "once" | "loop"; restart?: boolean }
export interface ModelAnimationInfo { name: string; durationMs: number }
import type { ModelHitMaskListener } from "./hit-mask.js";
export { RenderedHitMask, packAlphaMask, type ModelHitMask, type ModelHitMaskListener } from "./hit-mask.js";
export interface ModelController {
  readonly status: WidgetStatus;
  pause(): void;
  resume(): void;
  getAnimations(): readonly ModelAnimationInfo[];
  playAnimation(name: string, options?: AnimationPlaybackOptions): Promise<AnimationPlaybackResult>;
  stopAnimation(): void;
  resetCamera(): void;
  observeInteractionMask(listener?: ModelHitMaskListener): void;
  setPointerPosition(clientX: number, clientY: number): void;
  /** Optional host-movement capability. Coordinates are CSS pixels, local only. */
  setHostPosition?(x: number, y: number): void;
  destroy(): void;
}
export interface MountOptions { signal?: AbortSignal }

/** Own one mount, including asynchronous work which outlives a replacement. */
export class ModelMountSlot {
  #abort: AbortController | undefined;
  #controller: ModelController | undefined;
  async mount(factory: (signal: AbortSignal) => Promise<ModelController>): Promise<ModelController | undefined> {
    this.destroy();
    const abort = new AbortController();
    this.#abort = abort;
    try {
      const controller = await factory(abort.signal);
      if (abort.signal.aborted || this.#abort !== abort) {
        controller.destroy();
        return undefined;
      }
      this.#controller = controller;
      return controller;
    } catch (error) {
      if (abort.signal.aborted) return undefined;
      throw error;
    }
  }
  destroy(): void {
    this.#abort?.abort();
    this.#abort = undefined;
    this.#controller?.destroy();
    this.#controller = undefined;
  }
}

/** Only import the selected backend. Runtime URLs are supplied by the host. */
export async function mountModelWidget<C extends { backend?: ModelBackend }>(
  host: HTMLElement, config: C,
  modules: Record<ModelBackend, () => Promise<{ mountModelWidget(host: HTMLElement, config: C, options?: MountOptions): Promise<ModelController> }>>,
  options: MountOptions = {},
): Promise<ModelController> {
  options.signal?.throwIfAborted();
  const backend = config.backend ?? "inochi2d";
  const runtime = await modules[backend]();
  options.signal?.throwIfAborted();
  return runtime.mountModelWidget(host, config, options);
}

/** Streaming limit applies to decoded response bytes, not just Content-Length. */
export async function fetchBounded(url: string, maximumBytes: number, signal: AbortSignal): Promise<ArrayBuffer> {
  const response = await fetch(url, { signal, credentials: "same-origin" });
  if (!response.ok) throw new Error(`asset request failed: HTTP ${response.status}`);
  if (Number(response.headers.get("content-length")) > maximumBytes) {
    await response.body?.cancel();
    throw new Error("asset exceeds the byte limit");
  }
  if (!response.body) {
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > maximumBytes) throw new Error("asset exceeds the byte limit");
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximumBytes) {
        await reader.cancel();
        throw new Error("asset exceeds the byte limit");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  signal.throwIfAborted();
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes.buffer;
}

export { DialogueScheduler, resolveDialogueSentences, type DialogueAction, type DialogueSchedule, type DialogueSceneConfig, type ResolvedDialogueScene } from "./dialogue.js";

export { DialogueBubble } from "./bubble.js";
export { observePassThroughClicks } from "./pass-through.js";
