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
  menu.element.querySelector<HTMLButtonElement>('[role=combobox][data-setting-id="fps"]')!.click();
  menu.element.querySelector<HTMLButtonElement>('[role=option][data-value="30"]')!.click(); expect(next).toHaveBeenCalledWith("30");
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

it("keeps a synchronous setting enabled after its callback updates the menu", () => {
  let value = true;
  let menu: QuickSettingsMenu;
  const options = (): QuickSettingsOptions => ({ tabs: [{ id: "display", label: "显示", items: [
    { kind: "toggle", id: "bubble", label: "气泡", value, onChange: next => { value = next; menu.update(options()); } },
  ] }] });
  menu = make(options());
  const input = menu.element.querySelector<HTMLInputElement>("input")!;
  input.click(); expect(value).toBe(false); expect(input.disabled).toBe(false);
  input.click(); expect(value).toBe(true); expect(input.disabled).toBe(false);
});

it("anchors an open card through live slider updates, taller tabs, and viewport resizing", () => {
  let height = 300;
  let menu: QuickSettingsMenu;
  const options = (value: number): QuickSettingsOptions => ({ tabs: [
    { id: "display", label: "显示", items: [{ id: "size", kind: "range", label: "大小", value, min: 50, max: 150, onChange: next => { height = 550; menu.update(options(next)); } }] },
    { id: "work", label: "工作", items: [{ id: "mode", kind: "toggle", label: "气泡", value: true, onChange() {} }] },
  ] });
  menu = make(options(100));
  const rect = vi.spyOn(menu.element, "getBoundingClientRect").mockImplementation(() => new DOMRect(0, 0, 300, height));
  menu.open(innerWidth - 20, innerHeight - 20);
  const anchor = [menu.element.style.left, menu.element.style.top, menu.element.style.maxHeight];
  const range = menu.element.querySelector<HTMLInputElement>("input[type=range]")!;
  range.value = "130"; range.dispatchEvent(new Event("input"));
  menu.element.querySelectorAll<HTMLButtonElement>("[role=tab]")[1]!.click();
  window.dispatchEvent(new Event("resize"));
  expect([menu.element.style.left, menu.element.style.top, menu.element.style.maxHeight]).toEqual(anchor);
  expect(rect).toHaveBeenCalledTimes(1);
  menu.close(); menu.open(24, 32);
  expect(menu.element.style.left).toBe("24px"); expect(menu.element.style.top).toBe("32px");
});

it("discards a previous host width limit only when explicitly opening again", () => {
  const options: QuickSettingsOptions = { tabs: [{ id: "display", label: "显示", items: [] }] };
  const menu = make(options);
  vi.spyOn(menu.element, "getBoundingClientRect").mockImplementation(() => new DOMRect(0, 0, Number.parseFloat(menu.element.style.maxWidth) || 300, 100));
  menu.open(innerWidth, 40);
  menu.element.style.maxWidth = "30px";
  menu.update(options); expect(menu.element.style.maxWidth).toBe("30px");
  menu.close(); menu.open(innerWidth, 40);
  expect(menu.element.style.maxWidth).toBe(""); expect(menu.element.style.left).toBe(`${innerWidth - 308}px`);
});

it("keeps the slider thumb under an active pointer when host persistence returns an earlier value", () => {
  const options = (value: number): QuickSettingsOptions => ({ tabs: [{ id: "display", label: "显示", items: [
    { id: "size", kind: "range", label: "大小", value, min: 50, max: 150, formatValue: next => `${next}%`, onChange() {} },
  ] }] });
  const menu = make(options(100)); menu.open(10, 10);
  const range = menu.element.querySelector<HTMLInputElement>("input")!;
  range.dispatchEvent(new PointerEvent("pointerdown", { button: 0, pointerId: 7, bubbles: true }));
  range.value = "135"; range.dispatchEvent(new Event("input"));
  menu.update(options(110));
  expect(range.value).toBe("135"); expect(menu.element.querySelector("output")?.textContent).toBe("135%");
  document.dispatchEvent(new PointerEvent("pointerup", { pointerId: 8, bubbles: true }));
  menu.update(options(120)); expect(range.value).toBe("135");
  menu.update(options(135)); document.dispatchEvent(new PointerEvent("pointerup", { pointerId: 7, bubbles: true }));
  menu.update(options(125)); expect(range.value).toBe("125");
});

it("presents readable rounded inline choices, supports pointer selection and preserves the menu anchor", () => {
  const change = vi.fn();
  const menu = make({ tabs: [{ id: "work", label: "工作", items: [
    { id: "mode", kind: "select", label: "工作气泡", value: "compact", options: [{ value: "compact", label: "精简" }, { value: "detailed", label: "详细" }], onChange: change },
  ] }] });
  menu.open(50, 80);
  const anchor = [menu.element.style.left, menu.element.style.top];
  const trigger = menu.element.querySelector<HTMLButtonElement>("[role=combobox]")!;
  const listbox = menu.element.querySelector<HTMLElement>("[role=listbox]")!;
  expect(menu.element.querySelector("select")).toBeNull(); expect(trigger.textContent).toBe("精简"); expect(listbox.hidden).toBe(true);
  trigger.click();
  expect(trigger.getAttribute("aria-expanded")).toBe("true"); expect(trigger.getAttribute("aria-controls")).toBe(listbox.id); expect(listbox.hidden).toBe(false);
  const option = listbox.querySelector<HTMLButtonElement>('[data-value="detailed"]')!;
  expect(getComputedStyle(option).backgroundColor).toBe("#20283b"); expect(getComputedStyle(option).color).toBe("#f0f3ff"); expect(getComputedStyle(listbox).borderRadius).toBe("10px");
  option.click(); expect(change).toHaveBeenCalledExactlyOnceWith("detailed"); expect(trigger.textContent).toBe("详细");
  expect(option.getAttribute("aria-selected")).toBe("true"); expect(listbox.hidden).toBe(true); expect(document.activeElement).toBe(trigger);
  expect([menu.element.style.left, menu.element.style.top]).toEqual(anchor);
});

it("supports select keyboard navigation and closes choices before closing the card", () => {
  const change = vi.fn();
  const menu = make({ tabs: [{ id: "a", label: "工作", items: [
    { id: "mode", kind: "select", label: "工作气泡", value: "compact", options: [{ value: "compact", label: "精简" }, { value: "detailed", label: "详细" }], onChange: change },
  ] }] });
  menu.open(10, 10);
  const trigger = menu.element.querySelector<HTMLButtonElement>("[role=combobox]")!; trigger.focus();
  const key = (value: string) => trigger.dispatchEvent(new KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true }));
  key("ArrowDown"); key("ArrowDown");
  expect(menu.element.querySelector('[data-active=true]')?.textContent).toBe("详细");
  key("Enter"); expect(change).toHaveBeenLastCalledWith("detailed"); expect(trigger.getAttribute("aria-expanded")).toBe("false");
  key("End"); key("Home"); key(" "); expect(change).toHaveBeenLastCalledWith("compact");
  key(" "); key("Escape"); expect(trigger.getAttribute("aria-expanded")).toBe("false"); expect(menu.isOpen).toBe(true);
  key("ArrowUp"); key("Tab"); expect(trigger.getAttribute("aria-expanded")).toBe("false"); expect(menu.isOpen).toBe(true);
  key(" "); menu.element.querySelector('[role=tab]')!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  key("Escape"); expect(menu.isOpen).toBe(false);
});

it("uses updated select callbacks and rolls back a failed asynchronous choice", async () => {
  const old = vi.fn();
  const options = (onChange: (value: string) => void | Promise<void>): QuickSettingsOptions => ({ tabs: [{ id: "a", label: "工作", items: [
    { id: "mode", kind: "select", label: "工作气泡", value: "compact", options: [{ value: "compact", label: "精简" }, { value: "detailed", label: "详细" }], onChange },
  ] }] });
  const menu = make(options(old)); menu.open(10, 10); const change = vi.fn(async () => { throw new Error("private"); }); menu.update(options(change));
  const trigger = menu.element.querySelector<HTMLButtonElement>("[role=combobox]")!;
  trigger.click(); menu.element.querySelector<HTMLButtonElement>('[role=option][data-value="detailed"]')!.click();
  await vi.waitFor(() => expect(menu.element.querySelector<HTMLElement>("[role=status]")!.hidden).toBe(false));
  expect(old).not.toHaveBeenCalled(); expect(change).toHaveBeenCalledWith("detailed"); expect(trigger.textContent).toBe("精简"); expect(trigger.disabled).toBe(false);
});
