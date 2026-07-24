import { describe, expect, it } from "vitest";

import { AnimationPlayer, sampleLane } from "../src/animation.js";
import { resolveConfig } from "../src/config.js";
import type { AnimationClip, AnimationLane } from "../src/types.js";

const click: AnimationClip = {
  name: "Click",
  timestepMs: 100,
  length: 10,
  leadIn: 0,
  leadOut: 8,
  weight: 1,
  lanes: [
    {
      parameter: "Arm:: Right:: Move",
      defaultValues: [0, 0],
      interpolation: "linear",
      keyframes: [
        { frame: 0, value: 0, tension: 0 },
        { frame: 5, value: 1, tension: 0 },
        { frame: 10, value: 0, tension: 0 },
      ],
    },
  ],
};

describe("AnimationPlayer", () => {
  it("plays a named model clip and restores its model default", () => {
    const player = new AnimationPlayer(new Map([[click.name, click]]));
    const values = new Map<string, number | readonly [number, number]>();
    player.trigger("Click", 100);

    player.apply(values, 600, false);
    expect(values.get("Arm:: Right:: Move")).toBe(1);

    values.clear();
    player.apply(values, 1_100, false);
    expect(values.get("Arm:: Right:: Move")).toBe(0);

    values.clear();
    player.apply(values, 1_200, false);
    expect(values.get("Arm:: Right:: Move")).toBe(0);
  });

  it("does not override resumed automatic motion during restoration", () => {
    const player = new AnimationPlayer(new Map([[click.name, click]]));
    player.trigger("Click", 0);
    const values = new Map<string, number | readonly [number, number]>();
    player.apply(values, 1_000, false);

    values.set("Arm:: Right:: Move", 0.25);
    player.apply(values, 1_100, false);
    expect(values.get("Arm:: Right:: Move")).toBe(0.25);
  });

  it("preserves the untouched default axis of a vector lane", () => {
    const vectorClip: AnimationClip = {
      ...click,
      lanes: [
        {
          parameter: "Head:: Yaw-Pitch",
          axis: "x",
          defaultValues: [0.25, -0.75],
          interpolation: "linear",
          keyframes: [
            { frame: 0, value: 0.25, tension: 0.5 },
            { frame: 5, value: 1, tension: 0.5 },
            { frame: 10, value: 0.25, tension: 0.5 },
          ],
        },
      ],
    };
    const player = new AnimationPlayer(
      new Map([[vectorClip.name, vectorClip]]),
    );
    const values = new Map<string, number | readonly [number, number]>();
    player.trigger("Click", 0);

    player.apply(values, 500, false);
    expect(values.get("Head:: Yaw-Pitch")).toEqual([1, -0.75]);

    values.clear();
    player.apply(values, 1_000, false);
    values.clear();
    player.apply(values, 1_100, false);
    expect(values.get("Head:: Yaw-Pitch")).toEqual([0.25, -0.75]);
  });

  it("stops motion and restores defaults for reduced-motion users", () => {
    const player = new AnimationPlayer(new Map([[click.name, click]]));
    player.trigger("Click", 0);
    const values = new Map<string, number | readonly [number, number]>();
    player.apply(values, 500, false);
    expect(values.get("Arm:: Right:: Move")).toBe(1);

    values.clear();
    player.apply(values, 500, true);
    expect(values.get("Arm:: Right:: Move")).toBe(0);
  });

  it("rejects an unavailable animation instead of using a fallback pulse", () => {
    const player = new AnimationPlayer(new Map([[click.name, click]]));
    expect(() => player.trigger("ClickWave", 0)).toThrow(/unavailable/u);
  });
});

describe("animation interpolation", () => {
  const lane = (interpolation: AnimationLane["interpolation"]): AnimationLane => ({
    parameter: "Test",
    defaultValues: [0, 0],
    interpolation,
    keyframes: [
      { frame: 0, value: 0, tension: 0 },
      { frame: 10, value: 1, tension: 0 },
    ],
  });

  it("supports nearest, stepped, linear, and cubic lanes", () => {
    expect(sampleLane(lane("nearest"), 4)).toBe(0);
    expect(sampleLane(lane("nearest"), 5)).toBe(0);
    expect(sampleLane(lane("nearest"), 6)).toBe(1);
    expect(sampleLane(lane("stepped"), 6)).toBe(0);
    expect(sampleLane(lane("linear"), 5)).toBeCloseTo(0.5);
    expect(sampleLane(lane("cubic"), 5)).toBeCloseTo(0.5);

    expect(
      sampleLane(
        {
          parameter: "Cubic",
          defaultValues: [0, 0],
          interpolation: "cubic",
          keyframes: [
            { frame: 0, value: 0, tension: 0.5 },
            { frame: 10, value: 1, tension: 0.5 },
            { frame: 20, value: 0, tension: 0.5 },
            { frame: 30, value: 0, tension: 0.5 },
          ],
        },
        15,
      ),
    ).toBeCloseTo(0.5625);
  });
});

describe("animation configuration", () => {
  it("requires an explicitly configured clip before mounting", () => {
    expect(() =>
      resolveConfig({
        model: "/model.inp",
        fallback: "/fallback.png",
        interactions: { click: { animation: "Click" } },
      }),
    ).toThrow(/Click.*not present/u);
  });

  it("accepts a validated model clip and has no implicit runtime fallback", () => {
    expect(
      resolveConfig({
        model: "/model.inp",
        fallback: "/fallback.png",
        animations: [click],
        interactions: { click: { animation: "Click" } },
      }).interactions.click,
    ).toEqual({ animation: "Click" });
    expect(
      resolveConfig({
        model: "/model.inp",
        fallback: "/fallback.png",
      }).interactions.click,
    ).toBe(false);
  });
});
