import { describe, expect, it } from "vitest";

import { resolveConfig } from "../src/config.js";
import { MotionMixer } from "../src/motion.js";
import type { ParameterIds } from "../src/types.js";

const ids = {
  breath: "Breath",
  eyeOpenLeft: "EyeOpenL",
  eyeOpenRight: "EyeOpenR",
  eyeX: "EyeX",
  eyeY: "EyeY",
  headX: "HeadX",
  headY: "HeadY",
  bodyX: "BodyX",
};

function bindings(parameters: Partial<ParameterIds> = ids) {
  return resolveConfig({
    model: "/model.inp",
    fallback: "/fallback.png",
    parameters,
    interactions: { click: false },
  }).parameters;
}

describe("MotionMixer", () => {
  it("returns a neutral still pose for reduced motion", () => {
    const mixer = new MotionMixer({
      bindings: bindings(),
      random: () => 0,
    });
    mixer.setPointer(1, -1);

    const values = mixer.sample(180, true);
    expect(values.get("Breath")).toBe(0);
    expect(values.get("EyeOpenL")).toBe(1);
    expect(values.get("HeadX")).toBe(0);
  });

  it("applies pointer and drag values", () => {
    const mixer = new MotionMixer({
      bindings: bindings(),
      random: () => 0.5,
    });
    mixer.setPointer(0.8, -0.5);
    mixer.setDragBody(0.7);

    const values = mixer.sample(400, false);
    expect(values.get("EyeX")).toBeCloseTo(0.8);
    expect(values.get("HeadY")).toBeCloseTo(0.175);
    expect(values.get("BodyX")).toBeCloseTo(0.7);
  });

  it("combines vector axes, inverts blink, and fans out one channel", () => {
    const mixer = new MotionMixer({
      bindings: bindings({
        ...ids,
        eyeOpenLeft: { id: "Eye:: Left:: Blink", scale: -1, offset: 1 },
        eyeOpenRight: { id: "Eye:: Right:: Blink", scale: -1, offset: 1 },
        eyeX: ["Eye:: Left:: Move", "Eye:: Right:: Move"],
        eyeY: null,
        headX: { id: "Head:: Yaw-Pitch", axis: "x" },
        headY: { id: "Head:: Yaw-Pitch", axis: "y" },
      }),
      random: () => 0.5,
    });
    mixer.setPointer(0.8, -0.5);

    const values = mixer.sample(400, false);
    expect(values.get("Eye:: Left:: Blink")).toBe(0);
    expect(values.get("Eye:: Left:: Move")).toBeCloseTo(0.8);
    expect(values.get("Eye:: Right:: Move")).toBeCloseTo(0.8);
    const head = values.get("Head:: Yaw-Pitch");
    expect(head).toBeInstanceOf(Array);
    expect((head as readonly [number, number])[0]).toBeCloseTo(0.36);
    expect((head as readonly [number, number])[1]).toBeCloseTo(0.175);
  });

  it("returns the body channel to neutral when drag is released", () => {
    const mixer = new MotionMixer({
      bindings: bindings(),
      random: () => 0.5,
    });
    mixer.setDragBody(0.8);
    expect(mixer.sample(100, false).get("BodyX")).toBeCloseTo(0.8);

    mixer.releaseDrag();
    expect(mixer.sample(200, false).get("BodyX")).toBe(0);
  });

  it("keeps blink scheduling finite when an injected RNG misbehaves", () => {
    const mixer = new MotionMixer({
      bindings: bindings(),
      random: () => Number.NaN,
    });

    expect(mixer.sample(4_099, false).get("EyeOpenL")).toBe(1);
    expect(mixer.sample(4_100, false).get("EyeOpenL")).toBe(1);
    expect(mixer.sample(4_180, false).get("EyeOpenL")).toBe(0);
  });
});
