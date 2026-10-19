// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { QuickSettingsMenu, type QuickSettingsOptions } from "../src/quick-settings.js";
const menus: QuickSettingsMenu[] = [];
const make = (options: QuickSettingsOptions) => { const menu = new QuickSettingsMenu(options); menus.push(menu); return menu; };
afterEach(() => { for (const menu of menus.splice(0)) menu.destroy(); document.body.replaceChildren(); vi.restoreAllMocks(); });

it("creates one inert hidden card and clamps its open position to the viewport", () => {
  const menu = make({ title: "StarLite", tabs: [{ id: "display", label: "显示", items: [] }] });
  expect(menu.isOpen).toBe(false); expect(menu.element.hidden).toBe(true);
  vi.spyOn(menu.element, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 300, 400));
  menu.open(innerWidth + 100, innerHeight + 100);
  expect(menu.isOpen).toBe(true); expect(menu.element.style.left).toBe(`${innerWidth - 308}px`); expect(menu.element.style.top).toBe(`${innerHeight - 408}px`);
  expect(menu.element.dataset.starliteQuickSettings).toBe("");
  expect(document.querySelectorAll("[data-starlite-menu]")).toHaveLength(1);
  menu.destroy(); menu.destroy(); expect(document.querySelector("[data-starlite-menu]")).toBeNull();
});

it("closes on outside pointer without cancelling the underlying page event, and on Escape", () => {
  const menu = make({ tabs: [{ id: "a", label: "显示", items: [] }] }); menu.open(10, 10);
  const button = document.createElement("button"); document.body.append(button);
  const pointer = new PointerEvent("pointerdown", { bubbles: true, cancelable: true }); button.dispatchEvent(pointer);
  expect(pointer.defaultPrevented).toBe(false); expect(menu.isOpen).toBe(false);
  menu.open(10, 10); menu.element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); expect(menu.isOpen).toBe(true);
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", cancelable: true })); expect(menu.isOpen).toBe(false);
});

it("preserves the selected tab and live slider across authoritative updates", () => {
  const change = vi.fn();
  const options = (value: number): QuickSettingsOptions => ({ tabs: [
    { id: "a", label: "互动", items: [] },
    { id: "b", label: "显示", items: [{ id: "size", kind: "range", label: "大小", value, min: 50, max: 150, formatValue: value => `${value}%`, onChange: change }] },
  ] });
  const menu = make(options(100)); menu.open(10, 10);
  const tab = menu.element.querySelectorAll<HTMLButtonElement>("[role=tab]")[1]!; tab.click();
  const range = menu.element.querySelector<HTMLInputElement>("input")!; range.value = "120"; range.dispatchEvent(new Event("input"));
  expect(change).toHaveBeenCalledWith(120); expect(menu.element.querySelector("output")?.textContent).toBe("120%");
  menu.update(options(125));
  expect(menu.element.querySelector("input")).toBe(range); expect(range.value).toBe("125");
  expect(menu.element.querySelector("[aria-selected=true]")?.textContent).toBe("显示"); expect(menu.isOpen).toBe(true);
});

it("uses updated callbacks and values for toggles, selects and disabled actions", () => {
  const old = vi.fn(), next = vi.fn(), action = vi.fn();
  const options = (onChange: (v: boolean) => void): QuickSettingsOptions => ({ tabs: [{ id: "a", label: "显示", items: [
    { id: "bubble", kind: "toggle", label: "气泡", value: true, onChange },
    { id: "fps", kind: "select", label: "帧率", value: "60", options: [{ value: "30", label: "30 FPS" }, { value: "60", label: "60 FPS" }], onChange: next },
    { id: "restore", kind: "action", label: "恢复默认位置", disabled: true, onAction: action },
  ] }] });
  const menu = make(options(old)); menu.update(options(next));
  const input = menu.element.querySelector<HTMLInputElement>("input")!; input.checked = false; input.dispatchEvent(new Event("change"));
  expect(old).not.toHaveBeenCalled(); expect(next).toHaveBeenCalledWith(false);
  const select = menu.element.querySelector("select")!; select.value = "30"; select.dispatchEvent(new Event("change")); expect(next).toHaveBeenCalledWith("30");
  menu.element.querySelector<HTMLButtonElement>('[data-setting-id="restore"]')!.click(); expect(action).not.toHaveBeenCalled();
});

it("uses text nodes and contains failed callbacks without exposing their contents", async () => {
  const menu = make({ title: "<img src=x>", tabs: [{ id: "a", label: "<script>", items: [
    { id: "fail", kind: "action", label: "<b>失败</b>", onAction: async () => { throw new Error("private host details"); } },
  ] }] });
  menu.element.querySelector<HTMLButtonElement>('[data-setting-id="fail"]')!.click();
  await vi.waitFor(() => expect(menu.element.querySelector<HTMLElement>("[role=status]")!.hidden).toBe(false));
  expect(menu.element.textContent).toContain("未能应用设置"); expect(menu.element.textContent).not.toContain("private host details");
  expect(menu.element.querySelector("img,script,b")).toBeNull();
});

it("supports keyboard tab navigation and removes listeners when destroyed", () => {
  const menu = make({ tabs: [{ id: "a", label: "显示", items: [] }, { id: "b", label: "互动", items: [] }] }); menu.open(10, 10);
  menu.element.querySelector('[role=tab]')!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  expect(menu.element.querySelector('[aria-selected=true]')?.textContent).toBe("互动");
  const event = vi.fn(); menu.element.addEventListener("starlite-menu-change", event);
  menu.close(); expect(event).toHaveBeenCalledOnce(); menu.destroy(); menu.open(10, 10); expect(menu.isOpen).toBe(false);
});

it("rejects ambiguous item identities and invalid slider bounds", () => {
  expect(() => new QuickSettingsMenu({ tabs: [] })).toThrow();
  expect(() => new QuickSettingsMenu({ tabs: [{ id: "a", label: "", items: [
    { kind: "action", id: "x", label: "", onAction() {} }, { kind: "action", id: "x", label: "", onAction() {} },
  ] }] })).toThrow("unique");
  expect(() => new QuickSettingsMenu({ tabs: [{ id: "a", label: "", items: [{ kind: "range", id: "x", label: "", value: 1, min: 0, max: Infinity, onChange() {} }] }] })).toThrow("range");
});
