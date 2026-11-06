import { expect, it, vi } from "vitest";
import { Window, type HTMLElement } from "happy-dom";
import { installVisitorMenu } from "../src/visitor-menu";
import { createVisitorToolbar } from "../../core/src/visitor-toolbar";
import { isModelDrag } from "../../core/src/drag-gesture";
import { createVisitorPlacement } from "../src/visitor-placement";
import { observeVisitorDrag } from "../src/visitor-drag";

function harness(config: any = {}, storage?: string, controls=false) {
  const win = new Window({ url: "https://blog.example/",width:1360,height:900 });
  if (storage) win.localStorage.setItem("starlite:visitor-settings:v1", storage);
  const host = win.document.createElement("div"); win.document.body.append(host);
  let maskListener: ((value: any) => void) | undefined;
  const controller = {
    status: "running",
    setDisplaySize: vi.fn((w:number,h:number) => {host.style.width=`${w}px`;host.style.height=`${h}px`;}), setFrameRate: vi.fn(), setPointerEnabled: vi.fn(),
    setBubblesVisible: vi.fn(), setPerformanceVisible: vi.fn(), pause: vi.fn(), resume: vi.fn(),
    refreshInteractionMask: vi.fn(),
    observeInteractionMask: vi.fn((listener?: (value: any) => void) => { maskListener = listener; }),
  };
  class Menu {
    element = win.document.createElement("div");
    open = vi.fn(); close = vi.fn(); destroy = vi.fn(() => this.element.remove());
    constructor(public options: any) { win.document.body.append(this.element); }
    update(options: any) { this.options = options; }
  }
  const state: any = { host, controller };
  const options = { config: { backend: "vrm", model: "/m.vrm", display: { width: 260, height: 390 }, render: { fps: 60 }, dialogue: { click: { animation: "Wave", lines: ["Hello"] } }, ...config }, position: { right: 112, bottom: 160, zIndex: 20 } };
  const toolbarFactory = (options:any) => new Function("globalThis","document","options",`return (${createVisitorToolbar.toString()})(options)`)(win,win.document,options);
  const createPlacement = (options:any) => new Function("globalThis","options",`return (${createVisitorPlacement.toString()})(options)`)(win,options);
  const observeDrag = (options:any,threshold:any) => new Function("globalThis","document","options","threshold",`return (${observeVisitorDrag.toString()})(options,threshold)`)(win,win.document,options,threshold);
  new Function("globalThis", "document", "runtime", "state", "options","helpers", `(${installVisitorMenu.toString()})(runtime,state,options,helpers)`)(win, win.document,
    { QuickSettingsMenu: Menu,...(controls ? {createVisitorToolbar:toolbarFactory,isModelDrag} : {}) }, state, options, controls ? {createPlacement,observeDrag} : undefined);
  const menu = state.quickSettings.menu as Menu;
  const item = (id: string) => menu.options.tabs.flatMap((tab: any) => tab.items).find((entry: any) => entry.id === id);
  const context = (x: number, y: number, shiftKey = false, target: HTMLElement = win.document.body) => {
    const event = new win.MouseEvent("contextmenu", { clientX: x, clientY: y, shiftKey, bubbles: true, cancelable: true });
    target.dispatchEvent(event); return event;
  };
  return { win, host, controller, state, menu, item, context, emitMask: (mask: any) => maskListener?.(mask) };
}

it("opens only over alpha-covered model pixels, preserving transparent and Shift right clicks", async () => {
  const h = harness();
  h.emitMask({ left: 100, top: 100, displayWidth: 100, displayHeight: 100, width: 2, height: 2, bits: new Uint8Array([1]) });
  expect(h.context(110, 110).defaultPrevented).toBe(true); expect(h.menu.open).toHaveBeenCalledWith(110, 110);
  expect(h.context(180, 180).defaultPrevented).toBe(false);
  expect(h.context(110, 110, true).defaultPrevented).toBe(false);
  expect(h.context(110, 110, false, h.menu.element).defaultPrevented).toBe(false);
  expect(h.menu.open).toHaveBeenCalledOnce(); await h.win.happyDOM.close();
});

it("shares hover-toolbar controls with the detailed menu without moving its anchor or restarting animations",async()=>{
  const h=harness({},undefined,true),toolbar=h.state.quickSettings.toolbar;
  const button=(name:string)=>toolbar.element.querySelector(`[data-toolbar-action=${name}]`);
  const point=toolbar.element.style.cssText;
  button("smaller").click();expect(h.item("size").value).toBe(90);
  button("larger").click();expect(h.item("size").value).toBe(100);
  expect(toolbar.element.style.cssText).toBe(point);
  button("bubbles").click();expect(h.item("bubbles").value).toBe(false);
  expect(h.controller.setBubblesVisible).toHaveBeenLastCalledWith(false);expect(h.controller.pause).not.toHaveBeenCalled();
  h.item("bubbles").onChange(true);expect(button("bubbles").getAttribute("aria-pressed")).toBe("true");
  button("hide").click();expect(toolbar.element.hidden).toBe(true);expect(h.state.quickSettings.recovery.hidden).toBe(false);
  h.state.quickSettings.recovery.click();expect(toolbar.element.hidden).toBe(false);expect(h.controller.resume).toHaveBeenCalledOnce();
  h.state.quickSettings.destroy();await h.win.happyDOM.close();
});

it("reveals controls around the portrait, retains them through the gap, and hides them after leaving",async()=>{
  const h=harness({},undefined,true),controls=h.state.quickSettings,point=controls.placement.toolbar;
  const move=(x:number,y:number)=>h.win.dispatchEvent(new h.win.PointerEvent("pointermove",{clientX:x,clientY:y,pointerType:"mouse",isPrimary:true}));
  move(point.x,point.y-20);expect(controls.toolbar.element.dataset.visible).toBe("true");
  move(point.x,point.y-4);expect(controls.toolbar.element.dataset.visible).toBe("true");
  move(0,0);await new Promise(resolve=>setTimeout(resolve,220));
  expect(controls.toolbar.element.dataset.visible).toBe("false");
  controls.toolbar.element.remove();controls.reattach();expect(controls.toolbar.element.isConnected).toBe(true);
  controls.destroy();move(point.x,point.y);expect(controls.toolbar.element.isConnected).toBe(false);
  await h.win.happyDOM.close();
});

it("loads bounded visitor placement and keeps both controls and model inside a resized viewport",async()=>{
  const h=harness({},JSON.stringify({position:{x:.9,y:.9},scale:1}),true),controls=h.state.quickSettings;
  h.win.happyDOM.setWindowSize({width:911,height:512});h.win.dispatchEvent(new h.win.Event("resize"));
  const r=controls.placement.portrait,p=controls.placement.toolbar;
  expect(r.left).toBeGreaterThanOrEqual(12);expect(r.top).toBeGreaterThanOrEqual(12);expect(p.y+42).toBeLessThanOrEqual(500);
  h.item("reset-position").onAction();expect(JSON.parse(h.win.localStorage.getItem("starlite:visitor-settings:v1")!).position).toBeUndefined();
  controls.destroy();await h.win.happyDOM.close();
});

it("maps paused pixels to the current canvas position before a resize event arrives", async () => {
  const h = harness(); const canvas = h.win.document.createElement("canvas"); h.host.append(canvas);
  canvas.getBoundingClientRect = () => ({ left: 300, top: 200, width: 200, height: 200 }) as any;
  h.emitMask({ left: 100, top: 100, displayWidth: 100, displayHeight: 100, width: 2, height: 2, bits: new Uint8Array([1]) });
  expect(h.context(310, 210).defaultPrevented).toBe(true);
  expect(h.context(110, 110).defaultPrevented).toBe(false); await h.win.happyDOM.close();
});

it("applies visitor controls in place and hides bubbles independently of animation scheduling", async () => {
  const h = harness();
  h.controller.setDisplaySize.mockClear(); h.controller.setFrameRate.mockClear();
  h.item("bubbles").onChange(false);
  expect(h.controller.setBubblesVisible).toHaveBeenLastCalledWith(false);
  expect(h.controller.pause).not.toHaveBeenCalled(); expect(h.controller.setDisplaySize).not.toHaveBeenCalled();
  h.item("size").onChange(125); expect(h.controller.setDisplaySize).toHaveBeenLastCalledWith(325, 487.5);
  h.item("fps").onChange("30"); expect(h.controller.setFrameRate).toHaveBeenLastCalledWith(30);
  h.item("pointer").onChange(false); expect(h.controller.setPointerEnabled).toHaveBeenLastCalledWith(false);
  expect(JSON.parse(h.win.localStorage.getItem("starlite:visitor-settings:v1")!)).toMatchObject({ scale: 1.25, fps: 30, bubbles: false, pointer: false });
  const ids = h.menu.options.tabs.flatMap((tab: any) => tab.items.map((entry: any) => entry.id));
  expect(ids).not.toContain("click"); expect(ids).not.toContain("ambient"); expect(ids).not.toContain("billing");
  await h.win.happyDOM.close();
});

it("validates stored preferences and respects author-disabled capabilities", async () => {
  const h = harness({ interactions: { pointer: false }, dialogue: { enter: false, click: false, idle: false } }, JSON.stringify({ scale: 4, fps: 10000, pointer: true, bubbles: true, performance: true }));
  expect(h.controller.setDisplaySize).toHaveBeenCalledWith(260, 390); expect(h.controller.setFrameRate).toHaveBeenCalledWith(60);
  expect(h.controller.setPointerEnabled).toHaveBeenCalledWith(false); expect(h.controller.setBubblesVisible).toHaveBeenCalledWith(false);
  expect(h.item("pointer").disabled).toBe(true); expect(h.item("bubbles").disabled).toBe(true);
  expect(h.item("performance").value).toBe(true); await h.win.happyDOM.close();
});

it("does not persist a preference rejected by the renderer", async () => {
  const h = harness();
  h.controller.setDisplaySize.mockImplementationOnce(() => { throw new Error("display too large"); });
  expect(() => h.item("size").onChange(150)).toThrow("display too large");
  h.item("bubbles").onChange(false);
  expect(JSON.parse(h.win.localStorage.getItem("starlite:visitor-settings:v1")!).scale).toBe(1);
  expect(h.item("size").value).toBe(100); await h.win.happyDOM.close();
});

it("restores authored placement and offers an explicit recovery after hiding", async () => {
  const h = harness({ interactions: { passThrough: true } });
  Object.assign(h.host.style, { left: "50px", top: "60px", right: "auto", bottom: "auto" });
  h.item("reset-position").onAction();
  expect(h.host.style.left).toBe(""); expect(h.host.style.top).toBe(""); expect(h.host.style.right).toBe("112px"); expect(h.host.style.bottom).toBe("160px");
  expect(h.controller.refreshInteractionMask).toHaveBeenCalledOnce();
  h.item("hide").onAction(); expect(h.host.style.visibility).toBe("hidden"); expect(h.controller.pause).toHaveBeenCalledOnce();
  expect(h.state.quickSettings.recovery.hidden).toBe(false);
  h.state.quickSettings.recovery.click(); expect(h.host.style.visibility).toBe(""); expect(h.host.style.pointerEvents).toBe("none"); expect(h.controller.resume).toHaveBeenCalledOnce();
  h.item("pause").onChange(true); h.item("hide").onAction(); h.state.quickSettings.recovery.click();
  expect(h.controller.resume).toHaveBeenCalledOnce();
  expect(h.win.localStorage.getItem("starlite:visitor-settings:v1")).toBeNull(); await h.win.happyDOM.close();
});

it("reattaches one menu after PJAX and cleans up on controller replacement", async () => {
  const h = harness();
  h.menu.element.remove(); h.state.quickSettings.recovery.remove(); h.state.quickSettings.reattach();
  expect(h.menu.element.isConnected).toBe(true); expect(h.state.quickSettings.recovery.isConnected).toBe(true);
  h.state.quickSettings.destroy(); expect(h.menu.destroy).toHaveBeenCalledOnce(); expect(h.controller.observeInteractionMask).toHaveBeenLastCalledWith();
  expect(h.menu.element.isConnected).toBe(false); expect(h.state.quickSettings.recovery.isConnected).toBe(false);
  await h.win.happyDOM.close();
});

it("refreshes the paused opaque target when the viewport moves a fixed host", async () => {
  const h = harness(); h.controller.status = "paused";
  h.win.dispatchEvent(new h.win.Event("resize")); expect(h.controller.refreshInteractionMask).toHaveBeenCalledOnce();
  h.state.quickSettings.reattach(); expect(h.controller.refreshInteractionMask).toHaveBeenCalledTimes(2);
  h.state.quickSettings.destroy(); h.win.dispatchEvent(new h.win.Event("resize"));
  expect(h.controller.refreshInteractionMask).toHaveBeenCalledTimes(2); await h.win.happyDOM.close();
});

it("enables page-only dialogue while retaining a visitor's explicit bubble choice across pages", async () => {
  const h=harness({dialogue:{enter:false,click:false,idle:false}});
  expect(h.item("bubbles").disabled).toBe(true);
  h.state.quickSettings.updateDialogueAvailability(true);
  expect(h.item("bubbles").disabled).toBe(false);expect(h.item("bubbles").value).toBe(true);
  expect(h.controller.setBubblesVisible).toHaveBeenLastCalledWith(true);
  h.item("bubbles").onChange(false);
  h.state.quickSettings.updateDialogueAvailability(false);h.state.quickSettings.updateDialogueAvailability(true);
  expect(h.item("bubbles").value).toBe(false);expect(h.controller.setBubblesVisible).toHaveBeenLastCalledWith(false);
  expect(JSON.parse(h.win.localStorage.getItem("starlite:visitor-settings:v1")!).bubbles).toBe(false);
  await h.win.happyDOM.close();
});
it("does not turn unavailable page dialogue into a saved opt-out when changing another preference",async()=>{
  const h=harness({dialogue:{enter:false,click:false,idle:false}});
  h.item("fps").onChange("30");
  expect(JSON.parse(h.win.localStorage.getItem("starlite:visitor-settings:v1")!).bubbles).toBe(true);
  h.state.quickSettings.updateDialogueAvailability(true);expect(h.item("bubbles").value).toBe(true);
  h.item("pause").onChange(true);h.item("hide").onAction();
  h.state.quickSettings.updateDialogueAvailability(false);h.state.quickSettings.updateDialogueAvailability(true);
  expect(h.item("pause").value).toBe(true);expect(h.host.style.visibility).toBe("hidden");expect(h.state.quickSettings.recovery.hidden).toBe(false);
  await h.win.happyDOM.close();
});

it("uses English controls and restore text without changing visitor interactions", async () => {
  const h = harness({locale: "en"});
  expect(h.menu.options.locale).toBe("en");
  expect(h.item("size").label).toBe("Model size");
  expect(h.item("bubbles").label).toBe("Show bubbles");
  expect(h.state.quickSettings.recovery.textContent).toBe("Show character");
  h.item("bubbles").onChange(false); expect(h.controller.pause).not.toHaveBeenCalled();
  h.item("hide").onAction(); h.state.quickSettings.recovery.click();
  expect(h.controller.resume).toHaveBeenCalled(); await h.win.happyDOM.close();
});
