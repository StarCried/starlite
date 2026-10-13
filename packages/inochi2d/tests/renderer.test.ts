import { describe, expect, it, vi } from "vitest";

import { applyInochiBlendMode } from "../src/official/renderer.js";

function fakeGl(): WebGL2RenderingContext {
  return {
    BLEND: 1,
    FUNC_ADD: 2,
    MAX: 3,
    ZERO: 4,
    ONE: 5,
    SRC_ALPHA: 6,
    DST_ALPHA: 7,
    DST_COLOR: 8,
    ONE_MINUS_SRC_ALPHA: 9,
    ONE_MINUS_SRC_COLOR: 10,
    ONE_MINUS_DST_COLOR: 11,
    enable: vi.fn(),
    blendEquation: vi.fn(),
    blendFunc: vi.fn(),
    blendFuncSeparate: vi.fn(),
  } as unknown as WebGL2RenderingContext;
}

describe("official Inochi2D blend modes", () => {
  it("uses the standard RGB and alpha factors for additive modes", () => {
    const linearDodge = fakeGl();
    applyInochiBlendMode(linearDodge, 0x07);
    expect(linearDodge.blendFuncSeparate).toHaveBeenCalledWith(
      linearDodge.ONE,
      linearDodge.ONE_MINUS_SRC_COLOR,
      linearDodge.ONE,
      linearDodge.ONE_MINUS_SRC_ALPHA,
    );

    const addGlow = fakeGl();
    applyInochiBlendMode(addGlow, 0x08);
    expect(addGlow.blendFuncSeparate).toHaveBeenCalledWith(
      addGlow.ONE,
      addGlow.ONE,
      addGlow.ONE,
      addGlow.ONE_MINUS_SRC_ALPHA,
    );
  });

  it("uses the standard Lighten, Inverse, and SliceFromLower factors", () => {
    const lighten = fakeGl();
    applyInochiBlendMode(lighten, 0x05);
    expect(lighten.blendEquation).toHaveBeenCalledWith(lighten.MAX);
    expect(lighten.blendFunc).toHaveBeenCalledWith(
      lighten.DST_COLOR,
      lighten.ONE,
    );

    const inverse = fakeGl();
    applyInochiBlendMode(inverse, 0x0f);
    expect(inverse.blendFunc).toHaveBeenCalledWith(
      inverse.ONE_MINUS_DST_COLOR,
      inverse.ONE_MINUS_SRC_ALPHA,
    );

    const sliceFromLower = fakeGl();
    applyInochiBlendMode(sliceFromLower, 0x12);
    expect(sliceFromLower.blendEquation).toHaveBeenCalledWith(
      sliceFromLower.FUNC_ADD,
    );
    expect(sliceFromLower.blendFunc).toHaveBeenCalledWith(
      sliceFromLower.ZERO,
      sliceFromLower.ONE_MINUS_SRC_ALPHA,
    );
  });

  it("fails closed for unknown modes and the shader-only ColorBurn path", () => {
    expect(() => applyInochiBlendMode(fakeGl(), 0x09)).toThrow(
      /shader-based/u,
    );
    expect(() => applyInochiBlendMode(fakeGl(), 0xff)).toThrow(/unsupported/u);
  });
});
