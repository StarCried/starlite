// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { FrameSamples, PerformanceOverlay, validatePerformanceConfig } from "../src/performance.js";

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });
it("validates opt-in configuration without accepting truthy strings", () => {
  for (const config of [undefined, {}, { show: false }, { show: true }]) expect(() => validatePerformanceConfig(config)).not.toThrow();
  for (const config of [null, false, [], { show: "false" }, { show: 1 }, { fps: true }]) expect(() => validatePerformanceConfig(config)).toThrow("performance");
});
it("retains a bounded chronological sample without exposing its storage", () => {
  const samples = new FrameSamples(3);
  for (const value of [1, 2, 3, 4, NaN, Infinity, -1]) samples.add(value);
  expect(samples.values()).toEqual([2, 3, 4]);
  samples.values().fill(0); expect(samples.values()).toEqual([2, 3, 4]);
  samples.reset(); expect(samples.values()).toEqual([]);
  expect(() => new FrameSamples(0)).toThrow();
});
it("creates no timers and stays in the logical host corner with no pointer surface", () => {
  const timer = vi.spyOn(globalThis, "setInterval"), timeout = vi.spyOn(globalThis, "setTimeout");
  const host = document.createElement("div"), canvas = document.createElement("canvas");
  canvas.style.left = "-200px"; canvas.style.top = "-100px"; host.append(canvas); document.body.append(host);
  const overlay = new PerformanceOverlay(host);
  expect(overlay.element.parentElement).toBe(host);
  expect(overlay.element.style.left).toBe("8px"); expect(overlay.element.style.bottom).toBe("8px");
  expect(overlay.element.style.pointerEvents).toBe("none"); expect(overlay.element.textContent).toContain("loading");
  expect(overlay.element.getAttribute("aria-live")).toBe("off");
  expect(timer).not.toHaveBeenCalled(); expect(timeout).not.toHaveBeenCalled();
  overlay.destroy(); overlay.destroy(); expect(host.children).toHaveLength(1);
});
it("measures rendered intervals and CPU samples while bounding DOM updates to 2 Hz", () => {
  const overlay = new PerformanceOverlay(document.createElement("div")); overlay.setStatus("running");
  overlay.recordFrame(0, 1, { calls: 8, triangles: 53991 }); const first = overlay.element.textContent;
  for (let i = 1; i < 15; i++) overlay.recordFrame(i * 1000 / 30, 2, { calls: 8, triangles: 53991 });
  expect(overlay.element.textContent).toBe(first);
  overlay.recordFrame(500, 3, { calls: 8, triangles: 53991 });
  expect(overlay.element.textContent).toContain("30.0 FPS");
  expect(overlay.element.textContent).toContain("Frame p95 33.3 ms");
  expect(overlay.element.textContent).toContain("CPU p95 3.0 ms");
  expect(overlay.element.textContent).toContain("8 calls · 53,991 tris");
  expect(overlay.element.textContent).not.toMatch(/GPU|memory/i);
});
it("resets after pause and never averages offline time or reports stale FPS", () => {
  const overlay = new PerformanceOverlay(document.createElement("div")); overlay.setStatus("running");
  for (let i = 0; i <= 30; i++) overlay.recordFrame(i * 1000 / 30, 1);
  overlay.setStatus("paused"); expect(overlay.element.textContent).toBe("StarLite · paused");
  overlay.recordFrame(100000, 500); expect(overlay.element.textContent).toBe("StarLite · paused");
  overlay.setStatus("running"); overlay.recordFrame(100000, 1);
  expect(overlay.element.textContent).toContain("warming up");
  for (let i = 1; i <= 30; i++) overlay.recordFrame(100000 + i * 1000 / 30, 1);
  expect(overlay.element.textContent).toContain("30.0 FPS");
  overlay.destroy(); overlay.setStatus("paused"); overlay.recordFrame(200000, 100);
  expect(overlay.element.isConnected).toBe(false);
});
