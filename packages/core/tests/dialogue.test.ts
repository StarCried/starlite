import { expect, it } from "vitest";
import { DialogueScheduler, resolveDialogueSentences } from "../src/dialogue.js";

it("schedules text-only scenes without inventing an animation", () => {
  const sentences = resolveDialogueSentences({lines:["Hello"]}, [], "dialogue.click");
  const scheduler = new DialogueScheduler({enter:false,idle:false,click:{...sentences,durationMs:1000}}, () => 0);
  expect(scheduler.triggerClick(0)).toEqual({scene:"click",line:"Hello",durationMs:1000});
  expect(() => resolveDialogueSentences({linesByAnimation:{}}, [], "dialogue.click")).toThrow("needs an animation");
});

it("draws from click and idle pools on each trigger and respects foreground priority", () => {
  let value = 0;
  const scheduler = new DialogueScheduler({
    enter: false,
    idle: {animation:"Yawn",animations:["Yawn","Stretch"],lines:["Rest"],durationMs:100,intervalMinMs:1000,intervalMaxMs:1000},
    click: {animation:"Wave",animations:["Wave","Nod"],lines:["Hi"],durationMs:100},
  }, () => value);
  scheduler.start(0);
  expect(scheduler.triggerClick(0)?.animation).toBe("Wave");
  value = .99;
  expect(scheduler.triggerClick(0)?.animation).toBe("Nod");
  expect(scheduler.poll(1100,true)).toBeUndefined();
  expect(scheduler.poll(1100,false)?.animation).toBe("Stretch");
  value = 0;
  expect(scheduler.poll(2200,false)?.animation).toBe("Yawn");
});

it.each(["enter", "idle", "click"] as const)("pairs %s animation with only its bound sentences", scene => {
  const draws: number[] = [];
  const bound = { animation: "Wave", animations: ["Wave", "Nod"], lines: ["Legacy must not win"], linesByAnimation: { Wave: ["Hello", "Hi"], Nod: ["Agreed", "Yes"] }, durationMs: 100 };
  const scheduler = new DialogueScheduler({
    enter: scene === "enter" ? { ...bound, delayMs: 0 } : false,
    idle: scene === "idle" ? { ...bound, intervalMinMs: 1000, intervalMaxMs: 1000 } : false,
    click: scene === "click" ? bound : false,
  }, () => draws.shift() ?? 0);
  scheduler.start(0);
  draws.push(.99, 0);
  const action = scene === "click" ? scheduler.triggerClick(1000) : scheduler.poll(1000, false);
  expect(action).toMatchObject({ animation: "Nod", line: "Agreed" });
});

it("selects multiple possible sentences from a single animation's mapping-only library", () => {
  let value = 0;
  const scheduler = new DialogueScheduler({ enter: false, idle: false, click: { animation: "Wave", linesByAnimation: { Wave: ["Hello", "Hi"] }, durationMs: 100 } }, () => value);
  expect(scheduler.triggerClick(0)?.line).toBe("Hello");
  value = .99;
  expect(scheduler.triggerClick(100)?.line).toBe("Hi");
});

it("keeps the historical sentence-then-animation random draws for legacy scenes", () => {
  const draws = [.99, 0];
  const scheduler = new DialogueScheduler({ enter: false, idle: false, click: { animation: "Wave", animations: ["Wave", "Nod"], lines: ["Hello", "Hi"], durationMs: 100 } }, () => draws.shift()!);
  expect(scheduler.triggerClick(0)).toMatchObject({ animation: "Wave", line: "Hi" });
});

it("normalizes and copies animation-bound sentence libraries without requiring legacy lines", () => {
  const input = { linesByAnimation: { Wave: ["  Hello  "], Nod: ["Yes"] } };
  const result = resolveDialogueSentences(input, ["Wave", "Nod"], "dialogue.click");
  expect(result).toEqual({ linesByAnimation: { Wave: ["Hello"], Nod: ["Yes"] } });
  input.linesByAnimation.Wave[0] = "Changed";
  expect(result.linesByAnimation?.Wave).toEqual(["Hello"]);
});

it.each([
  {}, { linesByAnimation: {} }, { linesByAnimation: { Wave: ["Hi"] } },
  { lines: ["Must not mask missing mapping"], linesByAnimation: { Wave: ["Hi"] } },
  { linesByAnimation: { Wave: ["Hi"], Nod: ["Yes"], Unknown: ["No"] } },
  { linesByAnimation: { Wave: [], Nod: ["Yes"] } },
  { linesByAnimation: { Wave: ["  "], Nod: ["Yes"] } },
  { linesByAnimation: { Wave: [42], Nod: ["Yes"] } },
  { linesByAnimation: { Wave: ["中".repeat(342)], Nod: ["Yes"] } },
  { linesByAnimation: [] },
])("rejects missing, mismatched or malformed bound libraries: %j", input => {
  expect(() => resolveDialogueSentences(input as any, ["Wave", "Nod"], "dialogue.click")).toThrow(/dialogue.click/);
});
