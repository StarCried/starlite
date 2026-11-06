/** Both hosts keep short native clicks until movement exceeds six CSS pixels. */
export function isModelDrag(dx: number, dy: number): boolean {
  return Number.isFinite(dx) && Number.isFinite(dy) && Math.hypot(dx, dy) > 6;
}
