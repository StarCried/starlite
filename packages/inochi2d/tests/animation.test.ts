import { describe, expect, it } from "vitest";

import {
  AnimationPlayer,
  loopFrame,
  sampleLane,
} from "../src/animation.js";
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

const tailIdle: AnimationClip = {
  name: "TailIdle",
  timestepMs: 100,
  length: 12,
  leadIn: 2,
  leadOut: 10,
  weight: 1,
  lanes: [
    {
      parameter: "Tail:: Swing",
      defaultValues: [0, 0],
      interpolation: "linear",
      keyframes: [
        { frame: 0, value: 0, tension: 0 },
        { frame: 2, value: -1, tension: 0 },
        { frame: 6, value: 1, tension: 0 },
        { frame: 10, value: -1, tension: 0 },
        { frame: 12, value: 0, tension: 0 },
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

  it("loops a dynamic foreground clip until explicitly stopped", async () => {
    const player = new AnimationPlayer(new Map([[click.name, click]]));
    const values = new Map<string, number | readonly [number, number]>();
    const playback = player.trigger("Click", 0, { mode: "loop" });

    player.apply(values, 500, false);
    expect(values.get("Arm:: Right:: Move")).toBe(1);
    expect(player.isActive(10_000)).toBe(true);

    player.stop();
    await expect(playback).resolves.toBe("stopped");
    values.clear();
    player.apply(values, 1_600, false);
    expect(values.get("Arm:: Right:: Move")).toBe(0);
  });

  it("settles interrupted and completed foreground playbacks", async () => {
    const greeting: AnimationClip = { ...click, name: "Greeting" };
    const player = new AnimationPlayer(
      new Map([
        [click.name, click],
        [greeting.name, greeting],
      ]),
    );
    const first = player.trigger("Click", 0);
    const second = player.trigger("Greeting", 100);

    await expect(first).resolves.toBe("interrupted");
    player.apply(new Map(), 1_100, false);
    await expect(second).resolves.toBe("completed");
  });

  it("restores lanes from an action interrupted by a different action", () => {
    const greeting: AnimationClip = {
      ...click,
      name: "Greeting",
      lanes: [
        {
          ...click.lanes[0]!,
          parameter: "Head:: Greeting",
          defaultValues: [0.25, 0],
        },
      ],
    };
    const player = new AnimationPlayer(
      new Map([
        [greeting.name, greeting],
        [click.name, click],
      ]),
    );
    const values = new Map<string, number | readonly [number, number]>();
    player.trigger("Greeting", 0);
    player.apply(values, 500, false);
    expect(values.get("Head:: Greeting")).toBe(1);

    player.trigger("Click", 500);
    values.clear();
    player.apply(values, 600, false);
    expect(values.get("Head:: Greeting")).toBe(0.25);
    expect(values.get("Arm:: Right:: Move")).toBeCloseTo(0.2);
  });

  it("loops a model-authored ambient clip inside its Creator loop region", () => {
    expect(loopFrame(tailIdle, 0)).toBe(0);
    expect(loopFrame(tailIdle, 900)).toBe(9);
    expect(loopFrame(tailIdle, 1_000)).toBe(2);
    expect(loopFrame(tailIdle, 1_400)).toBe(6);

    const player = new AnimationPlayer(
      new Map([[tailIdle.name, tailIdle]]),
      ["TailIdle"],
    );
    const values = new Map<string, number | readonly [number, number]>();
    player.apply(values, 1_000, false);
    expect(values.get("Tail:: Swing")).toBe(0);

    values.clear();
    player.apply(values, 1_600, false);
    expect(values.get("Tail:: Swing")).toBe(1);

    values.clear();
    player.apply(values, 2_000, false);
    expect(values.get("Tail:: Swing")).toBe(-1);
  });

  it("lets a foreground clip win and resumes the current ambient phase", () => {
    const foreground: AnimationClip = {
      ...click,
      name: "TailTap",
      lanes: [
        {
          ...click.lanes[0]!,
          parameter: "Tail:: Swing",
        },
      ],
    };
    const player = new AnimationPlayer(
      new Map([
        [tailIdle.name, tailIdle],
        [foreground.name, foreground],
      ]),
      ["TailIdle"],
    );
    const values = new Map<string, number | readonly [number, number]>();
    player.apply(values, 0, false);
    player.trigger("TailTap", 100);

    values.clear();
    player.apply(values, 600, false);
    expect(values.get("Tail:: Swing")).toBe(1);

    values.clear();
    player.apply(values, 1_100, false);
    expect(values.get("Tail:: Swing")).toBe(0);

    values.clear();
    player.apply(values, 1_300, false);
    expect(values.get("Tail:: Swing")).toBe(0.5);
  });

  it("does not run model-authored loops in reduced-motion mode", () => {
    const player = new AnimationPlayer(
      new Map([[tailIdle.name, tailIdle]]),
      ["TailIdle"],
    );
    const values = new Map<string, number | readonly [number, number]>();
    player.apply(values, 0, false);
    values.clear();
    player.apply(values, 600, true);
    expect(values.get("Tail:: Swing")).toBe(0);
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

  it("validates ambient animation names and rejects overlapping loop lanes", () => {
    expect(
      resolveConfig({
        model: "/model.inp",
        fallback: "/fallback.png",
        animations: [tailIdle],
        ambient: { animations: ["TailIdle"] },
      }).ambient.animations,
    ).toEqual(["TailIdle"]);

    expect(() =>
      resolveConfig({
        model: "/model.inp",
        fallback: "/fallback.png",
        animations: [tailIdle],
        ambient: { animations: ["Missing"] },
      }),
    ).toThrow(/Missing.*not present/u);

    expect(() =>
      resolveConfig({
        model: "/model.inp",
        fallback: "/fallback.png",
        animations: [
          tailIdle,
          { ...tailIdle, name: "TailIdle2" },
        ],
        ambient: { animations: ["TailIdle", "TailIdle2"] },
      }),
    ).toThrow(/overlaps another ambient animation/u);
  });

  it("validates procedural ambient parameters and rejects overlapping targets", () => {
    const resolved = resolveConfig({
      model: "/model.inp",
      fallback: "/fallback.png",
      ambient: {
        parameters: [
          {
            id: "Tail",
            minimum: -0.55,
            maximum: 0.55,
            periodMs: 4_200,
            phase: 0.1,
          },
        ],
      },
    });
    expect(resolved.ambient.parameters).toEqual([
      {
        id: "Tail",
        minimum: -0.55,
        maximum: 0.55,
        periodMs: 4_200,
        phase: 0.1,
      },
    ]);

    expect(() =>
      resolveConfig({
        model: "/model.inp",
        fallback: "/fallback.png",
        animations: [tailIdle],
        ambient: {
          animations: ["TailIdle"],
          parameters: [
            {
              id: "Tail:: Swing",
              minimum: -1,
              maximum: 1,
              periodMs: 4_000,
            },
          ],
        },
      }),
    ).toThrow(/overlaps another ambient source/u);

    expect(() =>
      resolveConfig({
        model: "/model.inp",
        fallback: "/fallback.png",
        ambient: {
          parameters: [
            {
              id: "Tail",
              minimum: 1,
              maximum: -1,
              periodMs: 4_000,
            },
          ],
        },
      }),
    ).toThrow(/maximum must be greater/u);
  });

  it("validates every enabled dialogue scene and sentence library", () => {
    const resolved = resolveConfig({
      model: "/model.inp",
      fallback: "/fallback.png",
      animations: [click],
      dialogue: {
        enter: {
          animation: "Click",
          lines: [" Welcome! "],
          delayMs: 250,
        },
        idle: {
          animation: "Click",
          lines: ["Still here."],
          intervalMinMs: 5_000,
          intervalMaxMs: 6_000,
        },
        click: {
          animation: "Click",
          lines: ["Hello!"],
        },
      },
    });
    expect(resolved.dialogue.enter).toMatchObject({
      animation: "Click",
      lines: ["Welcome!"],
      delayMs: 250,
    });
    expect(resolved.dialogue.idle).toMatchObject({
      intervalMinMs: 5_000,
      intervalMaxMs: 6_000,
    });

    expect(() =>
      resolveConfig({
        model: "/model.inp",
        fallback: "/fallback.png",
        animations: [click],
        dialogue: {
          click: { animation: "Missing", lines: ["Hello"] },
        },
      }),
    ).toThrow(/Missing.*not present/u);
    expect(() =>
      resolveConfig({
        model: "/model.inp",
        fallback: "/fallback.png",
        animations: [click],
        dialogue: {
          click: { animation: "Click", lines: [] },
        },
      }),
    ).toThrow(/1\.\.=128/u);
  });

  it("rejects conflicting legacy and dialogue click animations", () => {
    const other = { ...click, name: "Other" };
    expect(() =>
      resolveConfig({
        model: "/model.inp",
        fallback: "/fallback.png",
        animations: [click, other],
        interactions: { click: { animation: "Click" } },
        dialogue: {
          click: { animation: "Other", lines: ["Hello"] },
        },
      }),
    ).toThrow(/must match/u);
  });
});
