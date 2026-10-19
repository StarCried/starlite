import { expect, it } from "vitest";
import { validateVrmWidgetConfig } from "../src/config.js";
import type { VrmWidgetConfig } from "../src/types.js";

it("accepts an opt-in performance overlay and rejects malformed options", () => {
  for (const performance of [undefined, {}, { show: false }, { show: true }]) {
    expect(() => validateVrmWidgetConfig({ model: "/model.vrm", fallback: "/fallback.png", performance })).not.toThrow();
  }
  for (const performance of [true, null, { show: "true" }]) {
    expect(() => validateVrmWidgetConfig({ model: "/model.vrm", fallback: "/fallback.png", performance } as unknown as VrmWidgetConfig)).toThrow("performance");
  }
});

it("accepts built-in Idle and text-only dialogue without declaring animation assets", () => {
  expect(() => validateVrmWidgetConfig({model:"/model.vrm",fallback:"/fallback.png",ambient:{animations:["StarLiteIdle"]},neutralAnimation:"StarLiteIdle",dialogue:{click:{lines:["Hello"]}}})).not.toThrow();
  expect(() => validateVrmWidgetConfig({model:"/model.vrm",fallback:"/fallback.png",dialogue:{click:{linesByAnimation:{}}}})).toThrow("needs an animation");
});

it.each([undefined, 30, 60, "display"] as const)("accepts frame policy %s", (fps) => {
  expect(() => validateVrmWidgetConfig({ model: "/model.vrm", fallback: "/fallback.png", render: { fps } })).not.toThrow();
});

it.each([0, -1, 144, NaN, Infinity, "60", "auto"])("rejects unsupported frame policy %s", (fps) => {
  expect(() => validateVrmWidgetConfig({ model: "/model.vrm", fallback: "/fallback.png", render: { fps } } as VrmWidgetConfig)).toThrow(/frame rate/);
});

it("accepts animation-bound dialogue and rejects incomplete or unknown mapping keys", () => {
  const config: VrmWidgetConfig = { model: "/model.vrm", fallback: "/fallback.png", animations: [{ name: "Wave", url: "/wave.vrma" }, { name: "Nod", url: "/nod.vrma" }], dialogue: { click: { animation: "Wave", animations: ["Wave", "Nod"], linesByAnimation: { Wave: ["Hello"], Nod: ["Yes", "Agreed"] } } } };
  expect(() => validateVrmWidgetConfig(config)).not.toThrow();
  for (const mapping of [{ Wave: ["Hi"] }, { Wave: ["Hi"], Nod: ["Yes"], Unknown: ["No"] }, { Wave: [" "], Nod: ["Yes"] }]) {
    config.dialogue!.click = { animation: "Wave", animations: ["Wave", "Nod"], linesByAnimation: mapping };
    expect(() => validateVrmWidgetConfig(config)).toThrow(/dialogue.click/);
  }
});
