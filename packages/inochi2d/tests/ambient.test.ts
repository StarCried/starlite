import { describe, expect, it } from "vitest";

import { applyAmbientParameterOscillators } from "../src/ambient.js";

describe("procedural ambient parameter oscillators", () => {
  it("samples scalar and vector sine waves at a deterministic phase", () => {
    const values = new Map<string, number | readonly [number, number]>([
      ["Gaze", [0.25, -0.25]],
    ]);
    applyAmbientParameterOscillators(
      values,
      [
        {
          id: "Tail",
          minimum: -0.5,
          maximum: 0.5,
          periodMs: 4_000,
          phase: 0.25,
        },
        {
          id: "Gaze",
          axis: "y",
          minimum: -0.2,
          maximum: 0.2,
          periodMs: 4_000,
          phase: 0.25,
        },
      ],
      0,
      false,
    );

    expect(values.get("Tail")).toBeCloseTo(0.5);
    expect(values.get("Gaze")).toEqual([0.25, 0.2]);
  });

  it("leaves neutral model values untouched for reduced motion", () => {
    const values = new Map<string, number | readonly [number, number]>();
    applyAmbientParameterOscillators(
      values,
      [
        {
          id: "Tail",
          minimum: -1,
          maximum: 1,
          periodMs: 4_000,
          phase: 0.25,
        },
      ],
      0,
      true,
    );
    expect(values.has("Tail")).toBe(false);
  });
});
