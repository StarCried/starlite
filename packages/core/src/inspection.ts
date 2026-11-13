import { isModelDrag } from "./drag-gesture.js";
import type { StarLiteLocale } from "./locale.js";

export interface InspectionController {
  readonly inspecting: boolean;
  rotateInspection(dx: number, dy: number): void;
  resetCamera(): void;
}

/** Middle-button inspection owns only a gesture starting on the visible model. */
export function installModelInspection(host: HTMLElement, options: {
  controller: InspectionController;
  enabled(): boolean;
  hit(x: number, y: number): boolean;
  locale?: StarLiteLocale;
}): { hint: HTMLElement; cancel(): void; clearHint(): void; destroy(): void } {
  const doc = host.ownerDocument, win = doc.defaultView!;
  const hint = doc.createElement("div");
  hint.dataset.starliteInspectionHint = "";
  hint.setAttribute("role", "status");
  hint.textContent = options.locale === "en" ? "Inspecting · Middle-click to return" : "检视状态 · 点按中键返回";
  Object.assign(hint.style, { position: "absolute", left: "50%", bottom: "8px", transform: "translateX(-50%)",
    maxWidth: "calc(100% - 12px)", width: "max-content", padding: "6px 10px", borderRadius: "10px",
    background: "rgba(25,32,46,.78)", color: "#fff", font: "12px/1.5 system-ui,sans-serif",
    textAlign: "center", pointerEvents: "none", userSelect: "none", zIndex: "3" });
  hint.hidden = true; host.append(hint);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let gesture: { id: number; x: number; y: number; lastX: number; lastY: number; moved: boolean } | undefined;
  let restore: (() => void) | undefined;
  let suppressAux = false;
  const clearHint = () => { clearTimeout(timer); timer = undefined; hint.hidden = true; };
  const cancel = () => {
    const current = gesture; gesture = undefined;
    if (current) try { if (host.hasPointerCapture(current.id)) host.releasePointerCapture(current.id); } catch { /* capture may already have ended */ }
    restore?.(); restore = undefined;
  };
  const claim = () => {
    const entries = [doc.documentElement, ...doc.querySelectorAll("iframe")].map(element => {
      const property = element === doc.documentElement ? "user-select" : "pointer-events";
      return { style: element.style, property, value: element.style.getPropertyValue(property), priority: element.style.getPropertyPriority(property) };
    });
    restore = () => { for (const {style, property, value, priority} of entries) {
      if (value) style.setProperty(property, value, priority); else style.removeProperty(property);
    } };
    for (const {style, property} of entries) style.setProperty(property, "none", "important");
    try { host.setPointerCapture(gesture!.id); } catch { /* window listeners also finish the gesture */ }
  };
  const excluded = "button,input,textarea,select,a,[contenteditable]:not([contenteditable='false']),[data-starlite-quick-settings],[data-starlite-visitor-toolbar],[data-starlite-widget-restore],[data-bubble-kind]";
  const listeners: [string, EventListener][] = [
    ["pointerdown", event => {
      const p = event as PointerEvent;
      if (p.button !== 1 || p.pointerType !== "mouse" || p.buttons !== 4) { if (gesture) cancel(); return; }
      suppressAux = false;
      // Underlying links remain valid inspection targets in pass-through mode;
      // only the widget's own controls/bubbles are excluded.
      if (!options.enabled() || p.composedPath().some(target => target instanceof win.Element && host.contains(target) && target.matches(excluded))
        || p.composedPath().some(target => target instanceof win.Element && target.matches("[data-starlite-quick-settings],[data-starlite-visitor-toolbar],[data-starlite-widget-restore],[data-bubble-kind]"))
        || !options.hit(p.clientX, p.clientY)) return;
      p.preventDefault(); p.stopImmediatePropagation(); suppressAux = true;
      gesture = { id: p.pointerId, x: p.clientX, y: p.clientY, lastX: p.clientX, lastY: p.clientY, moved: false };
      claim();
    }],
    ["mousedown", event => { if ((event as MouseEvent).button === 1 && suppressAux) event.preventDefault(); }],
    ["pointermove", event => {
      const p = event as PointerEvent, current = gesture;
      if (!current || current.id !== p.pointerId) return;
      if (!options.enabled() || p.buttons !== 4) { cancel(); return; }
      p.preventDefault(); p.stopImmediatePropagation();
      if (!current.moved && !isModelDrag(p.clientX - current.x, p.clientY - current.y)) return;
      if (!current.moved && !options.controller.inspecting) {
        clearHint(); hint.hidden = false; timer = setTimeout(clearHint, 3000);
      }
      current.moved = true;
      options.controller.rotateInspection(p.clientX - current.lastX, p.clientY - current.lastY);
      current.lastX = p.clientX; current.lastY = p.clientY;
    }],
    ["pointerup", event => {
      const p = event as PointerEvent, current = gesture;
      if (!current || current.id !== p.pointerId || p.button !== 1) return;
      p.preventDefault(); p.stopImmediatePropagation();
      if (!current.moved && options.controller.inspecting) { clearHint(); options.controller.resetCamera(); }
      cancel();
    }],
    ["auxclick", event => { if ((event as MouseEvent).button === 1 && suppressAux) {
      event.preventDefault(); event.stopImmediatePropagation(); suppressAux = false;
    } }],
    ["pointercancel", event => { if (gesture?.id === (event as PointerEvent).pointerId) cancel(); }],
    ["lostpointercapture", event => { if (gesture?.id === (event as PointerEvent).pointerId) cancel(); }],
    ["blur", event => { if (event.target === event.currentTarget) cancel(); }],
    ["pagehide", () => { cancel(); clearHint(); }],
  ];
  for (const [name, listener] of listeners) win.addEventListener(name, listener, {capture: true, passive: false});
  return { hint, cancel, clearHint, destroy() {
    cancel(); clearHint(); hint.remove();
    for (const [name, listener] of listeners) win.removeEventListener(name, listener, true);
  } };
}
