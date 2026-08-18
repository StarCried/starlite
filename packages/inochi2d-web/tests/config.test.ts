import { describe, expect, it } from "vitest";

import { resolveConfig } from "../src/config.js";
import type { WidgetConfig } from "../src/types.js";

function malformed(value: unknown): WidgetConfig {
  return value as WidgetConfig;
}

describe("widget configuration validation", () => {
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
