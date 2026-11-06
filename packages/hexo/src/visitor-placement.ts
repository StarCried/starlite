/** Hexo owns viewport placement; the renderer only owns portrait dimensions.
 * Serialized into the bootstrap, so keep this function dependency-free. */
export function createVisitorPlacement(options: {
  host: HTMLElement;
  controller: { setDisplaySize(width: number, height: number): void; setHostPosition?(x: number, y: number, options?: { resetMotion?: boolean }): void; refreshInteractionMask?(): void; status?: string };
  width: number; height: number; scale: number;
  position?: { right: number; bottom: number; zIndex: number };
  saved?: { x: number; y: number };
}) {
  const margin = 12, toolbarWidth = 152, toolbarHeight = 42, gap = 8;
  const { host, controller, width, height } = options;
  const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(Math.max(low, high), value));
  let viewportWidth = 1, viewportHeight = 1, factor = 1;
  let desiredScale = options.scale, scale = options.scale, x = 0, y = 0;
  let saved = options.saved;
  let lastWidth = 0, lastHeight = 0;
  const maximum = () => Math.max(.01, Math.min(1.5,
    2 * Math.min(x - margin, viewportWidth - margin - x) / (width * factor),
    (y - margin) / (height * factor)));
  const dimensions = () => ({ width: Math.max(1, width * factor * scale), height: Math.max(1, height * factor * scale) });
  const apply = (moving = false) => {
    const { width: displayWidth, height: displayHeight } = dimensions();
    // The toolbar's centre/top are independent of portrait size and animation.
    const left = x - displayWidth / 2, top = y - displayHeight;
    if (displayWidth !== lastWidth || displayHeight !== lastHeight) {
      controller.setDisplaySize(displayWidth, displayHeight);
      lastWidth = displayWidth; lastHeight = displayHeight;
    }
    Object.assign(host.style, { position: "fixed", left: `${left}px`, top: `${top}px`, right: "auto", bottom: "auto" });
    controller.setHostPosition?.(left, top, { resetMotion: !moving });
    if (controller.status === "paused") controller.refreshInteractionMask?.();
  };
  const reflow = () => {
    viewportWidth = Math.max(1, globalThis.innerWidth);
    viewportHeight = Math.max(1, globalThis.innerHeight);
    // 100% is the authored size on roomy screens, reduced on short/narrow ones.
    factor = Math.min(1, viewportWidth * .30 / width, viewportHeight * .55 / height,
      Math.max(1, viewportHeight - 2 * margin - gap - toolbarHeight) / height);
    const halfMinimum = Math.max(toolbarWidth / 2, width * factor * .5 / 2);
    x = clamp(saved ? saved.x * viewportWidth : viewportWidth - (options.position?.right ?? 16) - width * factor / 2,
      margin + halfMinimum, viewportWidth - margin - halfMinimum);
    y = clamp(saved ? saved.y * viewportHeight : viewportHeight - (options.position?.bottom ?? 0),
      margin + Math.max(1, height * factor * .5), viewportHeight - margin - gap - toolbarHeight);
    scale = Math.min(desiredScale, maximum());
    apply();
  };
  reflow();
  return {
    get scale() { return scale; },
    get minScale() { return Math.min(.5, maximum()); },
    get maxScale() { return maximum(); },
    get anchor() { return { x, y }; },
    get toolbar() { return { x, y: y + gap }; },
    get portrait() { const size = dimensions(); return { left: x - size.width / 2, top: y - size.height, ...size }; },
    setScale(value: number) {
      if (!Number.isFinite(value) || value < .5 || value > 1.5) throw new Error("invalid visitor scale");
      const previous = scale;
      scale = Math.min(value, maximum());
      try { apply(); } catch (error) { scale = previous; throw error; }
      desiredScale = scale;
      return scale;
    },
    beginDrag() {
      const size = dimensions();
      controller.setHostPosition?.(x - size.width / 2, y - size.height, { resetMotion: true });
    },
    moveTo(nextX: number, nextY: number) {
      if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) return;
      const halfWidth = Math.max(toolbarWidth / 2, width * factor * scale / 2);
      x = clamp(nextX, margin + halfWidth, viewportWidth - margin - halfWidth);
      y = clamp(nextY, margin + Math.max(1, height * factor * scale), viewportHeight - margin - gap - toolbarHeight);
      saved = { x: x / viewportWidth, y: y / viewportHeight };
      apply(true);
    },
    snapshot() { return saved ? { ...saved } : undefined; },
    reset() { saved = undefined; reflow(); },
    reflow,
  };
}
