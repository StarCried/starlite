import { describe, expect, it } from "vitest";

import { resolveConfig } from "../src/config.js";
import type { WidgetConfig } from "../src/types.js";

function malformed(value: unknown): WidgetConfig {
  return value as WidgetConfig;
}

describe("widget configuration validation", () => {
  it("keeps pass-through opt-in, disables implicit drag and rejects an explicit conflict", () => {
    const base = { model: "/model.inp", fallback: "/fallback.png" };
    expect(resolveConfig(base).interactions).toMatchObject({ passThrough: false, drag: true });
    expect(resolveConfig({ ...base, interactions: { passThrough: true } }).interactions).toMatchObject({ passThrough: true, drag: false });
    expect(() => resolveConfig({ ...base, interactions: { passThrough: true, drag: true } })).toThrow(/cannot be combined/);
    expect(() => resolveConfig(malformed({ ...base, interactions: { passThrough: "yes" } }))).toThrow(/passThrough must be a boolean/);
  });
  it("resolves animation-bound dialogue and rejects incomplete mappings", () => {
    const clip = { timestepMs: 100, length: 10, leadIn: 0, leadOut: 8, weight: 1, lanes: [{ parameter: "move", defaultValues: [0, 0], interpolation: "linear", keyframes: [{ frame: 0, value: 0, tension: 0 }, { frame: 10, value: 0, tension: 0 }] }] };
    const config = { model: "/model.inp", fallback: "/fallback.png", interactions: { click: false }, animations: [{ ...clip, name: "Wave" }, { ...clip, name: "Nod" }], dialogue: { click: { animation: "Wave", animations: ["Wave", "Nod"], linesByAnimation: { Wave: [" Hello "], Nod: ["Yes"] } } } };
    expect(resolveConfig(malformed(config)).dialogue.click).toMatchObject({ linesByAnimation: { Wave: ["Hello"], Nod: ["Yes"] } });
    config.dialogue.click.linesByAnimation = { Wave: ["Hi"] } as any;
    expect(() => resolveConfig(malformed(config))).toThrow(/cover exactly/);
  });
  it("rejects malformed URLs, sections, and booleans at the boundary", () => {
    expect(() => resolveConfig(malformed(null))).toThrow(/must be an object/u);
    expect(() =>
      resolveConfig(malformed({ model: 3, fallback: "/fallback.png" })),
    ).toThrow(/model URL/u);
    expect(() =>
      resolveConfig(
        malformed({
          model: "/model.inp",
          fallback: "/fallback.png",
          render: [],
        }),
      ),
    ).toThrow(/render must be an object/u);
    expect(() =>
      resolveConfig(
        malformed({
          model: "/model.inp",
          fallback: "/fallback.png",
          mobile: { show: "yes" },
        }),
      ),
    ).toThrow(/mobile\.show must be a boolean/u);
  });

  it("rejects malformed animation and parameter collections", () => {
    expect(() =>
      resolveConfig(
        malformed({
          model: "/model.inp",
          fallback: "/fallback.png",
          animations: {},
        }),
      ),
    ).toThrow(/animations/u);
    expect(() =>
      resolveConfig(
        malformed({
          model: "/model.inp",
          fallback: "/fallback.png",
          parameters: { breath: 42 },
        }),
      ),
    ).toThrow(/parameters\.breath\[0\]\.id/u);
  });
});
