import { Vector2, Vector3, Quaternion, MathUtils, type Object3D, type PerspectiveCamera } from "three";
import type { VRMLookAt } from "@pixiv/three-vrm";
import type { ModelAdjustments, VrmWidgetConfig } from "./types.js";

/** Pointer projection and angle limits are independent of avatar scale and VRM version. */
export class PointerGaze {
  readonly #pointer = new Vector2();
  readonly #head = new Vector3();
  readonly #target = new Vector3();
  readonly #scratch = new Vector3();
  readonly #headBase = new Quaternion();
  readonly #parent = new Quaternion();
  readonly #rotation = new Quaternion();
  readonly #pitchRotation = new Quaternion();
  #posedHead: Object3D | undefined;
  #headYaw = 0;
  #headPitch = 0;
  #rect = { left: 0, top: 0, width: 1, height: 1 };
  #viewport = { width: 1, height: 1 };
  #tracking = false;
  #yaw = 0;
  #pitch = 0;
  #adjustments: NonNullable<ModelAdjustments["gaze"]> = {};
  constructor(readonly limits: NonNullable<VrmWidgetConfig["gaze"]> = {}) {}
  setAdjustments(adjustments: ModelAdjustments["gaze"] = {}): void { this.#adjustments = { ...adjustments }; }
  move(x: number, y: number, rect: { left: number; top: number; width: number; height: number }, viewport = { width: rect.left + rect.width, height: rect.top + rect.height }): void {
    if (![x, y, rect.left, rect.top, rect.width, rect.height, viewport.width, viewport.height].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0 || viewport.width <= 0 || viewport.height <= 0) return;
    this.#pointer.set(x, y); this.#rect = rect; this.#viewport = viewport;
    this.#tracking = true;
  }
  reset(): void { this.#tracking = false; }
  /** Remove the last additive correction before the animation mixer samples. */
  restoreHead(): void {
    if (this.#posedHead) this.#posedHead.quaternion.copy(this.#headBase);
    this.#posedHead = undefined;
  }
  get headAngles(): { yawDegrees: number; pitchDegrees: number } {
    return { yawDegrees: this.#headYaw, pitchDegrees: this.#headPitch };
  }
  #offset(camera: PerspectiveCamera, position: Vector3): Vector2 {
    if (!this.#tracking) return new Vector2();
    const projected = this.#scratch.copy(position).project(camera);
    const eyeX = this.#rect.left + (projected.x + 1) * this.#rect.width / 2;
    const eyeY = this.#rect.top + (1 - projected.y) * this.#rect.height / 2;
    const dx = this.#pointer.x - eyeX, dy = eyeY - this.#pointer.y;
    return new Vector2(
      MathUtils.clamp(dx / Math.max(this.#rect.width / 2, dx < 0 ? eyeX : this.#viewport.width - eyeX), -1, 1),
      MathUtils.clamp(dy / Math.max(this.#rect.height / 2, dy > 0 ? eyeY : this.#viewport.height - eyeY), -1, 1),
    );
  }
  /** Normalized humanoid correction precedes the single humanoid update. */
  updateHead(head: Object3D | null, camera: PerspectiveCamera, delta: number, authored: boolean): void {
    this.restoreHead();
    if (!head || authored || this.#adjustments.headStrength === 0) { this.#headYaw = 0; this.#headPitch = 0; return; }
    head.getWorldPosition(this.#head);
    const offset = this.#offset(camera, this.#head);
    const blend = 1 - Math.exp(-Math.max(0, delta) / ((this.#adjustments.smoothingMs ?? this.limits.smoothingMs ?? 100) / 1000));
    const yawLimit = this.limits.maxYawDegrees ?? 25, pitchLimit = this.limits.maxPitchDegrees ?? 15, strength = this.#adjustments.headStrength ?? 1;
    this.#headYaw += (MathUtils.clamp(offset.x * yawLimit * .6 * strength, -yawLimit, yawLimit) - this.#headYaw) * blend;
    this.#headPitch += (MathUtils.clamp(offset.y * pitchLimit * .6 * strength, -pitchLimit, pitchLimit) - this.#headPitch) * blend;
    this.#headBase.copy(head.quaternion); this.#posedHead = head;
    this.#rotation.setFromAxisAngle(this.#scratch.setFromMatrixColumn(camera.matrixWorld, 1), MathUtils.degToRad(this.#headYaw));
    this.#pitchRotation.setFromAxisAngle(this.#scratch.setFromMatrixColumn(camera.matrixWorld, 0), -MathUtils.degToRad(this.#headPitch));
    this.#rotation.multiply(this.#pitchRotation);
    if (head.parent) head.parent.getWorldQuaternion(this.#parent); else this.#parent.identity();
    this.#rotation.premultiply(this.#parent.clone().invert()).multiply(this.#parent);
    head.quaternion.premultiply(this.#rotation);
  }
  update(lookAt: VRMLookAt, camera: PerspectiveCamera, delta: number, authored: boolean): void {
    lookAt.autoUpdate = false;
    if (authored) {
      this.#yaw = lookAt.yaw; this.#pitch = lookAt.pitch;
      return;
    }
    if (this.#adjustments.eyeStrength === 0) {
      this.#yaw = 0; this.#pitch = 0; lookAt.yaw = 0; lookAt.pitch = 0; return;
    }
    lookAt.humanoid.getRawBoneNode("head")?.updateWorldMatrix(true, false);
    lookAt.getLookAtWorldPosition(this.#head);
    const yawLimit = this.limits.maxYawDegrees ?? 25, pitchLimit = this.limits.maxPitchDegrees ?? 15;
    this.#target.copy(camera.position);
    if (this.#tracking) {
      const offset = this.#offset(camera, this.#head), strength = this.#adjustments.eyeStrength ?? 1;
      const x = MathUtils.clamp(offset.x * strength, -1, 1), y = MathUtils.clamp(offset.y * strength, -1, 1);
      const distance = camera.position.distanceTo(this.#head);
      this.#target.addScaledVector(this.#scratch.setFromMatrixColumn(camera.matrixWorld, 0), distance * Math.tan(MathUtils.degToRad(x * yawLimit)));
      this.#target.addScaledVector(this.#scratch.setFromMatrixColumn(camera.matrixWorld, 1), distance / Math.cos(MathUtils.degToRad(x * yawLimit)) * Math.tan(MathUtils.degToRad(y * pitchLimit)));
    }
    lookAt.lookAt(this.#target);
    const yaw = Math.max(-yawLimit, Math.min(yawLimit, lookAt.yaw));
    const pitch = Math.max(-pitchLimit, Math.min(pitchLimit, lookAt.pitch));
    const blend = 1 - Math.exp(-Math.max(0, delta) / ((this.#adjustments.smoothingMs ?? this.limits.smoothingMs ?? 100) / 1000));
    this.#yaw += (yaw - this.#yaw) * blend; this.#pitch += (pitch - this.#pitch) * blend;
    lookAt.yaw = Math.max(-yawLimit, Math.min(yawLimit, this.#yaw));
    lookAt.pitch = Math.max(-pitchLimit, Math.min(pitchLimit, this.#pitch));
  }
}
