import { expect, it } from "vitest";
import { DialogueScheduler } from "../src/dialogue.js";

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
