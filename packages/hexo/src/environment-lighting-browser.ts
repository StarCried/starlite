import type { HexoEnvironmentLighting } from "./types";

/** Self-contained: serialized into the bootstrap without another runtime import. */
export function createEnvironmentLighting(input: HexoEnvironmentLighting, scope: typeof globalThis = globalThis) {
  const doc = scope.document;
  const media = input.darkColor === undefined && input.brightness === undefined && input.darkBrightness === undefined
    ? undefined : scope.matchMedia("(prefers-color-scheme: dark)");
  const attributes = ["data-theme", "data-color-mode", "data-user-color-scheme", "class"];
  const dark = () => {
    for (const element of [doc.documentElement, doc.body]) {
      if (!element) continue;
      for (const name of attributes.slice(0, 3)) {
        const value = element.getAttribute(name)?.toLowerCase();
        if (value === "dark" || value === "light") return value === "dark";
      }
      if (element.classList.contains("dark") || element.classList.contains("dark-mode")) return true;
      if (element.classList.contains("light") || element.classList.contains("light-mode")) return false;
    }
    return media?.matches ?? false;
  };
  const current = () => {
    const isDark = dark(), brightness = isDark ? input.darkBrightness : input.brightness;
    // Each mode owns its brightness. Omitting it restores automatic luminance
    // from that mode's colour, rather than inheriting the previous mode's gain.
    return {color:isDark ? input.darkColor ?? input.color : input.color,
      ...(input.strength !== undefined ? {strength:input.strength} : {}),
      ...(brightness !== undefined ? {brightness} : {})};
  };
  let observer: MutationObserver | undefined;
  let listener: (() => void) | undefined;
  const destroy = () => { observer?.disconnect(); observer = undefined; if (listener) media?.removeEventListener("change", listener); listener = undefined; };
  return {current, destroy, attach(controller: {setEnvironmentLighting?: (value: {color: string; strength?: number; brightness?: number}) => void}) {
    destroy();
    if (!controller.setEnvironmentLighting) return;
    let previous = "";
    const update = () => {
      const value = current(), signature = JSON.stringify(value);
      if (signature === previous) return;
      controller.setEnvironmentLighting!(value); previous = signature;
    };
    update();
    if (!media) return;
    let body = doc.body;
    const observe = () => {
      observer!.disconnect();
      observer!.observe(doc.documentElement, {attributes:true, attributeFilter:attributes, childList:true});
      if (body) observer!.observe(body, {attributes:true, attributeFilter:attributes});
    };
    observer = new scope.MutationObserver(() => {
      if (body !== doc.body) { body = doc.body; observe(); }
      update();
    });
    observe(); listener = update; media.addEventListener("change", listener);
  }};
}
