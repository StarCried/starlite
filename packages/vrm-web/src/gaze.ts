import { Vector2, Vector3, type PerspectiveCamera } from "three";
import type { VRMLookAt } from "@pixiv/three-vrm";
import type { VrmWidgetConfig } from "./types.js";

/** Pointer projection and angle limits are independent of avatar scale and VRM version. */
export class PointerGaze {
  readonly #pointer = new Vector2();
  readonly #head = new Vector3();
  readonly #target = new Vector3();
  readonly #scratch = new Vector3();
  #tracking = false;
  #yaw = 0;
  #pitch = 0;
  constructor(readonly limits: NonNullable<VrmWidgetConfig["gaze"]> = {}) {}
  move(x: number, y: number, rect: { left: number; top: number; width: number; height: number }): void {
    if (!Number.isFinite(x + y) || rect.width <= 0 || rect.height <= 0) return;
    this.#pointer.set((x - rect.left) / rect.width * 2 - 1, 1 - (y - rect.top) / rect.height * 2);
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
    // A plane through the eyes perpendicular to the camera maps cursor pixels to
    // a stable world-space target. The gaze angle is bounded after VRM0/1 conversion.
    const depth = this.#scratch.copy(this.#head).project(camera).z;
    this.#target.copy(camera.position);
    if (this.#tracking) {
      this.#target.set(this.#pointer.x, this.#pointer.y, depth).unproject(camera);
      this.#target.add(this.#scratch.copy(camera.position).sub(this.#head));
    }
    lookAt.lookAt(this.#target);
    const yawLimit = this.limits.maxYawDegrees ?? 25, pitchLimit = this.limits.maxPitchDegrees ?? 15;
    const yaw = Math.max(-yawLimit, Math.min(yawLimit, lookAt.yaw));
    const pitch = Math.max(-pitchLimit, Math.min(pitchLimit, lookAt.pitch));
    const blend = 1 - Math.exp(-Math.max(0, delta) / ((this.limits.smoothingMs ?? 100) / 1000));
    this.#yaw += (yaw - this.#yaw) * blend; this.#pitch += (pitch - this.#pitch) * blend;
    lookAt.yaw = Math.max(-yawLimit, Math.min(yawLimit, this.#yaw));
    lookAt.pitch = Math.max(-pitchLimit, Math.min(pitchLimit, this.#pitch));
  }
}
