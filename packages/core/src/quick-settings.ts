export type QuickSettingCallback<T> = (value: T) => void | Promise<void>;
interface QuickSettingBase { id: string; label: string; description?: string; disabled?: boolean }
export type QuickSettingItem =
  | (QuickSettingBase & { kind: "toggle"; value: boolean; onChange: QuickSettingCallback<boolean> })
  | (QuickSettingBase & { kind: "range"; value: number; min: number; max: number; step?: number; formatValue?: (value: number) => string; onChange: QuickSettingCallback<number> })
  | (QuickSettingBase & { kind: "select"; value: string; options: readonly { value: string; label: string }[]; onChange: QuickSettingCallback<string> })
  | (QuickSettingBase & { kind: "action"; onAction: () => void | Promise<void> });
export interface QuickSettingsOptions {
  title?: string;
  tabs: readonly { id: string; label: string; items: readonly QuickSettingItem[] }[];
}

const STYLE = `
[data-starlite-menu]{position:fixed;box-sizing:border-box;width:300px;max-width:calc(100vw - 16px);max-height:calc(100vh - 16px);overflow:auto;padding:14px;border:1px solid #9ba9c740;border-radius:16px;background:#1c2130f5;color:#f0f3ff;box-shadow:0 14px 48px #0005;font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;z-index:2147483647;pointer-events:auto;user-select:none;backdrop-filter:blur(16px);color-scheme:dark;overscroll-behavior:contain}
[data-starlite-menu][hidden]{display:none!important}
[data-starlite-menu] *{box-sizing:border-box}
[data-starlite-menu] button,[data-starlite-menu] input,[data-starlite-menu] select{font:inherit;accent-color:#9faeff}
[data-starlite-menu] button,[data-starlite-menu] select{color:inherit;background:#ffffff09;border:1px solid #b4bfd528;border-radius:8px;padding:7px 9px}
[data-starlite-menu] button{cursor:pointer}
[data-starlite-menu] button:hover{background:#a7b3ff24}
[data-starlite-menu] :focus-visible{outline:2px solid #b3bfff;outline-offset:2px}
[data-starlite-menu] :disabled{opacity:.45;cursor:default}
[data-starlite-menu] .starlite-menu__header{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;font-weight:650;letter-spacing:.02em}
[data-starlite-menu] .starlite-menu__close{border:0;background:transparent;padding:2px 7px;font-size:20px;line-height:1.25}
[data-starlite-menu] [role=tablist]{display:flex;gap:4px;background:#0002;border-radius:9px;padding:3px;margin-bottom:8px}
[data-starlite-menu] [role=tab]{flex:1;border:0;background:transparent;padding:5px}
[data-starlite-menu] [role=tab][aria-selected=true]{background:#a7b3ff25;color:#dbe1ff}
[data-starlite-menu] .starlite-menu__row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 2px;border-bottom:1px solid #b4bfd514;min-height:44px}
[data-starlite-menu] .starlite-menu__row:last-child{border-bottom:0}
[data-starlite-menu] .starlite-menu__text{flex:1;min-width:0}
[data-starlite-menu] .starlite-menu__description{display:block;font-size:12px;color:#b1bbd2;margin-top:2px;font-weight:400}
[data-starlite-menu] .starlite-menu__toggle{appearance:none;flex:none;width:34px;height:20px;border-radius:12px;background:#69738a;cursor:pointer;position:relative;margin:0}
[data-starlite-menu] .starlite-menu__toggle:before{content:"";position:absolute;left:3px;top:3px;width:14px;height:14px;border-radius:50%;background:#fff;transition:transform .12s}
[data-starlite-menu] .starlite-menu__toggle:checked{background:#899cf6}
[data-starlite-menu] .starlite-menu__toggle:checked:before{transform:translateX(14px)}
[data-starlite-menu] .starlite-menu__range-row{display:block}
[data-starlite-menu] .starlite-menu__range-label{display:flex;justify-content:space-between;gap:12px;margin-bottom:8px}
[data-starlite-menu] input[type=range]{display:block;width:100%;margin:0;cursor:pointer}
[data-starlite-menu] output{font-variant-numeric:tabular-nums;color:#c8d2ff}
[data-starlite-menu] select{max-width:150px}
[data-starlite-menu] .starlite-menu__action{display:block;width:100%;text-align:left;border:0;background:transparent;padding:8px 2px}
[data-starlite-menu] .starlite-menu__status{margin:8px 0 0;color:#ffc7c7;font-size:12px}
@media(prefers-reduced-motion:reduce){[data-starlite-menu] *{transition:none!important}}
`;
let instanceId = 0;

/** Shared host controls only; no renderer, model, or application dependencies. */
export class QuickSettingsMenu {
  readonly element = document.createElement("section");
  #options: QuickSettingsOptions;
  #activeTab: string;
  #structure = "";
  #controls = new Map<string, HTMLInputElement | HTMLSelectElement | HTMLButtonElement>();
  #outputs = new Map<string, HTMLOutputElement>();
  #pending = new Map<string, number>();
  #generation = 0;
  #destroyed = false;
  #x = 0;
  #y = 0;
  #previousFocus: HTMLElement | undefined;
  readonly #id = `starlite-menu-${++instanceId}`;
  readonly #outside = (event: Event) => { if (this.isOpen && !event.composedPath().includes(this.element)) this.close(); };
  readonly #key = (event: KeyboardEvent) => { if (this.isOpen && event.key === "Escape") { event.preventDefault(); this.close(); } };
  readonly #resize = () => { if (this.isOpen) this.#position(); };

  constructor(options: QuickSettingsOptions) {
    this.#validate(options); this.#options = options; this.#activeTab = options.tabs[0]!.id;
    if (!document.querySelector("style[data-starlite-menu-style]")) {
      const style = document.createElement("style"); style.dataset.starliteMenuStyle = ""; style.textContent = STYLE; document.head.append(style);
    }
    this.element.dataset.starliteMenu = ""; this.element.dataset.starliteQuickSettings = ""; this.element.hidden = true;
    this.element.setAttribute("role", "dialog"); this.element.setAttribute("aria-label", options.title ?? "StarLite");
    this.element.addEventListener("contextmenu", event => event.preventDefault());
    document.body.append(this.element);
    document.addEventListener("pointerdown", this.#outside, true); document.addEventListener("keydown", this.#key);
    window.addEventListener("resize", this.#resize);
    this.#render();
  }
  get isOpen(): boolean { return !this.#destroyed && !this.element.hidden; }
  open(clientX: number, clientY: number): void {
    if (this.#destroyed || !Number.isFinite(clientX) || !Number.isFinite(clientY)) return;
    if (!this.isOpen) this.#previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    this.#x = clientX; this.#y = clientY; this.element.hidden = false; this.#position();
    this.element.querySelector<HTMLElement>("[role=tab][aria-selected=true]")?.focus({ preventScroll: true });
    this.element.dispatchEvent(new Event("starlite-menu-change"));
  }
  close(): void {
    if (!this.isOpen) return;
    const containedFocus = this.element.contains(document.activeElement);
    this.element.hidden = true;
    if (containedFocus && this.#previousFocus?.isConnected) this.#previousFocus.focus({ preventScroll: true });
    this.element.dispatchEvent(new Event("starlite-menu-change"));
  }
  update(options: QuickSettingsOptions): void {
    if (this.#destroyed) return;
    this.#validate(options); this.#options = options;
    if (!options.tabs.some(tab => tab.id === this.#activeTab)) this.#activeTab = options.tabs[0]!.id;
    this.#render(); if (this.isOpen) this.#position();
  }
  destroy(): void {
    if (this.#destroyed) return;
    this.close(); this.#destroyed = true; this.#generation++;
    document.removeEventListener("pointerdown", this.#outside, true); document.removeEventListener("keydown", this.#key);
    window.removeEventListener("resize", this.#resize); this.element.remove(); this.#controls.clear(); this.#outputs.clear();
  }
  #validate(options: QuickSettingsOptions): void {
    const ids = new Set<string>();
    if (!options.tabs.length) throw new Error("quick settings requires a tab");
    for (const tab of options.tabs) {
      if (!tab.id || ids.has(`tab:${tab.id}`)) throw new Error("quick settings tab IDs must be unique");
      ids.add(`tab:${tab.id}`);
      for (const item of tab.items) {
        if (!item.id || ids.has(item.id)) throw new Error("quick settings item IDs must be unique");
        ids.add(item.id);
        if (item.kind === "range" && (![item.value, item.min, item.max, item.step ?? 1].every(Number.isFinite) || item.max <= item.min || (item.step ?? 1) <= 0)) throw new Error("invalid quick settings range");
      }
    }
  }
  #item(id: string): QuickSettingItem | undefined { return this.#options.tabs.flatMap(tab => tab.items).find(item => item.id === id); }
  #render(): void {
    const structure = JSON.stringify([this.#activeTab, this.#options.title, this.#options.tabs.map(tab => [tab.id, tab.label, tab.items.map(item => [item.id, item.kind, item.label, item.description, item.kind === "select" ? item.options : item.kind === "range" ? [item.min, item.max, item.step] : null])])]);
    if (structure === this.#structure) { this.#sync(); return; }
    this.#structure = structure; this.#controls.clear(); this.#outputs.clear();
    this.element.replaceChildren();
    const header = document.createElement("div"); header.className = "starlite-menu__header";
    const title = document.createElement("span"); title.textContent = this.#options.title ?? "StarLite";
    const close = document.createElement("button"); close.type = "button"; close.className = "starlite-menu__close"; close.textContent = "×"; close.setAttribute("aria-label", "关闭菜单"); close.onclick = () => this.close(); header.append(title, close);
    const tabs = document.createElement("div"); tabs.setAttribute("role", "tablist"); tabs.setAttribute("aria-label", "设置分类");
    for (const [index, tab] of this.#options.tabs.entries()) {
      const button = document.createElement("button"); button.type = "button"; button.textContent = tab.label;
      button.id = `${this.#id}-tab-${index}`; button.setAttribute("role", "tab"); button.setAttribute("aria-selected", String(tab.id === this.#activeTab)); button.tabIndex = tab.id === this.#activeTab ? 0 : -1;
      button.setAttribute("aria-controls", `${this.#id}-panel`);
      button.onclick = () => { this.#activeTab = tab.id; this.#render(); this.#position(); this.element.querySelector<HTMLElement>("[aria-selected=true]")?.focus({ preventScroll: true }); };
      button.onkeydown = event => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const count = this.#options.tabs.length;
        const next = event.key === "Home" ? 0 : event.key === "End" ? count - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + count) % count;
        this.#activeTab = this.#options.tabs[next]!.id; this.#render(); this.#position(); this.element.querySelector<HTMLElement>("[aria-selected=true]")?.focus({ preventScroll: true });
      };
      tabs.append(button);
    }
    const panel = document.createElement("div"); panel.id = `${this.#id}-panel`; panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", `${this.#id}-tab-${this.#options.tabs.findIndex(tab => tab.id === this.#activeTab)}`);
    for (const item of this.#options.tabs.find(tab => tab.id === this.#activeTab)!.items) panel.append(this.#row(item));
    const status = document.createElement("p"); status.className = "starlite-menu__status"; status.setAttribute("role", "status"); status.hidden = true;
    this.element.append(header, tabs, panel, status); this.element.setAttribute("aria-label", this.#options.title ?? "StarLite"); this.#sync();
  }
  #text(item: QuickSettingItem): HTMLSpanElement {
    const text = document.createElement("span"); text.className = "starlite-menu__text"; text.textContent = item.label;
    if (item.description) { const description = document.createElement("span"); description.className = "starlite-menu__description"; description.textContent = item.description; text.append(description); }
    return text;
  }
  #row(item: QuickSettingItem): HTMLElement {
    if (item.kind === "action") {
      const row = document.createElement("div"); row.className = "starlite-menu__row";
      const button = document.createElement("button"); button.type = "button"; button.className = "starlite-menu__action"; button.append(this.#text(item)); button.dataset.settingId = item.id;
      button.onclick = () => { const current = this.#item(item.id); if (current?.kind === "action") this.#invoke(current.id, current.onAction); };
      this.#controls.set(item.id, button); row.append(button); return row;
    }
    const row = document.createElement("label"); row.className = "starlite-menu__row";
    const text = this.#text(item);
    if (item.kind === "select") {
      const select = document.createElement("select"); select.dataset.settingId = item.id;
      for (const option of item.options) { const node = document.createElement("option"); node.value = option.value; node.textContent = option.label; select.append(node); }
      select.onchange = () => { const current = this.#item(item.id); if (current?.kind === "select") this.#invoke(current.id, () => current.onChange(select.value)); };
      this.#controls.set(item.id, select); row.append(text, select); return row;
    }
    const input = document.createElement("input"); input.dataset.settingId = item.id;
    if (item.kind === "toggle") {
      input.type = "checkbox"; input.className = "starlite-menu__toggle";
      input.onchange = () => { const current = this.#item(item.id); if (current?.kind === "toggle") this.#invoke(current.id, () => current.onChange(input.checked)); };
      row.append(text, input);
    } else {
      input.type = "range"; input.min = String(item.min); input.max = String(item.max); input.step = String(item.step ?? 1);
      row.classList.add("starlite-menu__range-row");
      const label = document.createElement("span"); label.className = "starlite-menu__range-label";
      const output = document.createElement("output"); this.#outputs.set(item.id, output); label.append(text, output);
      input.oninput = () => { const current = this.#item(item.id); if (current?.kind === "range") { const value = Number(input.value); output.textContent = current.formatValue?.(value) ?? String(value); this.#invoke(current.id, () => current.onChange(value)); } };
      row.append(label, input);
    }
    this.#controls.set(item.id, input); return row;
  }
  #sync(): void {
    for (const [id, control] of this.#controls) {
      const item = this.#item(id); if (!item) continue;
      // Sliders remain usable while host persistence is pending.
      control.disabled = item.disabled === true || (item.kind !== "range" && this.#pending.has(id));
      if (item.kind === "toggle") (control as HTMLInputElement).checked = item.value;
      else if (item.kind !== "action") {
        control.value = String(item.value);
        if (item.kind === "range") this.#outputs.get(id)!.textContent = item.formatValue?.(item.value) ?? String(item.value);
      }
    }
  }
  #invoke(id: string, callback: () => void | Promise<void>): void {
    const token = ++this.#generation; this.#pending.set(id, token);
    const status = this.element.querySelector<HTMLElement>("[role=status]")!; status.hidden = true;
    try {
      const result = callback();
      if (result && typeof result.then === "function") {
        // Do not reset a just-edited input before the host returns its new state.
        result.catch(() => { this.#reportError(); this.#sync(); }).finally(() => this.#finish(id, token));
      } else this.#finish(id, token);
    } catch {
      this.#pending.delete(id); this.#reportError(); this.#sync();
    }
  }
  #finish(id: string, token: number): void {
    if (this.#pending.get(id) !== token) return;
    this.#pending.delete(id);
    const control = this.#controls.get(id);
    if (control) control.disabled = this.#item(id)?.disabled === true;
  }
  #reportError(): void {
    if (this.#destroyed) return;
    const status = this.element.querySelector<HTMLElement>("[role=status]")!;
    status.textContent = "未能应用设置，请重试。"; status.hidden = false;
  }
  #position(): void {
    const rect = this.element.getBoundingClientRect();
    const width = rect.width || Math.min(300, innerWidth - 16), height = rect.height || this.element.offsetHeight;
    this.element.style.left = `${Math.max(8, Math.min(this.#x, innerWidth - width - 8))}px`;
    this.element.style.top = `${Math.max(8, Math.min(this.#y, innerHeight - height - 8))}px`;
  }
}
