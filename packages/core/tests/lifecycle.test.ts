import { describe, expect, it, vi } from "vitest";
import { ModelMountSlot, mountModelWidget, type ModelController } from "../src/index.js";

const controller = () => ({ destroy: vi.fn() }) as unknown as ModelController;
describe("model component lifetime", () => {
  it("aborts old work and disposes an instance which finishes after replacement", async () => {
    const slot = new ModelMountSlot();
    let finish!: (value: ModelController) => void;
    let oldSignal!: AbortSignal;
    const old = slot.mount((signal) => {
      oldSignal = signal;
      return new Promise((resolve) => { finish = resolve; });
    });
    const next = controller();
    expect(await slot.mount(async () => next)).toBe(next);
    expect(oldSignal.aborted).toBe(true);
    const stale = controller();
    finish(stale);
    expect(await old).toBeUndefined();
    expect(stale.destroy).toHaveBeenCalledOnce();
    slot.destroy(); slot.destroy();
    expect(next.destroy).toHaveBeenCalledOnce();
  });
  it("imports only the selected renderer and checks cancellation before mounting", async () => {
    const ino = vi.fn();
    const vrm = vi.fn(async () => ({ mountModelWidget: vi.fn(async () => controller()) }));
    await mountModelWidget({} as HTMLElement, { backend: "vrm" as const }, { inochi2d: ino, vrm });
    expect(ino).not.toHaveBeenCalled();
    expect(vrm).toHaveBeenCalledOnce();
    const abort = new AbortController(); abort.abort();
    await expect(mountModelWidget({} as HTMLElement, {}, { inochi2d: ino, vrm }, { signal: abort.signal })).rejects.toThrow();
    expect(ino).not.toHaveBeenCalled();
  });
});
