/** Serialized into the Hexo bootstrap; keep all runtime dependencies inside. */
export function observeVisitorDrag(options: {
  hit(event: MouseEvent): boolean;
  enabled(): boolean;
  start(): void;
  /** Displacement in CSS pixels from the original pointerdown. */
  move(dx: number, dy: number): void;
  end(cancelled: boolean): void;
  hover?(event: PointerEvent): void;
}, isDrag: (dx: number, dy: number) => boolean): { destroy(): void; cancel(): void } {
  type Gesture = {
    id: number; x: number; y: number; lastX: number; lastY: number; active: boolean;
    selection: Range[];
  };
  let gesture: Gesture | undefined;
  let completed: { id: number; x: number; y: number; until: number } | undefined;
  let restoreStyle: (() => void) | undefined;
  let destroyed = false;
  const excluded = "input,textarea,select,button,[contenteditable]:not([contenteditable='false']),[data-starlite-quick-settings],[data-starlite-widget-restore],[data-starlite-visitor-toolbar]";
  const modified = (event: MouseEvent) => event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
  const excludedTarget = (event: Event) => event.composedPath().some(target =>
    (target as Element)?.nodeType === 1 && Boolean((target as Element).closest(excluded)));
  const restoreSelection = (current: Gesture) => {
    const selection = document.getSelection();
    if (!selection) return;
    // Pending native mouse selection may already have changed before the drag
    // threshold. Retain the original selection instead of erasing user text.
    if (current.selection.length) {
      selection.removeAllRanges();
      for (const range of current.selection) {
        if (range.commonAncestorContainer.isConnected) selection.addRange(range);
      }
    } else if (!selection.isCollapsed) selection.removeAllRanges();
  };
  const finish = (cancelled: boolean) => {
    const current = gesture;
    gesture = undefined;
    restoreStyle?.(); restoreStyle = undefined;
    if (current?.active) {
      restoreSelection(current);
      options.end(cancelled);
    }
  };
  const cancel = () => { completed = undefined; finish(true); };
  const advance = (event: MouseEvent) => {
    const current = gesture;
    if (!current) return;
    current.lastX = event.clientX; current.lastY = event.clientY;
    const dx = event.clientX - current.x, dy = event.clientY - current.y;
    if (!current.active && isDrag(dx, dy)) {
      current.active = true;
      const style = document.documentElement.style;
      const properties = ["user-select", "-webkit-user-select"];
      const previous = properties.map(property => ({ property, value: style.getPropertyValue(property), priority: style.getPropertyPriority(property) }));
      restoreStyle = () => {
        for (const { property, value, priority } of previous) {
          if (value) style.setProperty(property, value, priority);
          else style.removeProperty(property);
        }
      };
      for (const property of properties) style.setProperty(property, "none", "important");
      restoreSelection(current);
      options.start();
    }
    if (current.active && gesture === current) {
      event.preventDefault();
      options.move(dx, dy);
    }
  };
  const listeners: [string, EventListener][] = [
    ["pointerdown", event => {
      cancel();
      const pointer = event as PointerEvent;
      if (!options.enabled() || pointer.pointerType !== "mouse" || !pointer.isPrimary
        || pointer.button !== 0 || modified(pointer) || excludedTarget(pointer) || !options.hit(pointer)) return;
      const selection = document.getSelection();
      const ranges: Range[] = [];
      if (selection && !selection.isCollapsed) {
        for (let index = 0; index < selection.rangeCount; index++) ranges.push(selection.getRangeAt(index).cloneRange());
      }
      gesture = { id: pointer.pointerId, x: pointer.clientX, y: pointer.clientY,
        lastX: pointer.clientX, lastY: pointer.clientY, active: false, selection: ranges };
    }],
    ["pointermove", event => {
      const pointer = event as PointerEvent;
      if (gesture?.id === pointer.pointerId) {
        if (!options.enabled() || !(pointer.buttons & 1) || modified(pointer)) cancel();
        else advance(pointer);
      }
      if (!gesture?.active) options.hover?.(pointer);
    }],
    ["pointerup", event => {
      const pointer = event as PointerEvent;
      if (gesture?.id !== pointer.pointerId) return;
      if (pointer.button !== 0 || modified(pointer) || !options.enabled()) { cancel(); return; }
      advance(pointer);
      if (gesture?.active) {
        completed = { id: gesture.id, x: pointer.clientX, y: pointer.clientY, until: Date.now() + 500 };
      }
      finish(false);
      options.hover?.(pointer);
    }],
    ["pointercancel", event => { if (gesture?.id === (event as PointerEvent).pointerId) cancel(); }],
    ["blur", event => { if (event.target === event.currentTarget) cancel(); }],
    ["keydown", event => { if ((event as KeyboardEvent).key === "Escape") cancel(); }],
    ["dragstart", event => {
      if (!gesture) return;
      if (!options.enabled()) { cancel(); return; }
      // A page link or image still receives the original pointerdown. Prevent
      // its native drag before the browser can cancel our pointer sequence.
      event.preventDefault();
      event.stopImmediatePropagation();
      const drag = event as MouseEvent;
      if (Math.hypot(drag.clientX - gesture.x, drag.clientY - gesture.y)
        > Math.hypot(gesture.lastX - gesture.x, gesture.lastY - gesture.y)) advance(drag);
    }],
    ["selectstart", event => { if (gesture?.active) event.preventDefault(); }],
    ["click", event => {
      const click = event as PointerEvent;
      if (!completed) return;
      if (Date.now() > completed.until) { completed = undefined; return; }
      // Keyboard activation and element.click()/dispatchEvent() remain native.
      if (!click.isTrusted || click.detail <= 0 || click.button !== 0 || modified(click)) return;
      if (("pointerId" in click && click.pointerId !== completed.id)
        || ("pointerType" in click && click.pointerType !== "mouse")
        || isDrag(click.clientX - completed.x, click.clientY - completed.y)) return;
      completed = undefined;
      click.preventDefault();
      click.stopImmediatePropagation();
    }],
  ];
  for (const [type, listener] of listeners) globalThis.addEventListener(type, listener, { capture: true, passive: false });
  return {
    cancel,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancel();
      for (const [type, listener] of listeners) globalThis.removeEventListener(type, listener, true);
    },
  };
}
