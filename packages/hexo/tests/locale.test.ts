import { readFileSync } from "node:fs";
import { EXAMPLE_LICENSES_EN } from "../src/example-licenses.en";
import { expect, it } from "vitest";
import { readLocale } from "../src/locale";
import { resolveDefaultPreset } from "../src/default-preset";
import { createBootstrapSource } from "../src/bootstrap";
import type { HexoWidgetConfig } from "../src/types";
it("inherits the Hexo language and permits only explicit supported overrides", () => {
  expect(readLocale({})).toBe("zh-CN");
  expect(readLocale({language: "en-GB"})).toBe("en");
  expect(readLocale({language: ["zh-TW", "en"]})).toBe("zh-CN");
  expect(readLocale({language: "en", starlite: {locale: "zh-CN"}})).toBe("zh-CN");
  expect(() => readLocale({starlite: {locale: "bad"} as unknown as HexoWidgetConfig})).toThrow("locale");
});
it("localizes only shipped dialogue while preserving animation pools, timing and custom sentences", () => {
  for (const preset of ["weiguang", "bluefish"] as const) {
    const zh = resolveDefaultPreset({preset}, "/model.vrm");
    const en = resolveDefaultPreset({preset, locale: "en"}, "/model.vrm");
    expect(en.interactions).toEqual(zh.interactions);
    for (const scene of ["enter", "click", "idle"] as const) {
      const a = en.dialogue?.[scene], b = zh.dialogue?.[scene];
      if (!a || !b) continue;
      expect(a.animation).toBe(b.animation); expect(a.animations).toEqual(b.animations);
      expect(a.durationMs).toBe(b.durationMs);
      expect(JSON.stringify(a)).not.toMatch(/[\u3400-\u9fff]/u);
    }
    const custom = resolveDefaultPreset({preset, locale: "en", dialogue: {click: {lines: ["我的原句 <b>hello</b>"]}}}, "/model.vrm");
    expect(custom.dialogue?.click && custom.dialogue.click.lines).toEqual(["我的原句 <b>hello</b>"]);
    expect(resolveDefaultPreset({preset}, "/model.vrm")).toEqual(zh);
  }
});
it("serializes locale with the existing mobile guard and self-contained visitor menu", () => {
  const source = createBootstrapSource({entryUrl:"/runtime/index.js",config:{backend:"vrm",model:"/m.vrm",fallback:"/f.png",locale:"en"},breakpoint:768,showOnMobile:false});
  expect(source).toContain('"locale":"en"');
  expect(source).toContain('Show character');
});

it("ships model-term translations exactly as the linked documents", () => {
  for (const id of ["weiguang", "bluefish"] as const) {
    expect(EXAMPLE_LICENSES_EN[id]).toBe(readFileSync(new URL(`../../../docs/${id}-license.en.md`, import.meta.url), "utf8"));
  }
});
