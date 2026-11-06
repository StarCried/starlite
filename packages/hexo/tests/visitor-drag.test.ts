import { afterEach, expect, it, vi } from "vitest";
import { Window, type HTMLElement } from "happy-dom";
import { observePassThroughClicks } from "../../core/src/pass-through";
import { isModelDrag } from "../../core/src/drag-gesture";
import { observeVisitorDrag } from "../src/visitor-drag";

const windows: Window[] = [];
afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(windows.splice(0).map(win => win.happyDOM.close()));
  vi.unstubAllGlobals();
});

function harness() {
  const win = new Window({ url: "https://blog.example/" }); windows.push(win);
  const page = win.document.createElement("div"); win.document.body.append(page);
  const surface = win.document.createElement("canvas"); win.document.body.append(surface);
  surface.getBoundingClientRect = () => ({ left: 0, top: 0, right: 300, bottom: 300, width: 300, height: 300 }) as any;
  const modelClick = vi.fn();
  // The runtime's passive observer is mounted first, as in the real bootstrap.
  vi.stubGlobal("window", win); vi.stubGlobal("Element", win.Element);
  observePassThroughClicks(surface as unknown as globalThis.HTMLElement, modelClick);
  const options = { hit: vi.fn(() => true), enabled: vi.fn(() => true), start: vi.fn(), move: vi.fn(), end: vi.fn(), hover: vi.fn() };
  const drag = new Function("globalThis", "document", "options", "isDrag", `return (${observeVisitorDrag.toString()})(options,isDrag)`)(win, win.document, options, isModelDrag) as ReturnType<typeof observeVisitorDrag>;
  const pageClick = vi.fn(); page.addEventListener("click", pageClick);
  const pointer = (type: string, x = 100, y = 100, target: HTMLElement = page, init: any = {}) => {
    const event = new win.PointerEvent(type, { bubbles: true, cancelable: true, pointerType: "mouse", isPrimary: true,
      pointerId: 7, button: 0, buttons: type === "pointerup" ? 0 : 1, clientX: x, clientY: y, ...init });
    target.dispatchEvent(event); return event;
  };
  const click = (x = 100, y = 100, target: HTMLElement = page, init: any = {}, trusted = true) => {
    const event = new win.PointerEvent("click", { bubbles: true, cancelable: true, detail: 1, button: 0,
      pointerType: "mouse", pointerId: 7, clientX: x, clientY: y, ...init });
    // happy-dom has no browser input driver. Only this explicit helper emulates
    // a trusted native click; programmatic events below retain their own origin.
    if (trusted) Object.defineProperty(event, "isTrusted", { value: true });
    target.dispatchEvent(event); return event;
  };
  const complete = () => { pointer("pointerdown"); pointer("pointermove", 110, 115); pointer("pointerup", 110, 115); };
  return { win, page, options, drag, pointer, click, complete, modelClick, pageClick };
}

it("serializes independently and preserves the original short click for the model and page", () => {
  const h = harness(), down = vi.fn(), up = vi.fn();
  h.page.addEventListener("pointerdown", down); h.page.addEventListener("pointerup", up);
  expect(h.pointer("pointerdown").defaultPrevented).toBe(false);
  expect(h.pointer("pointermove", 103, 104).defaultPrevented).toBe(false);
  expect(h.pointer("pointerup", 103, 104).defaultPrevented).toBe(false);
  const click = h.click(103, 104);
  expect(click.defaultPrevented).toBe(false); expect(h.pageClick).toHaveBeenCalledExactlyOnceWith(click);
  expect(down).toHaveBeenCalledOnce(); expect(up).toHaveBeenCalledOnce();
  expect(h.modelClick).toHaveBeenCalledOnce(); expect(h.options.start).not.toHaveBeenCalled(); expect(h.options.end).not.toHaveBeenCalled();
  h.pointer("pointerdown"); h.pointer("pointermove", 106, 100); h.pointer("pointerup", 106, 100);
  expect(h.click(106, 100).defaultPrevented).toBe(false); expect(h.options.start).not.toHaveBeenCalled();
  expect(h.modelClick).toHaveBeenCalledTimes(2);
});

it("starts beyond six CSS pixels and consumes only the completed drag click before the page", () => {
  const h = harness(), lateWindowClick = vi.fn(); h.win.addEventListener("click", lateWindowClick, true);
  h.pointer("pointerdown");
  expect(h.pointer("pointermove", 104, 105).defaultPrevented).toBe(true);
  expect(h.options.start).toHaveBeenCalledOnce(); expect(h.options.move).toHaveBeenLastCalledWith(4, 5);
  h.pointer("pointermove", 120, 110); h.pointer("pointerup", 120, 110);
  expect(h.options.move).toHaveBeenLastCalledWith(20, 10); expect(h.options.end).toHaveBeenCalledExactlyOnceWith(false);
  expect(h.click(120, 110).defaultPrevented).toBe(true);
  expect(lateWindowClick).not.toHaveBeenCalled(); expect(h.pageClick).not.toHaveBeenCalled(); expect(h.modelClick).not.toHaveBeenCalled();
  expect(h.click(120, 110).defaultPrevented).toBe(false);
});

it("classifies a final displacement even when the release arrives without an intermediate move", () => {
  const h = harness(); h.pointer("pointerdown"); h.pointer("pointerup", 125, 100);
  expect(h.options.start).toHaveBeenCalledOnce(); expect(h.options.move).toHaveBeenLastCalledWith(25, 0);
  expect(h.click(125, 100).defaultPrevented).toBe(true); expect(h.modelClick).not.toHaveBeenCalled();
});

it("captures only confirmed drags and releases ownership after completion",()=>{
  const h=harness(), owner=h.win.document.documentElement, captured=new Set<number>();
  const set=vi.fn((id:number)=>{captured.add(id);}), release=vi.fn((id:number)=>{
    captured.delete(id);owner.dispatchEvent(new h.win.PointerEvent("lostpointercapture",{bubbles:true,pointerId:id}));
  });
  Object.assign(owner,{setPointerCapture:set,hasPointerCapture:(id:number)=>captured.has(id),releasePointerCapture:release});
  h.pointer("pointerdown");h.pointer("pointermove",106,100);h.pointer("pointerup",106,100);
  expect(set).not.toHaveBeenCalled();expect(h.click(106,100).defaultPrevented).toBe(false);
  h.pointer("pointerdown");h.pointer("pointermove",110,100);expect(set).toHaveBeenCalledExactlyOnceWith(7);
  h.pointer("pointermove",180,150,owner);h.pointer("pointerup",180,150,owner);
  expect(h.options.move).toHaveBeenLastCalledWith(80,50);expect(h.options.end).toHaveBeenCalledExactlyOnceWith(false);
  expect(release).toHaveBeenCalledExactlyOnceWith(7);expect(h.click(180,150,owner).defaultPrevented).toBe(true);
});

it.each(["lostpointercapture","cancel","destroy"])("releases a captured pointer and temporary styles on %s",reason=>{
  const h=harness(),owner=h.win.document.documentElement;let captured=false;
  const release=vi.fn(()=>{captured=false;});
  Object.assign(owner,{setPointerCapture:()=>{captured=true;},hasPointerCapture:()=>captured,releasePointerCapture:release});
  h.pointer("pointerdown");h.pointer("pointermove",120,110);
  if(reason==="lostpointercapture"){captured=false;owner.dispatchEvent(new h.win.PointerEvent(reason,{bubbles:true,pointerId:7}));}
  else if(reason==="cancel")h.drag.cancel();else h.drag.destroy();
  expect(h.options.end).toHaveBeenCalledExactlyOnceWith(true);expect(captured).toBe(false);
  expect(h.win.document.documentElement.style.userSelect).toBe("");
  h.pointer("pointerup",120,110);expect(h.click(120,110).defaultPrevented).toBe(false);
});

it.each(["release", "pointercancel", "lostpointercapture", "blur", "Escape", "cancel", "destroy", "buttons", "disabled"])("restores iframe hit-testing after %s without changing ordinary clicks", reason => {
  const h = harness();
  const frames = [h.win.document.createElement("iframe"), h.win.document.createElement("iframe"), h.win.document.createElement("iframe")];
  frames[1]!.style.setProperty("pointer-events", "auto", "important");
  frames[1]!.style.setProperty("border", "0");
  frames[2]!.style.setProperty("pointer-events", "none");
  if (reason === "lostpointercapture") Object.assign(h.win.document.documentElement, {
    setPointerCapture: () => {}, hasPointerCapture: () => false,
  });
  h.win.document.body.append(...frames);
  const originals = frames.map(frame => frame.style.cssText);
  h.pointer("pointerdown"); h.pointer("pointermove", 106, 100); h.pointer("pointerup", 106, 100);
  expect(frames.map(frame => frame.style.cssText)).toEqual(originals);
  expect(h.click(106, 100).defaultPrevented).toBe(false);
  h.pointer("pointerdown"); h.pointer("pointermove", 120, 110);
  for (const frame of frames) {
    expect(frame.style.pointerEvents).toBe("none");
    expect(frame.style.getPropertyPriority("pointer-events")).toBe("important");
  }
  if (reason === "release") h.pointer("pointerup", 120, 110);
  else if (reason === "pointercancel") h.pointer("pointercancel", 120, 110);
  else if (reason === "lostpointercapture") h.win.document.documentElement.dispatchEvent(new h.win.PointerEvent("lostpointercapture", { bubbles: true, pointerId: 7 }));
  else if (reason === "blur") h.win.dispatchEvent(new h.win.Event("blur"));
  else if (reason === "Escape") h.win.dispatchEvent(new h.win.KeyboardEvent("keydown", { key: "Escape" }));
  else if (reason === "cancel") h.drag.cancel();
  else if (reason === "destroy") h.drag.destroy();
  else if (reason === "buttons") h.pointer("pointermove", 120, 110, h.page, { buttons: 0 });
  else { h.options.enabled.mockReturnValue(false); h.pointer("pointermove", 120, 110); }
  expect(h.options.end).toHaveBeenCalledExactlyOnceWith(reason !== "release");
  expect(frames.map(frame => frame.style.cssText)).toEqual(originals);
  expect(frames[1]!.style.getPropertyPriority("pointer-events")).toBe("important");
});

it("restores the page even when releasing native pointer ownership throws", () => {
  const h = harness(), frame = h.win.document.createElement("iframe"); h.win.document.body.append(frame);
  Object.assign(h.win.document.documentElement, {
    setPointerCapture: () => {}, hasPointerCapture: () => true,
    releasePointerCapture: () => { throw new Error("No active pointer"); },
  });
  h.complete();
  expect(h.options.end).toHaveBeenCalledExactlyOnceWith(false);
  expect(frame.style.pointerEvents).toBe("");
  expect(h.win.document.documentElement.style.userSelect).toBe("");
  expect(h.click(110, 115).defaultPrevented).toBe(true);
});

it.each(["input", "textarea", "select", "button", "div[contenteditable]", "div[data-starlite-quick-settings]",
  "div[data-starlite-widget-restore]", "div[data-starlite-visitor-toolbar]"])("leaves %s and its descendants available to native interaction", selector => {
  const h = harness(), [tag, attribute] = selector.split("[");
  const control = h.win.document.createElement(tag!) as HTMLElement;
  if (attribute) control.setAttribute(attribute.slice(0, -1), "");
  const child = h.win.document.createElement("span"); control.append(child); h.page.append(control);
  h.pointer("pointerdown", 100, 100, child); h.pointer("pointermove", 130, 100, child); h.pointer("pointerup", 130, 100, child);
  expect(h.click(130, 100, child).defaultPrevented).toBe(false);
  expect(h.options.hit).not.toHaveBeenCalled(); expect(h.options.start).not.toHaveBeenCalled();
});

it.each([{ shiftKey: true }, { ctrlKey: true }, { altKey: true }, { metaKey: true }, { pointerType: "touch" },
  { pointerType: "pen" }, { button: 2 }, { isPrimary: false }])("does not capture modified or non-primary mouse input: %j", init => {
  const h = harness(); h.pointer("pointerdown", 100, 100, h.page, init);
  expect(h.pointer("pointermove", 130, 100, h.page, init).defaultPrevented).toBe(false);
  h.pointer("pointerup", 130, 100, h.page, init); expect(h.click(130, 100).defaultPrevented).toBe(false);
  expect(h.options.start).not.toHaveBeenCalled();
});

it("leaves transparent pixels and disabled dragging untouched while continuing hover observation", () => {
  const h = harness(); h.options.hit.mockReturnValue(false); h.complete();
  expect(h.click(110, 115).defaultPrevented).toBe(false); expect(h.options.start).not.toHaveBeenCalled();
  h.options.hit.mockReturnValue(true); h.options.enabled.mockReturnValue(false); h.complete();
  expect(h.click(110, 115).defaultPrevented).toBe(false); expect(h.options.start).not.toHaveBeenCalled();
  expect(h.options.hover).toHaveBeenCalledTimes(2);
});

it.each(["pointercancel", "blur", "Escape", "cancel", "buttons", "disabled"])("cleans an active drag after %s without leaving a click suppression token", reason => {
  const h = harness(); h.pointer("pointerdown"); h.pointer("pointermove", 120, 110);
  expect(h.win.document.documentElement.style.userSelect).toBe("none");
  if (reason === "pointercancel") h.pointer("pointercancel", 120, 110);
  else if (reason === "blur") h.win.dispatchEvent(new h.win.Event("blur"));
  else if (reason === "Escape") h.win.dispatchEvent(new h.win.KeyboardEvent("keydown", { key: "Escape" }));
  else if (reason === "cancel") h.drag.cancel();
  else if (reason === "buttons") h.pointer("pointermove", 120, 110, h.page, { buttons: 0 });
  else { h.options.enabled.mockReturnValue(false); h.pointer("pointermove", 120, 110); }
  expect(h.options.end).toHaveBeenCalledExactlyOnceWith(true); expect(h.win.document.documentElement.style.userSelect).toBe("");
  h.pointer("pointerup", 120, 110); expect(h.click(120, 110).defaultPrevented).toBe(false);
});

it("does not mistake a descendant losing focus or another pointer's cancellation for window cancellation", () => {
  const h = harness(); h.pointer("pointerdown");
  h.page.dispatchEvent(new h.win.Event("blur", { bubbles: false })); h.pointer("pointercancel", 100, 100, h.page, { pointerId: 9 });
  h.pointer("pointermove", 120, 100); h.pointer("pointerup", 120, 100);
  expect(h.options.end).toHaveBeenCalledExactlyOnceWith(false); expect(h.click(120, 100).defaultPrevented).toBe(true);
});

it("retains existing text selections and restores both CSS values and priorities", () => {
  const h = harness(), text = h.win.document.createElement("p"); text.textContent = "Original selected text"; h.page.append(text);
  const selection = h.win.document.getSelection()!; selection.selectAllChildren(text);
  const style = h.win.document.documentElement.style; style.setProperty("user-select", "text", "important"); style.setProperty("-webkit-user-select", "auto");
  const originalStyle = style.cssText;
  h.pointer("pointerdown"); selection.removeAllRanges(); h.pointer("pointermove", 110, 100);
  expect(selection.toString()).toBe("Original selected text");
  const selectstart = new h.win.Event("selectstart", { bubbles: true, cancelable: true }); h.page.dispatchEvent(selectstart);
  expect(selectstart.defaultPrevented).toBe(true); h.pointer("pointerup", 110, 100);
  expect(selection.toString()).toBe("Original selected text"); expect(style.userSelect).toBe("text");
  expect(style.getPropertyPriority("user-select")).toBe("important"); expect(style.cssText).toBe(originalStyle);
});

it("clears only text newly selected during the pending gesture, leaving ordinary native selection intact", () => {
  const h = harness(); h.page.textContent = "Page text";
  const selection = h.win.document.getSelection()!;
  h.pointer("pointerdown"); selection.selectAllChildren(h.page); h.pointer("pointermove", 110, 100);
  expect(selection.isCollapsed).toBe(true); h.pointer("pointerup", 110, 100);
  h.pointer("pointerdown"); selection.selectAllChildren(h.page); h.pointer("pointerup");
  expect(selection.toString()).toBe("Page text");
});

it.each(["a", "img"])("prevents a native %s drag from stealing the pending pointer sequence", tag => {
  const h = harness(), link = h.win.document.createElement(tag) as HTMLElement; h.page.append(link);
  const down = vi.fn(); link.addEventListener("pointerdown", down);
  h.pointer("pointerdown", 100, 100, link); h.pointer("pointermove", 105, 100, link);
  const nativeDrag = new h.win.MouseEvent("dragstart", { bubbles: true, cancelable: true, clientX: 105, clientY: 100 }); link.dispatchEvent(nativeDrag);
  expect(nativeDrag.defaultPrevented).toBe(true); expect(h.options.start).not.toHaveBeenCalled(); expect(down).toHaveBeenCalledOnce();
  h.pointer("pointermove", 108, 100, link); h.pointer("pointerup", 108, 100, link);
  expect(h.options.start).toHaveBeenCalledOnce(); expect(h.options.end).toHaveBeenCalledExactlyOnceWith(false);
  expect(h.click(108, 100, link).defaultPrevented).toBe(true);
});

it("also advances a drag when native dragstart is the first event beyond the threshold", () => {
  const h = harness(); h.pointer("pointerdown");
  const event = new h.win.MouseEvent("dragstart", { bubbles: true, cancelable: true, clientX: 108, clientY: 100 }); h.page.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true); expect(h.options.start).toHaveBeenCalledOnce(); expect(h.options.move).toHaveBeenLastCalledWith(8, 0);
  h.pointer("pointerup", 108, 100); expect(h.click(108, 100).defaultPrevented).toBe(true);
});

it("does not consume keyboard, programmatic, another pointer, or unrelated-location clicks", () => {
  const h = harness(); h.complete();
  expect(h.click(110, 115, h.page, { detail: 0, pointerId: -1, pointerType: "" }).defaultPrevented).toBe(false);
  expect(h.click(110, 115, h.page, {}, false).defaultPrevented).toBe(false);
  h.page.click(); expect(h.pageClick).toHaveBeenCalledTimes(3);
  expect(h.click(110, 115, h.page, { pointerId: 9 }).defaultPrevented).toBe(false);
  expect(h.click(150, 150).defaultPrevented).toBe(false);
  expect(h.click(110, 115).defaultPrevented).toBe(true);
});

it("expires suppression and clears it before the next ordinary pointerdown", () => {
  vi.useFakeTimers(); const h = harness(); h.complete(); vi.advanceTimersByTime(501);
  expect(h.click(110, 115).defaultPrevented).toBe(false);
  h.complete(); h.pointer("pointerdown", 110, 115); h.pointer("pointerup", 110, 115);
  expect(h.click(110, 115).defaultPrevented).toBe(false);
});

it("removes every listener, cancels active work, and restores temporary styles on destruction", () => {
  const h = harness(), remove = vi.spyOn(h.win, "removeEventListener");
  h.pointer("pointerdown"); h.pointer("pointermove", 110, 115); h.drag.destroy(); h.drag.destroy();
  expect(h.options.end).toHaveBeenCalledExactlyOnceWith(true); expect(h.win.document.documentElement.style.userSelect).toBe("");
  expect(remove.mock.calls.map(([type]) => type).sort()).toEqual(["pointerdown", "pointermove", "pointerup", "pointercancel", "lostpointercapture", "blur", "keydown", "dragstart", "selectstart", "click"].sort());
  h.options.hover.mockClear(); h.complete(); expect(h.options.start).toHaveBeenCalledOnce(); expect(h.options.hover).not.toHaveBeenCalled();
  expect(h.click(110, 115).defaultPrevented).toBe(false);
  const selectstart = new h.win.Event("selectstart", { bubbles: true, cancelable: true }); h.page.dispatchEvent(selectstart); expect(selectstart.defaultPrevented).toBe(false);
});
