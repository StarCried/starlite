import { expect, it, vi } from "vitest";
import { Window, type HTMLElement } from "happy-dom";
import { installVisitorMenu } from "../src/visitor-menu";

function harness(config: any = {}, storage?: string) {
  const win = new Window({ url: "https://blog.example/" });
  if (storage) win.localStorage.setItem("starlite:visitor-settings:v1", storage);
  const host = win.document.createElement("div"); win.document.body.append(host);
  let maskListener: ((value: any) => void) | undefined;
  const controller = {
    status: "running",
    setDisplaySize: vi.fn(), setFrameRate: vi.fn(), setPointerEnabled: vi.fn(),
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
  new Function("globalThis", "document", "runtime", "state", "options", `(${installVisitorMenu.toString()})(runtime,state,options)`)(win, win.document, { QuickSettingsMenu: Menu }, state, options);
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
