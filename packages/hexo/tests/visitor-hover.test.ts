import { afterEach, expect, it, vi } from "vitest";
import { Window } from "happy-dom";
import { isModelDrag } from "../../core/src/drag-gesture";
import { installVisitorMenu } from "../src/visitor-menu";
import { createVisitorPlacement } from "../src/visitor-placement";
import { observeVisitorDrag } from "../src/visitor-drag";

const windows: Window[] = [], cleanups: (() => void)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  vi.useRealTimers();
  await Promise.all(windows.splice(0).map(win => win.happyDOM.close()));
});

function harness() {
  vi.useFakeTimers();
  const win = new Window({ width: 1360, height: 900, url: "https://blog.example/" }); windows.push(win);
  vi.spyOn(win, "setTimeout").mockImplementation(((callback: () => void, delay?: number) => setTimeout(callback, delay)) as any);
  vi.spyOn(win, "clearTimeout").mockImplementation(((timer: ReturnType<typeof setTimeout>) => clearTimeout(timer)) as any);
  const host = win.document.createElement("div"); win.document.body.append(host);
  const element = win.document.createElement("div");
  const toolbar = {
    element,
    show: vi.fn((visible: boolean) => { element.dataset.visible = String(visible); }),
    place: vi.fn(), update: vi.fn(), reattach: vi.fn(), destroy: vi.fn(() => element.remove()),
  };
  class Menu {
    element = win.document.createElement("div");
    constructor() { win.document.body.append(this.element); }
    update = vi.fn(); close = vi.fn(); open = vi.fn(); destroy = () => this.element.remove();
  }
  const controller = { status: "running", setDisplaySize: vi.fn(), setFrameRate: vi.fn(), setPerformanceVisible: vi.fn(),
    setPointerEnabled: vi.fn(), setBubblesVisible: vi.fn(), observeInteractionMask: vi.fn(), pause: vi.fn(), resume: vi.fn() };
  const state: any = { host, controller };
  const helpers = {
    createPlacement: new Function("globalThis", "document", `return (${createVisitorPlacement.toString()})`)(win, win.document),
    observeDrag: new Function("globalThis", "document", `return (${observeVisitorDrag.toString()})`)(win, win.document),
  };
  const runtime = { QuickSettingsMenu: Menu, isModelDrag, createVisitorToolbar: () => { win.document.body.append(element); return toolbar; } };
  new Function("globalThis", "document", "runtime", "state", "helpers", `(${installVisitorMenu.toString()})(runtime,state,{config:{backend:"vrm",display:{width:260,height:390}}},helpers)`)(win, win.document, runtime, state, helpers);
  cleanups.push(() => state.quickSettings.destroy());
  const move = (x: number, y: number) => win.document.body.dispatchEvent(new win.PointerEvent("pointermove", {
    bubbles: true, pointerType: "mouse", isPrimary: true, pointerId: 1, buttons: 0, clientX: x, clientY: y,
  }));
  const near = () => { const point = state.quickSettings.placement.toolbar; move(point.x, point.y); };
  return { win, toolbar, state, move, near };
}

it("hides 180ms after leaving even while the pointer keeps moving elsewhere", () => {
  const h = harness(); h.near(); expect(h.toolbar.element.dataset.visible).toBe("true");
  h.move(10, 10); vi.advanceTimersByTime(100); h.move(20, 20);
  vi.advanceTimersByTime(79); expect(h.toolbar.element.dataset.visible).toBe("true");
  vi.advanceTimersByTime(1); expect(h.toolbar.element.dataset.visible).toBe("false");
});

it("cancels a pending hide on re-entry and starts a fresh deadline on the next exit", () => {
  const h = harness(); h.near(); h.move(10, 10); vi.advanceTimersByTime(100); h.near();
  vi.advanceTimersByTime(200); expect(h.toolbar.element.dataset.visible).toBe("true");
  h.move(10, 10); vi.advanceTimersByTime(179); expect(h.toolbar.element.dataset.visible).toBe("true");
  vi.advanceTimersByTime(1); expect(h.toolbar.element.dataset.visible).toBe("false");
  h.near(); h.move(10, 10); vi.advanceTimersByTime(180); expect(h.toolbar.element.dataset.visible).toBe("false");
});

it("cancels pending hover work when the window loses focus or controls are destroyed", () => {
  const h = harness(); h.near(); h.move(10, 10); h.win.dispatchEvent(new h.win.Event("blur"));
  expect(h.toolbar.element.dataset.visible).toBe("false");
  h.near(); vi.advanceTimersByTime(180); expect(h.toolbar.element.dataset.visible).toBe("true");
  h.move(10, 10); h.state.quickSettings.destroy(); h.toolbar.show.mockClear();
  vi.advanceTimersByTime(180); expect(h.toolbar.show).not.toHaveBeenCalled();
});
