import { Box3, MathUtils, Mesh, PerspectiveCamera, Vector3, type Object3D, type SkinnedMesh } from "three";
import type { ModelViewport, VrmWidgetConfig } from "./types.js";
import type { ModelBubbleAnchor } from "@starcried/starlite-core";

/** Use the cached neutral silhouette, including ears, never the animated bounds.
 * The base camera excludes the extra transparent canvas needed for gestures. */
export function projectBubbleAnchor(bounds: Box3, camera: PerspectiveCamera, width: number, height: number): ModelBubbleAnchor | undefined {
  if (bounds.isEmpty() || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return undefined;
  const point = new Vector3();
  let top = Infinity;
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    point.set(x, y, z).project(camera);
    if (![point.x, point.y, point.z].every(Number.isFinite)) return undefined;
    top = Math.min(top, (1 - point.y) * height / 2);
  }
  bounds.getCenter(point).project(camera);
  const x = (point.x + 1) * width / 2;
  return Number.isFinite(x) && Number.isFinite(top) ? { x, y: top } : undefined;
}


/** Refine the stable anchor once from the rendered neutral silhouette. Transparent
 * expression/prop quads can extend far above the visible character. Reproject a
 * fixed point at the model center's depth after resize; never read animated frames. */
export function sampleBubbleAnchor(canvas: HTMLCanvasElement, viewport: ModelViewport, camera: PerspectiveCamera, bounds: Box3): Vector3 | undefined {
  if (!canvas.width || !canvas.height || bounds.isEmpty()) return undefined;
  const scale = Math.min(1, 512 / canvas.width, 512 / canvas.height);
  const width = Math.max(1, Math.ceil(canvas.width * scale)), height = Math.max(1, Math.ceil(canvas.height * scale));
  const surface = document.createElement("canvas"); surface.width = width; surface.height = height;
  try {
    const context = surface.getContext("2d", { willReadFrequently: true });
    if (!context) return undefined;
    context.drawImage(canvas, 0, 0, width, height);
    const rgba = context.getImageData(0, 0, width, height).data;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (rgba[(y * width + x) * 4 + 3]! < 16) continue;
      const top = viewport.top + y / height * viewport.height;
      const point = bounds.getCenter(new Vector3()).project(camera);
      point.y = 1 - top / viewport.baseHeight * 2;
      point.unproject(camera);
      return point.toArray().every(Number.isFinite) ? point : undefined;
    }
  } catch { /* Keep the geometry anchor when canvas sampling is unavailable. */ }
  return undefined;
}

/** Measure the visible, posed mesh once. Hidden accessories and stale skin bounds
 * must not widen the portrait, and a later resize must not chase a moving hand. */
export function visibleModelBounds(root: Object3D): Box3 {
  root.updateMatrixWorld(true);
  const bounds = new Box3(), point = new Vector3();
  root.traverseVisible(object => {
    if (!(object instanceof Mesh)) return;
    const mesh = object as SkinnedMesh;
    mesh.skeleton?.update();
    const positions = mesh.geometry.getAttribute("position");
    if (!positions) return;
    for (let i = 0; i < positions.count; i++) bounds.expandByPoint(mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld));
  });
  const size = bounds.getSize(new Vector3()), center = bounds.getCenter(new Vector3());
  if (![...size, ...center].every(Number.isFinite) || size.length() === 0) throw new Error("invalid model bounds");
  return bounds;
}

export function framePortrait(camera: PerspectiveCamera, bounds: Box3, aspect: number, render: VrmWidgetConfig["render"], options: VrmWidgetConfig["camera"], anchor?: Vector3): Vector3 {
  const size = bounds.getSize(new Vector3()), target = bounds.getCenter(new Vector3());
  target.y = bounds.min.y + size.y * (options?.targetHeight ?? .5);
  if (anchor) target.copy(anchor);
  camera.fov = options?.fovDegrees ?? 30; camera.aspect = aspect;
  const yaw = MathUtils.degToRad(options?.yawDegrees ?? 0), pitch = MathUtils.degToRad(options?.pitchDegrees ?? 0);
  const normal = new Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  const right = new Vector3().crossVectors(camera.up, normal).normalize(), up = new Vector3().crossVectors(normal, right).normalize();
  const tan = Math.tan(MathUtils.degToRad(camera.fov / 2)) * (render?.fitPadding ?? .9);
  let distance = 0;
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    const offset = new Vector3(x, y, z).sub(target);
    distance = Math.max(distance, offset.dot(normal) + Math.max(Math.abs(offset.dot(right)) / (tan * aspect), Math.abs(offset.dot(up)) / tan));
  }
  camera.position.copy(target).addScaledVector(normal, distance / (render?.initialScale ?? 1));
  camera.lookAt(target); camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
  return target;
}

/** Expand the transparent surface around a fixed logical portrait. Padding is
 * quantized and retained until destroy, so an Idle return never rescales or
 * moves the character and small spring movements do not resize every frame. */
export class ExpandedViewport {
  #width = 0;
  #height = 0;
  #left = 0;
  #top = 0;
  #right = 0;
  #bottom = 0;
  readonly #point = new Vector3();
  readonly #fixed: boolean;
  constructor(padding?: NonNullable<VrmWidgetConfig["render"]>["viewportPadding"]) {
    this.#fixed = padding !== undefined;
    if (padding) { this.#left = padding.left; this.#top = padding.top; this.#right = padding.right; this.#bottom = padding.bottom; }
  }
  get rect(): ModelViewport {
    return { left: 0 - this.#left, top: 0 - this.#top, width: this.#width + this.#left + this.#right,
      height: this.#height + this.#top + this.#bottom, baseWidth: this.#width, baseHeight: this.#height };
  }
  resize(width: number, height: number): boolean {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error("invalid portrait viewport");
    if (width === this.#width && height === this.#height) return false;
    this.#width = width; this.#height = height; return true;
  }
  expand(camera: PerspectiveCamera, bounds: Box3): boolean {
    if (this.#fixed || bounds.isEmpty()) return false;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
      const p = this.#point.set(x, y, z).project(camera);
      const px = (p.x + 1) * this.#width / 2, py = (1 - p.y) * this.#height / 2;
      if (![px, py].every(Number.isFinite)) throw new Error("non-finite portrait projection");
      minX = Math.min(minX, px); minY = Math.min(minY, py);
      maxX = Math.max(maxX, px); maxY = Math.max(maxY, py);
    }
    const grow = (current: number, required: number) => Math.max(current, Math.ceil(required / 32) * 32);
    const left = grow(this.#left, 8 - minX), top = grow(this.#top, 8 - minY);
    const right = grow(this.#right, maxX + 8 - this.#width), bottom = grow(this.#bottom, maxY + 8 - this.#height);
    if (left === this.#left && top === this.#top && right === this.#right && bottom === this.#bottom) return false;
    this.#left = left; this.#top = top; this.#right = right; this.#bottom = bottom;
    return true;
  }
  apply(camera: PerspectiveCamera): void {
    const rect = this.rect;
    camera.setViewOffset(this.#width, this.#height, rect.left, rect.top, rect.width, rect.height);
  }
}
