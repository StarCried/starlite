import type { DialogueAction } from "./dialogue.js";

/** Stable model top in host-local CSS pixels, independent of canvas padding/DPR. */
export interface ModelBubbleAnchor { x: number; y: number }

/** Plain-text, accessible dialogue presentation shared by every renderer. */
export class DialogueBubble {
  readonly element: HTMLDivElement;
  readonly #host: HTMLElement;
  readonly #anchor: (() => ModelBubbleAnchor | undefined) | undefined;
  #until = 0;
  #timeout: ReturnType<typeof setTimeout> | undefined;
  constructor(host: HTMLElement, anchor?: () => ModelBubbleAnchor | undefined) {
    this.#host = host;
    this.#anchor = anchor;
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
    if (action.animation) this.element.dataset.modelAnimation = action.animation;
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
    delete this.element.dataset.modelAnimation;
  }
  position(): void {
    if (this.element.hidden) return;
    const host = this.#host.getBoundingClientRect(), bubble = this.element.getBoundingClientRect();
    const width = Math.max(1, document.documentElement.clientWidth || window.innerWidth);
    const candidate = this.#anchor?.();
    const anchor = candidate && Number.isFinite(candidate.x) && Number.isFinite(candidate.y) ? candidate : undefined;
    const margin = 12, centered = host.left + (anchor?.x ?? host.width / 2) - bubble.width / 2;
    const above = host.top + (anchor?.y ?? 0) >= bubble.height + margin * 2;
    this.element.dataset.modelPlacement = above ? "above" : "below";
    if (anchor) {
      const height = Math.max(1, document.documentElement.clientHeight || window.innerHeight);
      const preferredTop = above ? host.top + anchor.y - margin - bubble.height : host.top + host.height + margin;
      const top = Math.max(margin, Math.min(Math.max(margin, height - bubble.height - margin), preferredTop));
      Object.assign(this.element.style, { left: `${anchor.x}px`, top: `${top - host.top}px`, bottom: "auto" });
    } else {
      for (const property of ["left", "top", "bottom"]) this.element.style.removeProperty(property);
    }
    const left = Math.max(margin, Math.min(Math.max(margin, width - bubble.width - margin), centered));
    this.element.style.setProperty("--model-bubble-shift-x", `${Math.round(left - centered)}px`);
  }
  destroy(): void { this.hide(); this.element.remove(); }
}
