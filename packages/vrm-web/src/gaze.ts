import { Vector2, Vector3, MathUtils, type PerspectiveCamera } from "three";
import type { VRMLookAt } from "@pixiv/three-vrm";
import type { VrmWidgetConfig } from "./types.js";

/** Pointer projection and angle limits are independent of avatar scale and VRM version. */
export class PointerGaze {
  readonly #pointer = new Vector2();
  readonly #head = new Vector3();
  readonly #target = new Vector3();
  readonly #scratch = new Vector3();
  #rect = { left: 0, top: 0, width: 1, height: 1 };
  #viewport = { width: 1, height: 1 };
  #tracking = false;
  #yaw = 0;
  #pitch = 0;
  constructor(readonly limits: NonNullable<VrmWidgetConfig["gaze"]> = {}) {}
  move(x: number, y: number, rect: { left: number; top: number; width: number; height: number }, viewport = { width: rect.left + rect.width, height: rect.top + rect.height }): void {
    if (![x, y, rect.left, rect.top, rect.width, rect.height, viewport.width, viewport.height].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0 || viewport.width <= 0 || viewport.height <= 0) return;
    this.#pointer.set(x, y); this.#rect = rect; this.#viewport = viewport;
    this.#tracking = true;
  }
  reset(): void { this.#tracking = false; }
  update(lookAt: VRMLookAt, camera: PerspectiveCamera, delta: number, authored: boolean): void {
    lookAt.autoUpdate = false;
    if (authored) {
      this.#yaw = lookAt.yaw; this.#pitch = lookAt.pitch;
      return;
    }
    lookAt.humanoid.getRawBoneNode("head")?.updateWorldMatrix(true, false);
    lookAt.getLookAtWorldPosition(this.#head);
    const yawLimit = this.limits.maxYawDegrees ?? 25, pitchLimit = this.limits.maxPitchDegrees ?? 15;
    this.#target.copy(camera.position);
    if (this.#tracking) {
      const projected = this.#scratch.copy(this.#head).project(camera);
      const eyeX = this.#rect.left + (projected.x + 1) * this.#rect.width / 2;
      const eyeY = this.#rect.top + (1 - projected.y) * this.#rect.height / 2;
      const dx = this.#pointer.x - eyeX, dy = eyeY - this.#pointer.y;
      // Use the available page space on each side of the eyes. Normalizing only
      // by a small corner canvas pins almost the entire page to the same limit.
      const x = MathUtils.clamp(dx / Math.max(this.#rect.width / 2, dx < 0 ? eyeX : this.#viewport.width - eyeX), -1, 1);
      const y = MathUtils.clamp(dy / Math.max(this.#rect.height / 2, dy > 0 ? eyeY : this.#viewport.height - eyeY), -1, 1);
      const distance = camera.position.distanceTo(this.#head);
      this.#target.addScaledVector(this.#scratch.setFromMatrixColumn(camera.matrixWorld, 0), distance * Math.tan(MathUtils.degToRad(x * yawLimit)));
      this.#target.addScaledVector(this.#scratch.setFromMatrixColumn(camera.matrixWorld, 1), distance / Math.cos(MathUtils.degToRad(x * yawLimit)) * Math.tan(MathUtils.degToRad(y * pitchLimit)));
    }
    lookAt.lookAt(this.#target);
    const yaw = Math.max(-yawLimit, Math.min(yawLimit, lookAt.yaw));
    const pitch = Math.max(-pitchLimit, Math.min(pitchLimit, lookAt.pitch));
    const blend = 1 - Math.exp(-Math.max(0, delta) / ((this.limits.smoothingMs ?? 100) / 1000));
    this.#yaw += (yaw - this.#yaw) * blend; this.#pitch += (pitch - this.#pitch) * blend;
    lookAt.yaw = Math.max(-yawLimit, Math.min(yawLimit, this.#yaw));
    lookAt.pitch = Math.max(-pitchLimit, Math.min(pitchLimit, this.#pitch));
  }
}
