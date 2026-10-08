import type { DialogueAction } from "./dialogue.js";

/** Plain-text, accessible dialogue presentation shared by every renderer. */
export class DialogueBubble {
  readonly element: HTMLDivElement;
  readonly #host: HTMLElement;
  #until = 0;
  #timeout: ReturnType<typeof setTimeout> | undefined;
  constructor(host: HTMLElement) {
    this.#host = host;
    this.element = document.createElement("div");
    this.element.className = "model-widget__bubble";
    this.element.hidden = true;
    this.element.setAttribute("role", "status");
    this.element.setAttribute("aria-live", "polite");
    this.element.setAttribute("aria-atomic", "true");
  }
  show(action: DialogueAction, timestamp: number, withoutFrames = false): void {
    this.hide();
    const content = document.createElement("span");
    content.className = "model-widget__bubble-text";
    content.textContent = action.line;
    this.element.replaceChildren(content);
    this.element.dataset.modelScene = action.scene;
    this.element.hidden = false;
    this.#until = timestamp + action.durationMs;
    this.position();
    if (withoutFrames) this.#timeout = setTimeout(() => this.hide(), action.durationMs);
  }
  update(timestamp: number): void {
    if (!this.element.hidden && timestamp >= this.#until) this.hide();
  }
  hide(): void {
    if (this.#timeout !== undefined) clearTimeout(this.#timeout);
    this.#timeout = undefined; this.#until = 0;
    this.element.hidden = true; this.element.textContent = "";
    delete this.element.dataset.modelScene;
  }
  position(): void {
    if (this.element.hidden) return;
    const host = this.#host.getBoundingClientRect(), bubble = this.element.getBoundingClientRect();
    const width = Math.max(1, document.documentElement.clientWidth || window.innerWidth);
    const margin = 12, centered = host.left + host.width / 2 - bubble.width / 2;
    this.element.dataset.modelPlacement = host.top >= bubble.height + margin * 2 ? "above" : "below";
    const left = Math.max(margin, Math.min(Math.max(margin, width - bubble.width - margin), centered));
    this.element.style.setProperty("--model-bubble-shift-x", `${Math.round(left - centered)}px`);
  }
  destroy(): void { this.hide(); this.element.remove(); }
}
