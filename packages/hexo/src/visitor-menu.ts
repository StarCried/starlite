import type { BrowserWidgetConfig } from "./types";
import type { createVisitorPlacement } from "./visitor-placement";
import type { observeVisitorDrag } from "./visitor-drag";

/** This function is serialized into the bootstrap. Keep it self-contained. */
export function installVisitorMenu(runtime: any, state: any, options: {
  config: BrowserWidgetConfig;
  position?: { right: number; bottom: number; zIndex: number };
  visitorDrag?: boolean;
}, helpers?: { createPlacement: typeof createVisitorPlacement; observeDrag: typeof observeVisitorDrag }): void {
  if (typeof runtime.QuickSettingsMenu !== "function") return;
  state.quickSettings?.destroy();
  const host = state.host as HTMLElement;
  const controller = state.controller;
  const config = options.config;
  const en = config.locale === "en";
  const text = (zh: string, english: string) => en ? english : zh;
  const storageKey = "starlite:visitor-settings:v1";
  const baseWidth = config.display?.width ?? 320;
  const baseHeight = config.display?.height ?? 480;
  const pointerAllowed = config.interactions?.pointer !== false;
  const baseBubblesAllowed = Object.values(config.dialogue ?? {}).some(scene => scene !== false && scene !== undefined);
  let bubblesAllowed = baseBubblesAllowed || state.pageDialogueAvailable === true;
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
  // Remember the visitor's choice independently of a page's available content.
  let bubbleChoice = typeof saved.bubbles === "boolean" ? saved.bubbles : true;
  const preferences = {
    scale: typeof saved.scale === "number" && Number.isFinite(saved.scale) && saved.scale >= .5 && saved.scale <= 1.5 ? saved.scale : defaults.scale,
    fps: saved.fps === 30 || saved.fps === 60 ? saved.fps : defaults.fps,
    performance: typeof saved.performance === "boolean" ? saved.performance : defaults.performance,
    pointer: pointerAllowed && (typeof saved.pointer === "boolean" ? saved.pointer : defaults.pointer),
    bubbles: bubblesAllowed && bubbleChoice,
  };
  let paused = false;
  let hidden = false;
  let mask: any;
  const position = options.position;
  const savedPosition = saved.position as {x?: unknown; y?: unknown} | undefined;
  const validPosition = savedPosition && typeof savedPosition.x === "number" && typeof savedPosition.y === "number"
    && Number.isFinite(savedPosition.x) && Number.isFinite(savedPosition.y)
    && savedPosition.x >= 0 && savedPosition.x <= 1 && savedPosition.y >= 0 && savedPosition.y <= 1
    ? {x:savedPosition.x,y:savedPosition.y} : undefined;
  const placement = config.backend === "vrm" && helpers && typeof runtime.createVisitorToolbar === "function" && typeof controller.setDisplaySize === "function"
    ? helpers.createPlacement({host,controller,width:baseWidth,height:baseHeight,scale:preferences.scale,
      ...(position ? {position} : {}),...(validPosition ? {saved:validPosition} : {})}) : undefined;
  let toolbar: any;
  let drag: ReturnType<typeof observeVisitorDrag> | undefined;
  let hoverTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
  const clearHoverTimer = () => { globalThis.clearTimeout(hoverTimer); hoverTimer = undefined; };
  let dragging = false;
  const syncToolbar = () => {
    if (!toolbar || !placement) return;
    const point = placement.toolbar;
    toolbar.place(point.x, point.y, position?.zIndex ?? 20);
    toolbar.update({scale:placement.scale,minScale:placement.minScale,maxScale:placement.maxScale,
      bubbles:preferences.bubbles,bubblesAllowed,enabled:!hidden});
  };
  const recovery = document.createElement("button");
  recovery.type = "button";
  recovery.dataset.starliteWidgetRestore = "";
  recovery.textContent = text("显示角色", "Show character");
  recovery.setAttribute("aria-label", text("重新显示 StarLite 角色", "Show the StarLite character again"));
  Object.assign(recovery.style, {
    position: "fixed", right: "16px", bottom: "16px", zIndex: String(position?.zIndex ?? 20),
    border: "1px solid #9c8fba", borderRadius: "999px", padding: "8px 14px",
    background: "#272333", color: "#faf7ff", font: "500 13px/1.5 system-ui,sans-serif",
    cursor: "pointer", boxShadow: "0 4px 20px #0003", pointerEvents: "auto", display: "none",
  });
  recovery.hidden = true;
  document.body.append(recovery);
  const save = () => {
    try { globalThis.localStorage.setItem(storageKey, JSON.stringify({ ...preferences, bubbles: bubbleChoice, ...(placement?.snapshot() ? {position:placement.snapshot()} : {}) })); } catch { /* Optional visitor preferences. */ }
  };
  const apply = () => {
    if (!placement) controller.setDisplaySize?.(baseWidth * preferences.scale, baseHeight * preferences.scale);
    controller.setFrameRate?.(preferences.fps);
    controller.setPerformanceVisible?.(preferences.performance);
    controller.setPointerEnabled?.(preferences.pointer);
    controller.setBubblesVisible?.(preferences.bubbles);
  };
  const set = (key: keyof typeof preferences, value: any) => {
    if (key === "scale") {
      if (placement) value = placement.setScale(value);
      else controller.setDisplaySize?.(baseWidth * value, baseHeight * value);
    }
    else if (key === "fps") controller.setFrameRate?.(value);
    else if (key === "performance") controller.setPerformanceVisible?.(value);
    else if (key === "pointer") controller.setPointerEnabled?.(value);
    else if (key === "bubbles") controller.setBubblesVisible?.(value);
    if (key === "bubbles") bubbleChoice = value;
    (preferences as any)[key] = value;
    save(); menu.update(menuOptions()); syncToolbar();
  };
  const restorePosition = () => {
    if (placement) { placement.reset(); syncToolbar(); menu.update(menuOptions()); save(); controller.refreshInteractionMask?.(); return; }
    host.style.removeProperty("left"); host.style.removeProperty("top");
    if (position) {
      host.style.right = `${position.right}px`;
      host.style.bottom = `${position.bottom}px`;
    } else {
      host.style.removeProperty("right"); host.style.removeProperty("bottom");
    }
    controller.refreshInteractionMask?.();
  };
  const setHidden = (value: boolean) => {
    hidden = value;
    drag?.cancel(); clearHoverTimer(); toolbar?.show(false);
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
      else controller.refreshInteractionMask?.();
    }
    syncToolbar();
  };
  recovery.addEventListener("click", () => setHidden(false));
  const menuOptions = () => ({
    title: "StarLite", locale: config.locale,
    tabs: [
      { id: "display", label: text("显示", "Display"), items: [
        { id: "size", kind: "range", label: text("模型大小", "Model size"), value: Math.round((placement?.scale ?? preferences.scale) * 100), min: 50, max: 150, step: 5,
          disabled: typeof controller.setDisplaySize !== "function", formatValue: (value: number) => `${value}%`, onChange: (value: number) => set("scale", value / 100) },
        { id: "reset-size", kind: "action", label: text("恢复默认大小", "Reset size"), disabled: typeof controller.setDisplaySize !== "function", onAction: () => set("scale", 1) },
        { id: "fps", kind: "select", label: text("帧率上限", "Frame rate limit"), value: String(preferences.fps),
          disabled: typeof controller.setFrameRate !== "function",
          options: [...(preferences.fps !== 30 && preferences.fps !== 60 ? [{ value: String(preferences.fps), label: preferences.fps === "display" ? text("跟随屏幕", "Match display") : `${preferences.fps} FPS` }] : []), { value: "30", label: "30 FPS" }, { value: "60", label: "60 FPS" }],
          onChange: (value: string) => set("fps", Number(value)) },
        { id: "performance", kind: "toggle", label: text("显示性能", "Show performance"), value: preferences.performance,
          disabled: typeof controller.setPerformanceVisible !== "function", onChange: (value: boolean) => set("performance", value) },
        { id: "reset-position", kind: "action", label: text("恢复默认位置", "Reset position"), onAction: restorePosition },
        { id: "hide", kind: "action", label: text("暂时隐藏角色", "Hide character"), onAction: () => setHidden(true) },
      ] },
      { id: "interaction", label: text("互动", "Interaction"), items: [
        { id: "pointer", kind: "toggle", label: text("跟随光标", "Follow pointer"), value: preferences.pointer,
          disabled: !pointerAllowed || typeof controller.setPointerEnabled !== "function", onChange: (value: boolean) => set("pointer", value) },
        { id: "bubbles", kind: "toggle", label: text("显示气泡", "Show bubbles"), value: preferences.bubbles,
          disabled: !bubblesAllowed || typeof controller.setBubblesVisible !== "function", onChange: (value: boolean) => set("bubbles", value) },
        { id: "pause", kind: "toggle", label: text("暂停动画", "Pause animation"), value: paused, onChange: (value: boolean) => {
          paused = value;
          if (paused) controller.pause(); else if (!hidden) controller.resume();
          menu.update(menuOptions());
        } },
      ] },
    ],
  });
  const menu = new runtime.QuickSettingsMenu(menuOptions());
  if (placement) toolbar = runtime.createVisitorToolbar({locale:config.locale,
    onSmaller:() => set("scale",Math.max(.5,Math.round((placement.scale-.1)*100)/100)),
    onLarger:() => set("scale",Math.min(1.5,Math.round((placement.scale+.1)*100)/100)),
    onBubbles:() => set("bubbles",!preferences.bubbles),onHide:() => setHidden(true)});
  const hit = (event: MouseEvent): boolean => {
    if (!mask || hidden || !host.isConnected || host.style.visibility === "hidden") return false;
    // A fixed host can move before its resize event or paused redraw arrives.
    // Map the last rendered pixels to the canvas's current displayed rectangle.
    const rect = host.querySelector("canvas")?.getBoundingClientRect();
    const width = rect?.width ?? mask.displayWidth, height = rect?.height ?? mask.displayHeight;
    const x = event.clientX - (rect?.left ?? mask.left), y = event.clientY - (rect?.top ?? mask.top);
    if (width <= 0 || height <= 0 || x < 0 || y < 0 || x >= width || y >= height) return false;
    const column = Math.floor(x / width * mask.width);
    const row = Math.floor(y / height * mask.height);
    const pixel = row * mask.width + column;
    return Boolean(mask.bits[pixel >> 3] & (1 << (pixel & 7)));
  };
  const contextmenu = (event: MouseEvent) => {
    if (event.shiftKey || menu.element.contains(event.target as Node) || toolbar?.element.contains(event.target as Node) || !hit(event)) return;
    event.preventDefault(); event.stopPropagation(); menu.open(event.clientX, event.clientY);
  };
  const refreshPausedMask = () => {
    placement?.reflow(); syncToolbar();
    if (placement) menu.update(menuOptions());
    if (!hidden && controller.status === "paused") controller.refreshInteractionMask?.();
  };
  const hideToolbar = () => { clearHoverTimer(); toolbar?.show(false); };
  const hover = (event: PointerEvent) => {
    if (!toolbar || !placement || hidden || event.pointerType === "touch") return;
    const rect = placement.portrait, bar = placement.toolbar;
    const left = Math.min(rect.left,bar.x-76)-8, right = Math.max(rect.left+rect.width,bar.x+76)+8;
    const near = event.clientX>=left && event.clientX<=right && event.clientY>=rect.top-8 && event.clientY<=bar.y+50;
    if (near || dragging) { clearHoverTimer(); toolbar.show(true); }
    else if (hoverTimer === undefined) hoverTimer = globalThis.setTimeout(hideToolbar,180);
  };
  let start = {x:0,y:0};
  if (placement && helpers && typeof runtime.isModelDrag === "function") {
    drag = helpers.observeDrag({hit,enabled:() => !hidden && options.visitorDrag !== false && host.isConnected && (controller.status === "running" || controller.status === "paused"),
      start:() => { start=placement.anchor; placement.beginDrag(); dragging=true; clearHoverTimer(); toolbar.show(true); },
      move:(dx,dy) => { placement.moveTo(start.x+dx,start.y+dy); syncToolbar(); },
      end:(cancelled) => { dragging=false; if(!cancelled)save(); syncToolbar(); },hover},runtime.isModelDrag);
  } else if (toolbar) globalThis.addEventListener("pointermove",hover,true);
  const leave = (event: PointerEvent) => { if (!event.relatedTarget && !dragging) hideToolbar(); };
  document.addEventListener("contextmenu", contextmenu, true);
  globalThis.addEventListener("resize", refreshPausedMask);
  globalThis.addEventListener("blur", hideToolbar);
  globalThis.addEventListener("pointerout", leave, true);
  controller.observeInteractionMask?.((value: any) => { mask = value; });
  apply();
  syncToolbar();
  state.quickSettings = {
    menu, recovery, toolbar, placement,
    updateDialogueAvailability(available: boolean) {
      bubblesAllowed = baseBubblesAllowed || available;
      preferences.bubbles = bubblesAllowed && bubbleChoice;
      controller.setBubblesVisible?.(preferences.bubbles);
      menu.update(menuOptions());
      syncToolbar();
    },
    reattach() { if (!menu.element.isConnected) document.body.append(menu.element); if (!recovery.isConnected) document.body.append(recovery); toolbar?.reattach(); refreshPausedMask(); },
    destroy() { document.removeEventListener("contextmenu", contextmenu, true); globalThis.removeEventListener("resize", refreshPausedMask);
      globalThis.removeEventListener("blur",hideToolbar); globalThis.removeEventListener("pointerout",leave,true); globalThis.removeEventListener("pointermove",hover,true);
      clearHoverTimer(); drag?.destroy(); toolbar?.destroy(); controller.observeInteractionMask?.(); menu.destroy(); recovery.remove(); mask = undefined; },
  };
}
