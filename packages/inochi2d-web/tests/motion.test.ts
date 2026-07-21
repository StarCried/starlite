import { describe, expect, it } from "vitest";

import { MotionMixer } from "../src/motion.js";

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

describe("MotionMixer", () => {
  it("returns a neutral still pose for reduced motion", () => {
    const mixer = new MotionMixer({ ids, clickAmplitude: 0.4, random: () => 0 });
    mixer.setPointer(1, -1);
    mixer.triggerClick(100);

    const values = mixer.sample(180, true);
    expect(values.get("Breath")).toBe(0);
    expect(values.get("EyeOpenL")).toBe(1);
    expect(values.get("HeadX")).toBe(0);
    expect(values.get("HeadZ")).toBe(0);
  });

  it("applies pointer, drag, and click values", () => {
    const mixer = new MotionMixer({ ids, clickAmplitude: 0.4, random: () => 0.5 });
    mixer.setPointer(0.8, -0.5);
    mixer.setDragBody(0.7);
    mixer.triggerClick(100);

    const values = mixer.sample(280, false);
    expect(values.get("EyeX")).toBeCloseTo(0.8);
    expect(values.get("HeadY")).toBeCloseTo(0.175);
    expect(values.get("BodyX")).toBeCloseTo(0.7);
    expect(values.get("HeadZ")).toBeCloseTo(0.4);
  });
});
