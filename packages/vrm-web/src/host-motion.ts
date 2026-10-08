import { MathUtils, Object3D, Vector3, type PerspectiveCamera } from "three";
import type { VRMSpringBoneJoint, VRMSpringBoneManager } from "@pixiv/three-vrm";

/** Window movement exists outside the canvas. Feed an equivalent bounded world
 * translation to the actual VRM solver, then remove it before drawing. */
export class HostMotion {
  #last: [number, number] | undefined;
  readonly #pending = new Vector3();
  readonly #offset = new Vector3();
  readonly #position = new Vector3();
  readonly #movement = new Vector3();
  readonly #up = new Vector3();
  readonly #centers = new Map<Object3D, Object3D>();
  readonly #originals = new Map<VRMSpringBoneJoint, Object3D>();
  constructor(readonly root: Object3D, readonly manager?: VRMSpringBoneManager) {
    root.updateMatrixWorld(true);
    for (const joint of [...(manager?.joints ?? [])]) {
      if (!joint.center) continue;
      const original = joint.center;
      let proxy = this.#centers.get(original);
      if (!proxy) {
        proxy = new Object3D(); proxy.matrixAutoUpdate = false;
        proxy.matrix.copy(original.matrixWorld); proxy.updateMatrixWorld(true);
        this.#centers.set(original, proxy);
      }
      this.#originals.set(joint, original);
      // Public remove/add invalidates the manager's dependency ordering.
      manager!.deleteJoint(joint); joint.center = proxy; manager!.addJoint(joint);
    }
    if (this.#originals.size) manager?.reset();
  }
  setPosition(x: number, y: number): void {
    if (![x, y].every(Number.isFinite) || Math.max(Math.abs(x), Math.abs(y)) > 65536) throw new Error("invalid host position");
    if (this.#last) {
      this.#pending.x += x - this.#last[0]; this.#pending.y += y - this.#last[1];
    }
    this.#last = [x, y];
  }
  suspend(): void { this.#last = undefined; this.#pending.set(0, 0, 0); }
  update(delta: number, camera: PerspectiveCamera, height: number): void {
    if (!this.manager || delta <= 0) { this.manager?.update(delta); return; }
    const depth = Math.max(.1, camera.position.distanceTo(this.root.position));
    const metresPerPixel = 2 * depth * Math.tan(MathUtils.degToRad(camera.fov / 2)) / Math.max(1, height);
    this.#movement.setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(this.#pending.x * metresPerPixel * .35);
    this.#up.setFromMatrixColumn(camera.matrixWorld, 1).multiplyScalar(-this.#pending.y * metresPerPixel * .35);
    this.#movement.add(this.#up).clampLength(0, .08);
    this.#pending.set(0, 0, 0); this.#offset.add(this.#movement);
    this.#position.copy(this.root.position); this.root.position.add(this.#offset); this.root.updateMatrixWorld(true);
    for (const [original, proxy] of this.#centers) {
      proxy.matrix.copy(original.matrixWorld);
      proxy.matrix.elements[12]! -= this.#offset.x; proxy.matrix.elements[13]! -= this.#offset.y; proxy.matrix.elements[14]! -= this.#offset.z;
      proxy.updateMatrixWorld(true);
    }
    try { this.manager.update(delta); }
    finally { this.root.position.copy(this.#position); this.root.updateMatrixWorld(true); }
  }
  destroy(): void {
    for (const [joint, original] of this.#originals) {
      this.manager?.deleteJoint(joint); joint.center = original; this.manager?.addJoint(joint);
    }
    this.#originals.clear(); this.#centers.clear(); this.suspend();
  }
}
