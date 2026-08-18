import { describe, expect, it } from "vitest";

import {
  boundedFrameDeltaSeconds,
  drawListBounds,
} from "../src/official/runtime.js";
import type { OfficialDrawCommand } from "../src/official/sdk.js";

function command(
  overrides: Partial<OfficialDrawCommand> = {},
): OfficialDrawCommand {
  return {
    sources: [],
    state: 0,
    blendMode: 0,
    maskMode: 0,
    vertexOffset: 1,
    indexOffset: 0,
    elementCount: 6,
    typeId: 0,
    variables: new Float32Array(16),
    ...overrides,
  };
}

describe("official runtime frame timing", () => {
  it("uses normal frame deltas and clamps background-tab time jumps", () => {
    expect(boundedFrameDeltaSeconds(undefined, 1_000)).toBe(0);
    expect(boundedFrameDeltaSeconds(1_000, 1_033)).toBeCloseTo(0.033);
    expect(boundedFrameDeltaSeconds(1_000, 31_000)).toBeCloseTo(1 / 15);
  });

  it("does not send reversed or non-finite time into model physics", () => {
    expect(boundedFrameDeltaSeconds(2_000, 1_000)).toBe(0);
    expect(boundedFrameDeltaSeconds(1_000, Number.NaN)).toBe(0);
  });

  it("derives neutral model bounds from referenced mesh vertices", () => {
    const bounds = drawListBounds({
      commands: [
        command(),
        command({
          state: 4,
          vertexOffset: 10_000,
          indexOffset: 10_000,
          elementCount: 10_000,
        }),
      ],
      vertices: new Float32Array([
        99, 99, 0, 0,
        -2, -1, 0, 0,
        4, -1, 1, 0,
        4, 5, 1, 1,
        -2, 5, 0, 1,
      ]),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    });

    expect(bounds).toEqual({ minX: -2, minY: -1, maxX: 4, maxY: 5 });
  });

  it("rejects mesh indices outside the SDK vertex buffer", () => {
    expect(() =>
      drawListBounds({
        commands: [command({ elementCount: 1 })],
        vertices: new Float32Array([0, 0, 0, 0]),
        indices: new Uint32Array([3]),
      }),
    ).toThrow(/references vertex/u);
  });
});
