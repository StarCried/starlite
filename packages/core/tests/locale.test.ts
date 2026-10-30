import { expect, it } from "vitest";
import { resolveLocale, validateLocale } from "../src/locale.js";
it("normalizes host language tags with stable Chinese and English fallbacks", () => {
  expect(resolveLocale()).toBe("zh-CN");
  for (const tag of ["zh", "zh-CN", "zh-TW", "zh_Hans"]) expect(resolveLocale(tag)).toBe("zh-CN");
  for (const tag of ["en", "en-US", "de"]) expect(resolveLocale(tag)).toBe("en");
  expect(resolveLocale(["en-GB", "zh-CN"])).toBe("en");
  expect(() => validateLocale("en-US")).toThrow("locale");
});
