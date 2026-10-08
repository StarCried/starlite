import { Box3, MathUtils, Mesh, PerspectiveCamera, Vector3, type Object3D, type SkinnedMesh } from "three";
import type { VrmWidgetConfig } from "./types.js";

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

/** Keep the portrait target fixed, widening only as a pose requires. Returning
 * to the base distance is eased; expanding is immediate to avoid clipped limbs. */
export class MotionFraming {
  readonly #anchor = new Vector3();
  #baseDistance = 0;
  reset(camera: PerspectiveCamera, target: Vector3): void {
    this.#anchor.copy(target); this.#baseDistance = camera.position.distanceTo(target);
  }
  update(camera: PerspectiveCamera, bounds: Box3 | undefined, delta: number, render: VrmWidgetConfig["render"], options: VrmWidgetConfig["camera"]): void {
    const previous = camera.position.distanceTo(this.#anchor);
    let required = this.#baseDistance;
    if (bounds && !bounds.isEmpty()) {
      framePortrait(camera, bounds, camera.aspect, { ...render, initialScale: 1 }, options, this.#anchor);
      required = Math.max(required, camera.position.distanceTo(this.#anchor));
    }
    const distance = Math.max(required, previous + (required - previous) * (1 - Math.exp(-Math.max(0, delta) / .2)));
    camera.position.sub(this.#anchor).normalize().multiplyScalar(distance).add(this.#anchor);
    camera.updateMatrixWorld(true);
  }
}
