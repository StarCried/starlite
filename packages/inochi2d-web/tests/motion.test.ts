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
  click: "HeadZ",
};

function bindings(parameters: Partial<ParameterIds> = ids) {
  return resolveConfig({
    model: "/model.inp",
    fallback: "/fallback.png",
    parameters,
  }).parameters;
}

describe("MotionMixer", () => {
  it("returns a neutral still pose for reduced motion", () => {
    const mixer = new MotionMixer({ bindings: bindings(), clickAmplitude: 0.4, random: () => 0 });
    mixer.setPointer(1, -1);
    mixer.triggerClick(100);

    const values = mixer.sample(180, true);
    expect(values.get("Breath")).toBe(0);
    expect(values.get("EyeOpenL")).toBe(1);
    expect(values.get("HeadX")).toBe(0);
    expect(values.get("HeadZ")).toBe(0);
  });

  it("applies pointer, drag, and click values", () => {
    const mixer = new MotionMixer({
      bindings: bindings(),
      clickAmplitude: 0.4,
      random: () => 0.5,
    });
    mixer.setPointer(0.8, -0.5);
    mixer.setDragBody(0.7);
    mixer.triggerClick(100);

    const values = mixer.sample(280, false);
    expect(values.get("EyeX")).toBeCloseTo(0.8);
    expect(values.get("HeadY")).toBeCloseTo(0.175);
    expect(values.get("BodyX")).toBeCloseTo(0.7);
    expect(values.get("HeadZ")).toBeCloseTo(0.4);
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
        click: [{ id: "Arm:: Left:: Move", scale: 2 }],
      }),
      clickAmplitude: 0.4,
      random: () => 0.5,
    });
    mixer.setPointer(0.8, -0.5);
    mixer.triggerClick(100);

    const values = mixer.sample(280, false);
    expect(values.get("Eye:: Left:: Blink")).toBe(0);
    expect(values.get("Eye:: Left:: Move")).toBeCloseTo(0.8);
    expect(values.get("Eye:: Right:: Move")).toBeCloseTo(0.8);
    const head = values.get("Head:: Yaw-Pitch");
    expect(head).toBeInstanceOf(Array);
    expect((head as readonly [number, number])[0]).toBeCloseTo(0.36);
    expect((head as readonly [number, number])[1]).toBeCloseTo(0.175);
    expect(values.get("Arm:: Left:: Move")).toBeCloseTo(0.8);
  });
});
