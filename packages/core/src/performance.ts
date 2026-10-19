/** The overlay is opt-in; mounting a model with the default config creates none. */
export interface PerformanceConfig { show?: boolean }
export type PerformanceStatus = "loading" | "running" | "paused" | "fallback" | "disabled" | "destroyed";
export interface PerformanceFrameDetails { calls?: number; triangles?: number }

export function validatePerformanceConfig(value: unknown): void {
  if (value === undefined) return;
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).some(key => key !== "show")
    || ("show" in value && value.show !== undefined && typeof value.show !== "boolean")) {
    throw new Error("performance must be an object with an optional boolean show");
  }
}

/** Bounded numeric history; recording does not shift an array every frame. */
export class FrameSamples {
  readonly #values: Float64Array;
  #next = 0;
  #size = 0;
  constructor(capacity = 240) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) throw new Error("invalid sample capacity");
    this.#values = new Float64Array(capacity);
  }
  add(value: number): void {
    if (!Number.isFinite(value) || value < 0) return;
    this.#values[this.#next] = value;
    this.#next = (this.#next + 1) % this.#values.length;
    this.#size = Math.min(this.#size + 1, this.#values.length);
  }
  reset(): void { this.#next = 0; this.#size = 0; }
  values(): number[] {
    return Array.from({ length: this.#size }, (_, i) => this.#values[(this.#next - this.#size + i + this.#values.length) % this.#values.length]!);
  }
}

/**
 * Local-only, non-interactive overlay. The host calls recordFrame after an
 * actual scheduled render; RAF callbacks skipped by an FPS cap do not count.
 * CPU cost is model update + WebGL submission, not GPU execution or page cost.
 * No polling, timers, memory probes or WebGL readbacks are introduced here.
 */
export class PerformanceOverlay {
  readonly element: HTMLOutputElement;
  readonly #intervals = new FrameSamples();
  readonly #cpu = new FrameSamples();
  #previous: number | undefined;
  #lastPaint: number | undefined;
  #status: PerformanceStatus = "loading";
  #destroyed = false;

  constructor(host: HTMLElement) {
    this.element = document.createElement("output");
    this.element.className = "model-widget__performance";
    this.element.setAttribute("data-model-performance", "");
    this.element.setAttribute("aria-label", "StarLite model performance");
    this.element.setAttribute("aria-live", "off");
    this.element.title = "Rendered FPS and frame-interval p95; CPU p95 is the wall time of model update and WebGL submission, including any driver waits, not measured GPU execution or CPU utilization. The latest 240 frames are sampled. Pausing resets measurements.";
    // Use the logical host, not the expanded canvas: its negative offsets must
    // not move the panel offscreen or alter the alpha-based interaction mask.
    Object.assign(this.element.style, {
      position: "absolute", left: "8px", bottom: "8px", zIndex: "2",
      maxWidth: "calc(100% - 16px)", boxSizing: "border-box", padding: "6px 8px",
      borderRadius: "6px", background: "rgba(15, 23, 42, .86)", color: "#f1f5f9",
      font: "11px/1.5 ui-monospace, SFMono-Regular, Consolas, monospace",
      whiteSpace: "pre-line", overflowWrap: "anywhere", pointerEvents: "none",
      userSelect: "none", textAlign: "left",
    });
    host.append(this.element);
    this.#paintStatus();
  }
  setStatus(status: PerformanceStatus): void {
    if (this.#destroyed || status === this.#status) return;
    this.#status = status;
    this.#intervals.reset(); this.#cpu.reset(); this.#previous = undefined; this.#lastPaint = undefined;
    this.#paintStatus();
  }
  recordFrame(timestampMs: number, cpuMs: number, details: PerformanceFrameDetails = {}): void {
    if (this.#destroyed || this.#status !== "running" || !Number.isFinite(timestampMs)) return;
    if (this.#previous !== undefined && timestampMs > this.#previous) this.#intervals.add(timestampMs - this.#previous);
    this.#previous = timestampMs;
    this.#cpu.add(cpuMs);
    if (this.#lastPaint !== undefined && timestampMs - this.#lastPaint < 500) return;
    this.#lastPaint = timestampMs;
    const intervals = this.#intervals.values(), cpu = this.#cpu.values();
    const sum = intervals.reduce((total, value) => total + value, 0);
    const fps = sum > 0 ? `${(1000 * intervals.length / sum).toFixed(1)} FPS` : "FPS warming up";
    const p95 = (values: number[]) => values.length ? values.sort((a, b) => a - b)[Math.ceil(values.length * .95) - 1]!.toFixed(1) : "—";
    const lines = [fps, `Frame p95 ${p95(intervals)} ms`, `CPU p95 ${p95(cpu)} ms`];
    if (Number.isFinite(details.calls) && Number.isFinite(details.triangles)) {
      lines.push(`${details.calls} calls · ${details.triangles!.toLocaleString("en-US")} tris`);
    }
    this.element.textContent = lines.join("\n");
    this.element.dataset.modelPerformanceStatus = this.#status;
  }
  destroy(): void { if (this.#destroyed) return; this.#destroyed = true; this.element.remove(); }
  #paintStatus(): void {
    this.element.textContent = `StarLite · ${this.#status}`;
    this.element.dataset.modelPerformanceStatus = this.#status;
  }
}
