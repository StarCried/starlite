import type { HexoLike } from "./types";

export type StarLiteLocale = "zh-CN" | "en";
/** Resolve once at generation time; site language also controls example dialogue. */
export function readLocale(config: HexoLike["config"]): StarLiteLocale {
  const explicit = config.starlite?.locale;
  if (explicit !== undefined) {
    if (explicit !== "zh-CN" && explicit !== "en") throw new Error("starlite.locale must be zh-CN or en");
    return explicit;
  }
  const language = Array.isArray(config.language) ? config.language[0] : config.language;
  return typeof language === "string" && language.trim() && !/^zh(?:[-_]|$)/i.test(language.trim()) ? "en" : "zh-CN";
}
