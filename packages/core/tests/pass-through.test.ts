// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { observePassThroughClicks } from "../src/pass-through.js";

const cleanups: (() => void)[] = [];
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); vi.restoreAllMocks(); document.body.replaceChildren(); });
function fixture() {
  const canvas = document.createElement("canvas"), link = document.createElement("a"), react = vi.fn();
  link.href = "#article"; document.body.append(link, canvas);
  vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({ left: 20, top: 30, right: 120, bottom: 230, width: 100, height: 200 } as DOMRect);
  cleanups.push(observePassThroughClicks(canvas, react));
  const pointer = (type: string, x = 50, y = 60, extra: Record<string, unknown> = {}) => {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: Number(extra.button ?? 0) });
    Object.defineProperties(event, { pointerId: { value: extra.pointerId ?? 1 }, isPrimary: { value: extra.isPrimary ?? true } });
    link.dispatchEvent(event); return event;
  };
  const click = (extra: MouseEventInit = {}) => {
    const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, detail: 1, clientX: 50, clientY: 60, ...extra });
    link.dispatchEvent(event); return event;
  };
  return { canvas, link, react, pointer, click };
}
it("reacts once while the exact native modified click reaches the underlying page", () => {
  const f = fixture(), received = vi.fn(); f.link.addEventListener("click", received);
  const down = f.pointer("pointerdown"), up = f.pointer("pointerup"), click = f.click({ ctrlKey: true, shiftKey: true });
  expect(f.react).toHaveBeenCalledOnce(); expect(received).toHaveBeenCalledOnce(); expect(received.mock.calls[0]![0]).toBe(click);
  expect([down, up, click].every(event => !event.defaultPrevented)).toBe(true); expect(click.ctrlKey).toBe(true);
});
it("suppresses sliding even after returning to the starting point and rejects outside gestures", () => {
  const f = fixture();
  f.pointer("pointerdown"); f.pointer("pointermove", 70); f.pointer("pointermove"); f.pointer("pointerup"); f.click();
  f.pointer("pointerdown", 5); f.pointer("pointerup"); f.click();
  f.pointer("pointerdown"); f.pointer("pointerup", 200); f.click();
  expect(f.react).not.toHaveBeenCalled();
});
it("keeps a native pointer gesture when its page target changes element focus", () => {
  const f = fixture(), input = document.createElement("input"), blurred = vi.fn();
  document.body.append(input); input.addEventListener("blur", blurred); input.focus();
  f.pointer("pointerdown"); f.link.focus();
  expect(blurred).toHaveBeenCalledOnce(); expect(document.activeElement).toBe(f.link);
  f.pointer("pointerup"); const click = f.click();
  expect(f.react).toHaveBeenCalledOnce(); expect(click.defaultPrevented).toBe(false);
});
it("rejects secondary buttons, nonprimary pointers, canceled gestures and keyboard clicks", () => {
  const f = fixture();
  f.pointer("pointerdown", 50, 60, { button: 2 }); f.pointer("pointerup", 50, 60, { button: 2 }); f.click({ button: 2 });
  f.pointer("pointerdown", 50, 60, { isPrimary: false }); f.pointer("pointerup"); f.click();
  f.pointer("pointerdown"); f.pointer("pointercancel"); f.pointer("pointerup"); f.click();
  f.pointer("pointerdown"); f.pointer("pointerup"); f.click({ detail: 0 }); f.click();
  expect(f.react).not.toHaveBeenCalled();
});
it("cancels on scrolling or blur and unbinds idempotently on destroy", () => {
  const f = fixture();
  for (const type of ["scroll", "blur"]) { f.pointer("pointerdown"); window.dispatchEvent(new Event(type)); f.pointer("pointerup"); f.click(); }
  expect(f.react).not.toHaveBeenCalled();
  const destroy = cleanups.pop()!; destroy(); destroy();
  f.pointer("pointerdown"); f.pointer("pointerup"); const click = f.click();
  expect(f.react).not.toHaveBeenCalled(); expect(click.defaultPrevented).toBe(false);
});
it("ignores companion settings and restore controls placed over the model", () => {
  const f = fixture();
  for (const marker of ["data-starlite-quick-settings", "data-starlite-widget-restore"]) {
    const control = document.createElement("section"); control.setAttribute(marker, ""); document.body.append(control); control.append(f.link);
    f.pointer("pointerdown"); f.pointer("pointerup"); const click = f.click();
    expect(click.defaultPrevented).toBe(false); expect(f.react).not.toHaveBeenCalled();
    document.body.append(f.link); control.remove();
  }
  f.pointer("pointerdown"); f.pointer("pointerup"); f.click(); expect(f.react).toHaveBeenCalledOnce();
});
