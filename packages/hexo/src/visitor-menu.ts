import type { BrowserWidgetConfig } from "./types";

/** This function is serialized into the bootstrap. Keep it self-contained. */
export function installVisitorMenu(runtime: any, state: any, options: {
  config: BrowserWidgetConfig;
  position?: { right: number; bottom: number; zIndex: number };
}): void {
  if (typeof runtime.QuickSettingsMenu !== "function") return;
  state.quickSettings?.destroy();
  const host = state.host as HTMLElement;
  const controller = state.controller;
  const config = options.config;
  const storageKey = "starlite:visitor-settings:v1";
  const baseWidth = config.display?.width ?? 320;
  const baseHeight = config.display?.height ?? 480;
  const pointerAllowed = config.interactions?.pointer !== false;
  const bubblesAllowed = Object.values(config.dialogue ?? {}).some(scene => scene !== false && scene !== undefined);
  const defaults = {
    scale: 1,
    fps: config.render?.fps ?? 30,
    performance: config.performance?.show ?? false,
    pointer: pointerAllowed,
    bubbles: bubblesAllowed,
  };
  let saved: Record<string, unknown> = {};
  try {
    const value = JSON.parse(globalThis.localStorage.getItem(storageKey) ?? "{}");
    if (value && typeof value === "object" && !Array.isArray(value)) saved = value;
  } catch { /* Browsing remains available when storage is blocked. */ }
  const preferences = {
    scale: typeof saved.scale === "number" && Number.isFinite(saved.scale) && saved.scale >= .5 && saved.scale <= 1.5 ? saved.scale : defaults.scale,
    fps: saved.fps === 30 || saved.fps === 60 ? saved.fps : defaults.fps,
    performance: typeof saved.performance === "boolean" ? saved.performance : defaults.performance,
    pointer: pointerAllowed && (typeof saved.pointer === "boolean" ? saved.pointer : defaults.pointer),
    bubbles: bubblesAllowed && (typeof saved.bubbles === "boolean" ? saved.bubbles : defaults.bubbles),
  };
  let paused = false;
  let hidden = false;
  let mask: any;
  const position = options.position;
  const recovery = document.createElement("button");
  recovery.type = "button";
  recovery.dataset.starliteWidgetRestore = "";
  recovery.textContent = "显示角色";
  recovery.setAttribute("aria-label", "重新显示 StarLite 角色");
  Object.assign(recovery.style, {
    position: "fixed", right: "16px", bottom: "16px", zIndex: String(position?.zIndex ?? 20),
    border: "1px solid #9c8fba", borderRadius: "999px", padding: "8px 14px",
    background: "#272333", color: "#faf7ff", font: "500 13px/1.5 system-ui,sans-serif",
    cursor: "pointer", boxShadow: "0 4px 20px #0003", pointerEvents: "auto", display: "none",
  });
  recovery.hidden = true;
  document.body.append(recovery);
  const save = () => {
    try { globalThis.localStorage.setItem(storageKey, JSON.stringify(preferences)); } catch { /* Optional visitor preferences. */ }
  };
  const apply = () => {
    controller.setDisplaySize?.(baseWidth * preferences.scale, baseHeight * preferences.scale);
    controller.setFrameRate?.(preferences.fps);
    controller.setPerformanceVisible?.(preferences.performance);
    controller.setPointerEnabled?.(preferences.pointer);
    controller.setBubblesVisible?.(preferences.bubbles);
  };
  const set = (key: keyof typeof preferences, value: any) => {
    (preferences as any)[key] = value;
    if (key === "scale") controller.setDisplaySize?.(baseWidth * preferences.scale, baseHeight * preferences.scale);
    else if (key === "fps") controller.setFrameRate?.(preferences.fps);
    else if (key === "performance") controller.setPerformanceVisible?.(preferences.performance);
    else if (key === "pointer") controller.setPointerEnabled?.(preferences.pointer);
    else if (key === "bubbles") controller.setBubblesVisible?.(preferences.bubbles);
    save(); menu.update(menuOptions());
  };
  const restorePosition = () => {
    host.style.removeProperty("left"); host.style.removeProperty("top");
    if (position) {
      host.style.right = `${position.right}px`;
      host.style.bottom = `${position.bottom}px`;
    } else {
      host.style.removeProperty("right"); host.style.removeProperty("bottom");
    }
  };
  const setHidden = (value: boolean) => {
    hidden = value;
    recovery.hidden = !hidden;
    recovery.style.display = hidden ? "inline-flex" : "none";
    if (hidden) {
      host.style.setProperty("visibility", "hidden", "important");
      host.style.setProperty("pointer-events", "none", "important");
      controller.pause(); menu.close();
    } else {
      host.style.removeProperty("visibility");
      host.style.removeProperty("pointer-events");
      if (config.interactions?.passThrough) host.style.pointerEvents = "none";
      if (!paused) controller.resume();
    }
  };
  recovery.addEventListener("click", () => setHidden(false));
  const menuOptions = () => ({
    title: "StarLite",
    tabs: [
      { id: "display", label: "显示", items: [
        { id: "size", kind: "range", label: "模型大小", value: Math.round(preferences.scale * 100), min: 50, max: 150, step: 5,
          disabled: typeof controller.setDisplaySize !== "function", formatValue: (value: number) => `${value}%`, onChange: (value: number) => set("scale", value / 100) },
        { id: "reset-size", kind: "action", label: "恢复默认大小", disabled: typeof controller.setDisplaySize !== "function", onAction: () => set("scale", 1) },
        { id: "fps", kind: "select", label: "帧率上限", value: String(preferences.fps),
          disabled: typeof controller.setFrameRate !== "function",
          options: [...(preferences.fps !== 30 && preferences.fps !== 60 ? [{ value: String(preferences.fps), label: preferences.fps === "display" ? "跟随屏幕" : `${preferences.fps} FPS` }] : []), { value: "30", label: "30 FPS" }, { value: "60", label: "60 FPS" }],
          onChange: (value: string) => set("fps", Number(value)) },
        { id: "performance", kind: "toggle", label: "显示性能", value: preferences.performance,
          disabled: typeof controller.setPerformanceVisible !== "function", onChange: (value: boolean) => set("performance", value) },
        { id: "reset-position", kind: "action", label: "恢复默认位置", onAction: restorePosition },
        { id: "hide", kind: "action", label: "暂时隐藏角色", onAction: () => setHidden(true) },
      ] },
      { id: "interaction", label: "互动", items: [
        { id: "pointer", kind: "toggle", label: "跟随光标", value: preferences.pointer,
          disabled: !pointerAllowed || typeof controller.setPointerEnabled !== "function", onChange: (value: boolean) => set("pointer", value) },
        { id: "bubbles", kind: "toggle", label: "显示气泡", value: preferences.bubbles,
          disabled: !bubblesAllowed || typeof controller.setBubblesVisible !== "function", onChange: (value: boolean) => set("bubbles", value) },
        { id: "pause", kind: "toggle", label: "暂停动画", value: paused, onChange: (value: boolean) => {
          paused = value;
          if (paused) controller.pause(); else if (!hidden) controller.resume();
          menu.update(menuOptions());
        } },
      ] },
    ],
  });
  const menu = new runtime.QuickSettingsMenu(menuOptions());
  const hit = (event: MouseEvent): boolean => {
    if (!mask || hidden || !host.isConnected || host.style.visibility === "hidden") return false;
    const x = event.clientX - mask.left, y = event.clientY - mask.top;
    if (x < 0 || y < 0 || x >= mask.displayWidth || y >= mask.displayHeight) return false;
    const column = Math.floor(x / mask.displayWidth * mask.width);
    const row = Math.floor(y / mask.displayHeight * mask.height);
    const pixel = row * mask.width + column;
    return Boolean(mask.bits[pixel >> 3] & (1 << (pixel & 7)));
  };
  const contextmenu = (event: MouseEvent) => {
    if (event.shiftKey || menu.element.contains(event.target as Node) || !hit(event)) return;
    event.preventDefault(); event.stopPropagation(); menu.open(event.clientX, event.clientY);
  };
  document.addEventListener("contextmenu", contextmenu, true);
  controller.observeInteractionMask?.((value: any) => { mask = value; });
  apply();
  state.quickSettings = {
    menu, recovery,
    reattach() { if (!menu.element.isConnected) document.body.append(menu.element); if (!recovery.isConnected) document.body.append(recovery); },
    destroy() { document.removeEventListener("contextmenu", contextmenu, true); controller.observeInteractionMask?.(); menu.destroy(); recovery.remove(); mask = undefined; },
  };
}
