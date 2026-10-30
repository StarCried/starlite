/** Supported interface languages; user content is never translated. */
export type StarLiteLocale = "zh-CN" | "en";

/** Accept host language tags (en-US, zh-TW, ...); unsupported languages use English. */
export function resolveLocale(language?: unknown): StarLiteLocale {
  const value = Array.isArray(language) ? language[0] : language;
  if (typeof value !== "string" || !value.trim()) return "zh-CN";
  return /^zh(?:[-_]|$)/i.test(value.trim()) ? "zh-CN" : "en";
}

export function validateLocale(value: unknown): void {
  if (value !== undefined && value !== "zh-CN" && value !== "en") {
    throw new Error("locale must be zh-CN or en");
  }
}
