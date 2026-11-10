export interface VisitorToolbarOptions {
  locale?: string;
  onSmaller(): void;
  onLarger(): void;
  onBubbles(): void;
  onHide(): void;
  /** Optional host-only exit action, shown while a session controls the character. */
  onReleaseControl?(): void;
}

export interface VisitorToolbarState {
  scale: number;
  minScale: number;
  maxScale: number;
  bubbles: boolean;
  bubblesAllowed: boolean;
  enabled?: boolean;
  controlActive?: boolean;
}

/** Compact shared host controls; placement and hover timing belong to the host. */
export function createVisitorToolbar(options: VisitorToolbarOptions) {
  const en = options.locale === "en";
  const text = (zh: string, english: string) => en ? english : zh;
  const standardDimensions = Object.freeze({ width: 152, height: 42 });
  const controlledDimensions = Object.freeze({ width: 188, height: 42 });
  let dimensions: Readonly<{width: number; height: number}> = standardDimensions;
  const element = document.createElement("div");
  element.dataset.starliteVisitorToolbar = "";
  // The renderer's native click exclusion also covers the detailed settings menu.
  element.dataset.starliteQuickSettings = "";
  element.dataset.visible = "false";
  element.setAttribute("role", "group");
  element.setAttribute("aria-label", text("角色快捷操作", "Character quick controls"));
  Object.assign(element.style, {
    position: "fixed", width: `${dimensions.width}px`, height: `${dimensions.height}px`,
    left: "0px", top: "0px", zIndex: "20",
  });
  const style = document.createElement("style");
  style.textContent = `
[data-starlite-visitor-toolbar]{box-sizing:border-box;display:flex;align-items:center;justify-content:center;gap:4px;padding:4px 5px;margin:0;border:0;border-radius:0;background:transparent;color:#f5f7ff;box-shadow:none;backdrop-filter:none;font:14px/1 system-ui,-apple-system,"Segoe UI",sans-serif;user-select:none;transform:translateX(-50%);opacity:0;pointer-events:none;transition:opacity .14s ease}
[data-starlite-visitor-toolbar][data-visible=true],[data-starlite-visitor-toolbar]:focus-within{opacity:1;pointer-events:auto}
[data-starlite-visitor-toolbar][hidden]{display:none!important}
[data-starlite-visitor-toolbar] button{all:unset;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;flex:0 0 32px;width:32px;height:32px;padding:0;border:1px solid transparent;border-radius:8px;color:inherit;background:transparent;cursor:pointer;transition:color .12s ease,transform .12s ease}
[data-starlite-visitor-toolbar] button[hidden]{display:none!important}
[data-starlite-visitor-toolbar] button[aria-pressed=true],[data-starlite-visitor-toolbar] button[data-toolbar-action=release-control]{color:#bdedff}
[data-starlite-visitor-toolbar] button:enabled:hover{color:#fff;transform:translateY(-1px) scale(1.1)}
[data-starlite-visitor-toolbar] button:enabled:active{color:#9fddff;transform:translateY(1px) scale(.92)}
[data-starlite-visitor-toolbar] button:focus-visible{outline:2px solid #f5f7ff;outline-offset:0;filter:drop-shadow(0 0 1px #10182a)}
[data-starlite-visitor-toolbar] button:disabled{opacity:.38;cursor:default}
[data-starlite-visitor-toolbar] svg{display:block;flex:none;width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;filter:drop-shadow(0 0 .7px #10182a) drop-shadow(0 1px 1px #10182ae6);pointer-events:none}
@media(prefers-reduced-motion:reduce){[data-starlite-visitor-toolbar],[data-starlite-visitor-toolbar] button{transition:none!important}}
`;
  element.append(style);
  let destroyed = false;
  const button = (action: string, label: string, path: string, callback: () => void) => {
    const control = document.createElement("button");
    control.type = "button";
    control.dataset.toolbarAction = action;
    control.setAttribute("aria-label", label);
    control.title = label;
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("aria-hidden", "true");
    icon.setAttribute("focusable", "false");
    const shape = document.createElementNS("http://www.w3.org/2000/svg", "path");
    shape.setAttribute("d", path);
    icon.append(shape);
    control.append(icon);
    // Mouse use should not pin :focus-within after leaving the character.
    // Native keyboard focus and activation still reveal and operate the controls.
    control.onpointerdown = event => {
      if (event.pointerType === "mouse" && event.button === 0 && event.isPrimary && !control.disabled) event.preventDefault();
    };
    control.onclick = event => {
      event.preventDefault(); event.stopPropagation();
      if (!destroyed && !element.hidden && !control.disabled) callback();
    };
    element.append(control);
    return control;
  };
  const smaller = button("smaller", text("缩小角色", "Make character smaller"), "M5 12h14", options.onSmaller);
  const larger = button("larger", text("放大角色", "Make character larger"), "M5 12h14M12 5v14", options.onLarger);
  const bubbles = button("bubbles", text("显示气泡", "Show bubbles"), "M20 15a3 3 0 0 1-3 3H9l-5 3V6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3Z", options.onBubbles);
  const slash = document.createElementNS("http://www.w3.org/2000/svg", "path");
  slash.setAttribute("d", "M3 3l18 18");
  slash.dataset.bubblesOff = "";
  bubbles.firstElementChild!.append(slash);
  const hide = button("hide", text("暂时隐藏角色", "Hide character"), "m6 6 12 12M6 18 18 6", options.onHide);
  const releaseControl = options.onReleaseControl ? button("release-control", text("会话接管中，点击退出", "Session controlled; click to exit"),
    "M12 3v3M10.5 3h3M7 6h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2ZM2 10v6M22 10v6M9 11v1M15 11v1M9 16h6", options.onReleaseControl) : undefined;
  const controls = [smaller, larger, bubbles, hide, ...(releaseControl ? [releaseControl] : [])];
  const update = (state: VisitorToolbarState) => {
    if (destroyed) return;
    element.hidden = state.enabled === false;
    const controlled = Boolean(releaseControl && state.controlActive === true);
    dimensions = controlled ? controlledDimensions : standardDimensions;
    element.style.width = `${dimensions.width}px`;
    if (releaseControl) {
      releaseControl.hidden = !controlled;
      releaseControl.disabled = !controlled;
      if (!controlled && !element.hidden && document.activeElement === releaseControl) hide.focus();
    }
    const validScale = [state.scale, state.minScale, state.maxScale].every(Number.isFinite)
      && state.scale > 0 && state.minScale > 0 && state.maxScale >= state.minScale;
    smaller.disabled = !validScale || state.scale <= state.minScale;
    larger.disabled = !validScale || state.scale >= state.maxScale;
    const allowed = state.bubblesAllowed === true, shown = allowed && state.bubbles === true;
    bubbles.disabled = !allowed;
    bubbles.setAttribute("aria-pressed", String(shown));
    bubbles.title = !allowed ? text("此页面没有对话气泡", "No dialogue bubbles on this page")
      : shown ? text("隐藏气泡", "Hide bubbles") : text("显示气泡", "Show bubbles");
    slash.style.display = shown ? "none" : "";
  };
  // Controls become available when the host provides its first authoritative state.
  update({ scale: NaN, minScale: NaN, maxScale: NaN, bubbles: false, bubblesAllowed: false });
  const notifyFocus = (focused: boolean) => {
    element.dispatchEvent(new globalThis.CustomEvent("starlite-toolbar-focus", { bubbles: true, detail: { focused } }));
  };
  const focusin = () => notifyFocus(true);
  const focusout = (event: FocusEvent) => notifyFocus(element.contains(event.relatedTarget as Node | null));
  element.addEventListener("focusin", focusin);
  element.addEventListener("focusout", focusout);
  document.body.append(element);
  return {
    element, get dimensions() { return dimensions; }, update,
    show(visible: boolean) { if (!destroyed) element.dataset.visible = String(visible === true); },
    /** x is the toolbar centre; y is its top edge, both in viewport CSS pixels. */
    place(x: number, y: number, zIndex: number) {
      if (destroyed || !Number.isFinite(x) || !Number.isFinite(y)) return;
      element.style.left = `${x}px`; element.style.top = `${y}px`;
      element.style.zIndex = String(Number.isFinite(zIndex) ? Math.max(-2147483648, Math.min(2147483647, Math.trunc(zIndex))) : 20);
    },
    reattach() { if (!destroyed && !element.isConnected) document.body.append(element); },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      element.removeEventListener("focusin", focusin);
      element.removeEventListener("focusout", focusout);
      for (const control of controls) { control.onclick = null; control.onpointerdown = null; }
      element.remove();
    },
  };
}
