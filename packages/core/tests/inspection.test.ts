// @vitest-environment happy-dom
import {afterEach, expect, it, vi} from "vitest";
import {installModelInspection} from "../src/inspection.js";

const cleanups: (() => void)[] = [];
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); document.body.replaceChildren(); vi.useRealTimers(); });
function setup() {
  const host = document.createElement("div"), link = document.createElement("a"), iframe = document.createElement("iframe");
  iframe.srcdoc = "<p>Embedded content</p>";
  document.body.append(link, host, iframe); iframe.style.setProperty("pointer-events", "auto", "important");
  const controller = {inspecting: false, rotateInspection: vi.fn(() => {controller.inspecting = true;}), resetCamera: vi.fn(() => {controller.inspecting = false;})};
  const input = installModelInspection(host, {controller, enabled: () => true, hit: (x, y) => x >= 20 && x < 80 && y >= 20 && y < 80});
  cleanups.push(input.destroy);
  const send = (name: string, x = 40, button = 1, buttons = 4) => {
    const e = new PointerEvent(name, {pointerId: 1, pointerType: "mouse", clientX: x, clientY: 40, button, buttons, bubbles: true, cancelable: true});
    link.dispatchEvent(e); return e;
  };
  return {host, link, iframe, controller, input, send};
}
it("claims only middle presses on the silhouette, orbits past the threshold and hides the entry hint", () => {
  vi.useFakeTimers(); const {controller, input, send, iframe} = setup();
  expect(send("pointerdown", 10).defaultPrevented).toBe(false);
  expect(send("pointerdown", 40, 0, 1).defaultPrevented).toBe(false);
  expect(send("pointerdown").defaultPrevented).toBe(true);
  expect(send("mousedown").defaultPrevented).toBe(true);
  send("pointermove", 46); expect(controller.rotateInspection).not.toHaveBeenCalled();
  send("pointermove", 90); expect(controller.rotateInspection).toHaveBeenCalledWith(50, 0);
  expect(input.hint.hidden).toBe(false); expect(iframe.style.pointerEvents).toBe("none");
  send("pointerup", 90, 1, 0); expect(controller.inspecting).toBe(true);
  expect(iframe.style.getPropertyValue("pointer-events")).toBe("auto"); expect(iframe.style.getPropertyPriority("pointer-events")).toBe("important");
  expect(send("auxclick", 90, 1, 0).defaultPrevented).toBe(true);
  vi.advanceTimersByTime(3000); expect(input.hint.hidden).toBe(true);
  send("pointerdown"); send("pointermove", 60); expect(input.hint.hidden).toBe(true);
  send("pointerup", 60, 1, 0); expect(controller.resetCamera).not.toHaveBeenCalled();
  send("pointerdown"); send("pointerup", 40, 1, 0); expect(controller.resetCamera).toHaveBeenCalledOnce();
});
it("cancels capture on blur/destroy without resetting an active camera or leaking iframe overrides", () => {
  const {input, send, iframe, controller} = setup();
  send("pointerdown"); send("pointermove", 70);
  window.dispatchEvent(new Event("blur"));
  send("pointermove", 100); expect(controller.rotateInspection).toHaveBeenCalledTimes(1);
  expect(controller.inspecting).toBe(true); expect(iframe.style.pointerEvents).toBe("auto");
  send("pointerdown"); input.destroy();
  expect(iframe.style.pointerEvents).toBe("auto"); expect(input.hint.isConnected).toBe(false);
  expect(send("pointerdown").defaultPrevented).toBe(false);
});
