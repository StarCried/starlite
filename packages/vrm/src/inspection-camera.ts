import { Box3, MathUtils, PerspectiveCamera, Vector3 } from "three";

/** An orbit around the neutral portrait, never around the moving animated bounds. */
export class InspectionCamera {
  readonly target = new Vector3();
  #yaw = 0;
  #pitch = 0;
  #weight = 0;
  #returnFrom: {yaw: number; pitch: number; weight: number} | undefined;
  #elapsed = 0;
  inspecting = false;
  get engaged(): boolean { return this.inspecting || this.#returnFrom !== undefined; }
  get transitioning(): boolean { return Boolean(this.#returnFrom) || this.inspecting && this.#weight < 1; }
  rotate(dx: number, dy: number, base: PerspectiveCamera): void {
    if (![dx, dy].every(Number.isFinite)) return;
    this.inspecting = true; this.#returnFrom = undefined;
    this.#yaw = MathUtils.euclideanModulo(this.#yaw - dx * .008 + Math.PI, Math.PI * 2) - Math.PI;
    const offset = base.position.clone().sub(this.target);
    const pitch = Math.asin(offset.y / offset.length());
    this.#pitch = MathUtils.clamp(pitch + this.#pitch + dy * .008, -MathUtils.degToRad(80), MathUtils.degToRad(80)) - pitch;
  }
  reset(immediate = false): void {
    this.inspecting = false;
    if (immediate) { this.#yaw = this.#pitch = this.#weight = 0; this.#returnFrom = undefined; }
    else if (this.engaged || this.#weight > 0 || this.#yaw || this.#pitch) {
      this.#returnFrom = {yaw: this.#yaw, pitch: this.#pitch, weight: this.#weight}; this.#elapsed = 0;
    }
  }
  update(delta: number): boolean {
    if (!this.transitioning) return false;
    if (this.#returnFrom) {
      this.#elapsed += Math.max(0, delta);
      const t = Math.min(1, this.#elapsed / .25), remaining = 1 - t * t * (3 - 2 * t);
      this.#yaw = this.#returnFrom.yaw * remaining; this.#pitch = this.#returnFrom.pitch * remaining;
      this.#weight = this.#returnFrom.weight * remaining;
      if (t === 1) this.#returnFrom = undefined;
    } else this.#weight = Math.min(1, this.#weight + Math.max(0, delta) / .2);
    return true;
  }
  apply(base: PerspectiveCamera, view: PerspectiveCamera, bounds: Box3, padding = .9): void {
    view.copy(base);
    if (!this.engaged) return;
    const offset = base.position.clone().sub(this.target), original = offset.length();
    const yaw = Math.atan2(offset.x, offset.z) + this.#yaw;
    const pitch = MathUtils.clamp(Math.asin(offset.y / original) + this.#pitch, -MathUtils.degToRad(80), MathUtils.degToRad(80));
    const tan = Math.tan(MathUtils.degToRad(base.fov / 2)) * padding;
    // Fixed conservative distance fits every reference corner at any yaw/pitch.
    // The horizontal orbit never rolls the model's vertical extent into its width.
    let distance = original;
    for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
      offset.set(x, y, z).sub(this.target);
      distance = Math.max(distance, offset.length() / Math.sin(Math.atan(tan)), offset.length() + Math.hypot(offset.x, offset.z) / (tan * base.aspect));
    }
    distance = MathUtils.lerp(original, distance, this.#weight);
    view.position.copy(this.target).add(offset.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(distance));
    view.lookAt(this.target); view.updateMatrixWorld(true);
  }
}
