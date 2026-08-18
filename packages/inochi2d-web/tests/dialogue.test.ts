import { describe, expect, it } from "vitest";

import { DialogueScheduler } from "../src/dialogue.js";
import type { ResolvedWidgetConfig } from "../src/types.js";

function dialogueConfig(): ResolvedWidgetConfig["dialogue"] {
  return {
    enter: {
      animation: "Greeting",
      lines: ["Welcome", "Hello"],
      durationMs: 1_000,
      delayMs: 200,
    },
    idle: {
      animation: "Idle",
      lines: ["Still here"],
      durationMs: 2_000,
      intervalMinMs: 5_000,
      intervalMaxMs: 7_000,
    },
    click: {
      animation: "Click",
      lines: ["Ouch", "Hi"],
      durationMs: 500,
    },
  };
}

describe("DialogueScheduler", () => {
  it("delivers enter once, then a randomized idle scene", () => {
    const scheduler = new DialogueScheduler(dialogueConfig(), () => 0.5);
    scheduler.start(1_000);

    expect(scheduler.poll(1_199, false)).toBeUndefined();
    expect(scheduler.poll(1_200, false)).toEqual({
      scene: "enter",
      animation: "Greeting",
      line: "Hello",
      durationMs: 1_000,
    });
    expect(scheduler.poll(8_199, false)).toBeUndefined();
    expect(scheduler.poll(8_200, false)).toEqual({
      scene: "idle",
      animation: "Idle",
      line: "Still here",
      durationMs: 2_000,
    });
  });

  it("lets click act immediately and postpones idle speech", () => {
    const scheduler = new DialogueScheduler(dialogueConfig(), () => 0);
    scheduler.start(0);
    expect(scheduler.poll(200, false)).toMatchObject({ scene: "enter" });
    expect(scheduler.triggerClick(1_000)).toEqual({
      scene: "click",
      animation: "Click",
      line: "Ouch",
      durationMs: 500,
    });
    expect(scheduler.poll(6_499, false)).toBeUndefined();
    expect(scheduler.poll(6_500, false)).toMatchObject({ scene: "idle" });
  });

  it("does not interrupt an active foreground action", () => {
    const scheduler = new DialogueScheduler(dialogueConfig(), () => 0);
    scheduler.start(0);
    expect(scheduler.poll(500, true)).toBeUndefined();
    expect(scheduler.poll(500, false)).toMatchObject({ scene: "enter" });
  });

  it("never delivers natural idle speech before a delayed entry scene", () => {
    const config = dialogueConfig();
    const scheduler = new DialogueScheduler(
      {
        ...config,
        enter: config.enter && { ...config.enter, delayMs: 10_000 },
        idle:
          config.idle && {
            ...config.idle,
            intervalMinMs: 5_000,
            intervalMaxMs: 5_000,
          },
      },
      () => 0,
    );
    scheduler.start(0);

    expect(scheduler.poll(5_000, false)).toBeUndefined();
    expect(scheduler.poll(10_000, false)).toMatchObject({ scene: "enter" });
    expect(scheduler.poll(16_000, false)).toMatchObject({ scene: "idle" });
  });

  it("can make enter immediate for the one-frame reduced-motion path", () => {
    const scheduler = new DialogueScheduler(dialogueConfig(), () => 0);
    scheduler.start(1_000, true);
    expect(scheduler.poll(1_000, false)).toMatchObject({ scene: "enter" });
  });

  it("clamps invalid random values without escaping the sentence array", () => {
    const scheduler = new DialogueScheduler(dialogueConfig(), () => Infinity);
    scheduler.start(0, true);
    expect(scheduler.poll(0, false)).toMatchObject({ line: "Welcome" });
  });
});
