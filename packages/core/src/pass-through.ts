/** Observe the same native click that reaches the page beneath an inert canvas.
 * Callers opt the host/canvas out of hit testing with pointer-events: none. */
export function observePassThroughClicks(surface: HTMLElement, onClick: () => void): () => void {
  type Gesture = { id: number; x: number; y: number; moved: boolean };
  let down: Gesture | undefined;
  let ready: Gesture | undefined;
  const inside = (event: MouseEvent): boolean => {
    const rect = surface.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0
      && event.clientX >= rect.left && event.clientX < rect.right
      && event.clientY >= rect.top && event.clientY < rect.bottom;
  };
  const clear = (): void => { down = undefined; ready = undefined; };
  const move = (event: PointerEvent): void => {
    if (down?.id === event.pointerId && Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5) down.moved = true;
  };
  const listeners: [string, EventListener][] = [
    ["pointerdown", event => {
      clear();
      const pointer = event as PointerEvent;
      if (pointer.button === 0 && pointer.isPrimary !== false && inside(pointer)) {
        down = { id: pointer.pointerId, x: pointer.clientX, y: pointer.clientY, moved: false };
      }
    }],
    ["pointermove", event => move(event as PointerEvent)],
    ["pointerup", event => {
      const pointer = event as PointerEvent;
      if (down?.id !== pointer.pointerId) return;
      move(pointer);
      ready = pointer.button === 0 && !down.moved && inside(pointer) ? down : undefined;
      down = undefined;
    }],
    ["pointercancel", clear],
    ["scroll", clear],
    // Capture also sees a page element lose focus during a normal mouse click.
    // Only leaving this window cancels the in-progress pointer gesture.
    ["blur", event => { if (event.target === event.currentTarget) clear(); }],
    ["click", event => {
      const click = event as MouseEvent;
      const gesture = ready;
      clear();
      // Keyboard/programmatic clicks have no matching completed pointer gesture.
      // Modifier keys intentionally remain available to the page's native click.
      if (gesture && click.button === 0 && click.detail > 0 && inside(click)
        && Math.hypot(click.clientX - gesture.x, click.clientY - gesture.y) <= 5) onClick();
    }],
  ];
  for (const [type, listener] of listeners) window.addEventListener(type, listener, { capture: true, passive: true });
  return () => {
    clear();
    for (const [type, listener] of listeners) window.removeEventListener(type, listener, true);
  };
}
