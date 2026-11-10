import { afterEach, expect, it, vi } from "vitest";
import { Window, type HTMLButtonElement } from "happy-dom";
import { createVisitorToolbar, type VisitorToolbarState } from "../src/visitor-toolbar.js";

const windows: Window[] = [];
afterEach(async () => { await Promise.all(windows.splice(0).map(win => win.happyDOM.close())); });
const initial: VisitorToolbarState = { scale: 1, minScale: .5, maxScale: 1.5, bubbles: true, bubblesAllowed: true };

function harness(locale?: string, withControl = false) {
  const win = new Window({ url: "https://blog.example/" }); windows.push(win);
  const actions = { onSmaller: vi.fn(), onLarger: vi.fn(), onBubbles: vi.fn(), onHide: vi.fn(), ...(withControl ? {onReleaseControl: vi.fn()} : {}) };
  const toolbar = new Function("globalThis", "document", "options", `return (${createVisitorToolbar.toString()})(options)`)(win, win.document, { ...actions, locale }) as ReturnType<typeof createVisitorToolbar>;
  toolbar.update(initial);
  const button = (action: string) => toolbar.element.querySelector(`[data-toolbar-action=${action}]`) as unknown as HTMLButtonElement;
  return { win, toolbar, actions, button };
}

it("serializes standalone controls with a consistent SVG icon set and accessible names", () => {
  const h = harness("en");
  expect(h.toolbar.element.isConnected).toBe(true);
  expect(h.toolbar.element.hasAttribute("data-starlite-visitor-toolbar")).toBe(true);
  expect(h.toolbar.element.hasAttribute("data-starlite-quick-settings")).toBe(true);
  expect(h.toolbar.element.dataset.visible).toBe("false");
  expect([...h.toolbar.element.querySelectorAll("button")].map(control => control.getAttribute("aria-label"))).toEqual([
    "Make character smaller", "Make character larger", "Show bubbles", "Hide character",
  ]);
  for (const control of h.toolbar.element.querySelectorAll("button")) {
    expect(control.type).toBe("button"); expect(control.textContent).toBe("");
    expect(control.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(control.querySelector("svg")?.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(control.title).not.toBe("");
  }
  const zh = harness();
  expect(zh.button("smaller").getAttribute("aria-label")).toBe("缩小角色");
  expect(zh.button("hide").title).toBe("暂时隐藏角色");
});

it("invokes only its own controls and preserves native keyboard and page events", () => {
  const h = harness(); const pageClick = vi.fn();
  h.win.document.body.addEventListener("click", pageClick);
  for (const action of ["smaller", "larger", "bubbles", "hide"]) {
    const event = new h.win.MouseEvent("click", { bubbles: true, cancelable: true });
    h.button(action).querySelector("path")!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  }
  for (const callback of Object.values(h.actions)) expect(callback).toHaveBeenCalledOnce();
  expect(pageClick).not.toHaveBeenCalled();
  const key = new h.win.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
  h.button("smaller").dispatchEvent(key); expect(key.defaultPrevented).toBe(false);
  const pointer = new h.win.PointerEvent("pointerdown", { pointerType: "mouse", button: 0, isPrimary: true, bubbles: true, cancelable: true });
  h.button("smaller").dispatchEvent(pointer); expect(pointer.defaultPrevented).toBe(true);
  const touch = new h.win.PointerEvent("pointerdown", { pointerType: "touch", button: 0, isPrimary: true, bubbles: true, cancelable: true });
  h.button("smaller").dispatchEvent(touch); expect(touch.defaultPrevented).toBe(false);
  const pagePointer = new h.win.PointerEvent("pointerdown", { pointerType: "mouse", button: 0, isPrimary: true, bubbles: true, cancelable: true });
  h.win.document.body.dispatchEvent(pagePointer); expect(pagePointer.defaultPrevented).toBe(false);
  const rightClick = new h.win.MouseEvent("contextmenu", { bubbles: true, cancelable: true });
  h.button("smaller").dispatchEvent(rightClick); expect(rightClick.defaultPrevented).toBe(false);
  h.win.document.body.click(); expect(pageClick).toHaveBeenCalledOnce();
});

it("tracks size limits and bubble availability without changing host state", () => {
  const h = harness("en");
  h.toolbar.update({ ...initial, scale: .5 });
  expect(h.button("smaller").disabled).toBe(true); expect(h.button("larger").disabled).toBe(false);
  h.button("smaller").click(); expect(h.actions.onSmaller).not.toHaveBeenCalled();
  h.toolbar.update({ ...initial, scale: 1.5, bubbles: false });
  expect(h.button("smaller").disabled).toBe(false); expect(h.button("larger").disabled).toBe(true);
  expect(h.button("bubbles").getAttribute("aria-pressed")).toBe("false");
  expect(h.button("bubbles").title).toBe("Show bubbles");
  expect(h.button("bubbles").querySelector("[data-bubbles-off]")!.getAttribute("style") ?? "").not.toContain("display: none");
  h.toolbar.update({ ...initial, bubblesAllowed: false });
  expect(h.button("bubbles").disabled).toBe(true); expect(h.button("bubbles").getAttribute("aria-pressed")).toBe("false");
  h.button("bubbles").click(); expect(h.actions.onBubbles).not.toHaveBeenCalled();
  h.toolbar.update(initial);
  expect(h.button("bubbles").disabled).toBe(false); expect(h.button("bubbles").getAttribute("aria-pressed")).toBe("true");
  expect(h.button("bubbles").title).toBe("Hide bubbles");
});

it.each([
  { scale: NaN }, { scale: Infinity }, { scale: 0 }, { minScale: -Infinity }, { maxScale: Infinity }, { minScale: 0 }, { minScale: 2 },
])("disables scale controls for malformed host state %j", patch => {
  const h = harness(); h.toolbar.update({ ...initial, ...patch });
  expect(h.button("smaller").disabled).toBe(true); expect(h.button("larger").disabled).toBe(true);
  h.button("smaller").click(); h.button("larger").click();
  expect(h.actions.onSmaller).not.toHaveBeenCalled(); expect(h.actions.onLarger).not.toHaveBeenCalled();
});

it("retains keyboard access while hover-hidden and reports focus transitions", () => {
  const h = harness(); const focus = vi.fn();
  h.toolbar.element.addEventListener("starlite-toolbar-focus", event => focus((event as CustomEvent).detail.focused));
  h.toolbar.show(false);
  expect(h.toolbar.element.hidden).toBe(false); expect(h.button("smaller").tabIndex).toBe(0);
  h.button("smaller").focus();
  expect(h.win.document.activeElement).toBe(h.button("smaller")); expect(focus).toHaveBeenLastCalledWith(true);
  h.button("smaller").blur(); expect(focus).toHaveBeenLastCalledWith(false);
  h.toolbar.show(true); expect(h.toolbar.element.dataset.visible).toBe("true");
  h.toolbar.update({ ...initial, enabled: false }); expect(h.toolbar.element.hidden).toBe(true);
  h.button("hide").click(); expect(h.actions.onHide).not.toHaveBeenCalled();
  h.toolbar.update(initial); expect(h.toolbar.element.hidden).toBe(false);
});

it("positions stable unscaled controls and rejects non-finite geometry", () => {
  const h = harness();
  expect(h.toolbar.dimensions).toEqual({ width: 152, height: 42 });
  expect(h.toolbar.element.style.width).toBe("152px"); expect(h.toolbar.element.style.height).toBe("42px");
  h.toolbar.place(250.5, 440, 21); h.toolbar.update({ ...initial, scale: 1.5 });
  expect(h.toolbar.element.style.left).toBe("250.5px"); expect(h.toolbar.element.style.top).toBe("440px");
  expect(h.toolbar.element.style.width).toBe("152px"); expect(h.toolbar.element.style.zIndex).toBe("21");
  h.toolbar.place(NaN, Infinity, Infinity);
  expect(h.toolbar.element.style.left).toBe("250.5px"); expect(h.toolbar.element.style.top).toBe("440px");
  h.toolbar.place(100, 200, NaN); expect(h.toolbar.element.style.zIndex).toBe("20");
});

it("keeps the toolbar and buttons transparent while outlining the icons", () => {
  const h = harness(); h.toolbar.show(true);
  const container = h.win.getComputedStyle(h.toolbar.element as never);
  expect(container.backgroundColor).toBe("transparent");
  expect(container.borderTopWidth).toBe("0px");
  expect(container.boxShadow).toBe("none");
  for (const control of h.toolbar.element.querySelectorAll("button")) {
    expect(h.win.getComputedStyle(control as never).backgroundColor).toBe("transparent");
    expect(h.win.getComputedStyle(control.querySelector("svg") as never).filter).toContain("drop-shadow");
  }
});

it("adds only the active host control action without moving the centre or top anchor", () => {
  const h = harness("en", true), release = h.button("release-control");
  h.toolbar.place(250.5, 440, 21);
  expect(release.hidden).toBe(true); expect(release.disabled).toBe(true);
  release.click(); expect(h.actions.onReleaseControl).not.toHaveBeenCalled();
  expect(h.toolbar.dimensions).toEqual({width: 152, height: 42});
  h.toolbar.update({...initial, controlActive: true});
  expect(h.toolbar.dimensions).toEqual({width: 188, height: 42});
  expect(h.toolbar.element.style.width).toBe("188px");
  expect(h.toolbar.element.style.left).toBe("250.5px"); expect(h.toolbar.element.style.top).toBe("440px");
  expect(release.hidden).toBe(false); expect(release.disabled).toBe(false);
  expect(release.getAttribute("aria-label")).toBe("Session controlled; click to exit");
  expect(release.querySelector("svg")?.getAttribute("viewBox")).toBe("0 0 24 24");
  release.click(); expect(h.actions.onReleaseControl).toHaveBeenCalledOnce();
  release.focus(); h.toolbar.update({...initial, scale: 1.5, controlActive: false});
  expect(h.win.document.activeElement).toBe(h.button("hide"));
  expect(h.toolbar.dimensions).toEqual({width: 152, height: 42});
  expect(h.toolbar.element.style.left).toBe("250.5px"); expect(h.toolbar.element.style.top).toBe("440px");
  release.click(); expect(h.actions.onReleaseControl).toHaveBeenCalledOnce();
  h.toolbar.destroy(); release.click(); expect(h.actions.onReleaseControl).toHaveBeenCalledOnce();
});

it("does not add session controls to ordinary blog toolbars", () => {
  const h = harness(); h.toolbar.update({...initial, controlActive: true});
  expect(h.toolbar.element.querySelector("[data-toolbar-action=release-control]")).toBeNull();
  expect(h.toolbar.dimensions).toEqual({width: 152, height: 42});
});

it("reattaches once after PJAX and releases controls permanently on destruction", () => {
  const h = harness();
  h.toolbar.element.remove(); h.toolbar.reattach(); h.toolbar.reattach();
  expect(h.win.document.querySelectorAll("[data-starlite-visitor-toolbar]")).toHaveLength(1);
  expect(h.toolbar.element.querySelector("style")?.isConnected).toBe(true);
  h.toolbar.destroy(); h.toolbar.destroy(); h.toolbar.reattach();
  expect(h.toolbar.element.isConnected).toBe(false);
  h.button("smaller").click(); expect(h.actions.onSmaller).not.toHaveBeenCalled();
  h.toolbar.show(true); expect(h.toolbar.element.dataset.visible).toBe("false");
});
