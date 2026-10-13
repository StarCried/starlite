// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { packAlphaMask, RenderedHitMask } from "../src/hit-mask.js";

describe("rendered model silhouette", () => {
  it("keeps alpha holes, translucent edges and bit order across byte boundaries", () => {
    const alpha = [0, 255, 15, 16, 128, 0, 255, 0, 255, 0];
    const rgba = new Uint8ClampedArray(alpha.length * 4);
    alpha.forEach((value, index) => { rgba[index * 4 + 3] = value; });
    expect([...packAlphaMask(rgba)]).toEqual([0b01011010, 0b00000001]);
    expect([...packAlphaMask(new Uint8ClampedArray(40))]).toEqual([0, 0]);
  });
  it("does no readback without opt-in, bounds frequency and clears stale coverage", () => {
    const canvas = document.createElement("canvas");
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({left:12,top:20,width:480,height:720} as DOMRect);
    const drawImage = vi.fn(), getImageData = vi.fn(() => ({data:new Uint8ClampedArray(240 * 360 * 4).fill(255)}));
    const context = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({clearRect(){},drawImage,getImageData} as unknown as CanvasRenderingContext2D);
    const mask = new RenderedHitMask(), listener = vi.fn();
    mask.capture(canvas, 0); expect(context).not.toHaveBeenCalled();
    mask.setListener(listener); mask.capture(canvas, 0); mask.capture(canvas, 20);
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]![0]).toMatchObject({width:240,height:360,left:12,top:20,displayWidth:480,displayHeight:720});
    expect(listener.mock.calls[0]![0].bits).toHaveLength(10800);
    mask.capture(canvas, 50); expect(drawImage).toHaveBeenCalledTimes(2);
    getImageData.mockImplementation(() => {throw new Error("tainted")});
    mask.capture(canvas, 100); expect(listener).toHaveBeenLastCalledWith(undefined);
    mask.destroy(); mask.capture(canvas, 200); expect(drawImage).toHaveBeenCalledTimes(3);
    context.mockRestore();
  });
});
