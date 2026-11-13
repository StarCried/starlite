import { Object3D, Quaternion, Vector3 } from "three";
import type { VRMSpringBoneManager } from "@pixiv/three-vrm";
import type { TailSwaySettings } from "./types.js";

/** An idle-only parent transform. Authored tracks, bind transforms and VRM
 * spring/collider settings remain owned by the model, including the root joint. */
export class TailSway {
  readonly #driver = new Object3D();
  readonly #axis = new Vector3();
  readonly #rotation = new Quaternion();
  readonly #pivot = new Vector3();
  #bone: Object3D | undefined;
  #parent: Object3D | undefined;
  #settings: TailSwaySettings | undefined;
  #phase = 0;
  #weight = 0;
  #amplitude = 0;

  constructor(readonly scene: Object3D, readonly nodes: ReadonlyMap<string, readonly Object3D[]>, readonly springs?: VRMSpringBoneManager) {}

  set(settings?: TailSwaySettings): void {
    const matches = settings ? this.nodes.get(settings.rootBone) : undefined;
    if (settings && (matches?.length !== 1 || !matches[0]?.parent || matches[0] === this.scene)) {
      throw new Error("tailSway.rootBone must identify one model node");
    }
    const bone = matches?.[0];
    if (bone !== this.#bone) {
      this.destroy();
      if (bone) {
        const parent = bone.parent!;
        const index = parent.children.indexOf(bone);
        parent.add(this.#driver); this.#driver.add(bone);
        parent.children.splice(parent.children.indexOf(this.#driver), 1);
        parent.children.splice(index, 0, this.#driver);
        this.#bone = bone; this.#parent = parent;
        this.#amplitude = settings?.amplitudeDegrees ?? 10;
        this.#refreshOrdering();
      }
    }
    this.#settings = settings ? {...settings} : undefined;
  }

  update(delta: number, idle: boolean): void {
    if (!this.#bone || !this.#parent || !this.#settings) return;
    // No wall clock: pause/hidden time never advances the sway or its fade.
    if (delta > 0) {
      this.#phase = (this.#phase + 2 * Math.PI * delta / (this.#settings.periodSeconds ?? 10)) % (2 * Math.PI);
      const blend = 1 - Math.exp(-delta / .1);
      this.#weight += ((idle ? 1 : 0) - this.#weight) * blend;
      this.#amplitude += ((this.#settings.amplitudeDegrees ?? 10) - this.#amplitude) * blend;
    }
    this.scene.updateWorldMatrix(true, false); this.#parent.updateWorldMatrix(true, false);
    // Use model up, not the exported bone's local Y or the orbit camera's up.
    this.#axis.set(0, 1, 0).applyQuaternion(this.scene.getWorldQuaternion(this.#rotation));
    this.#axis.applyQuaternion(this.#parent.getWorldQuaternion(this.#rotation).invert()).normalize();
    this.#driver.quaternion.setFromAxisAngle(this.#axis, Math.sin(this.#phase) * this.#amplitude * Math.PI / 180 * this.#weight);
    // A pivot transform preserves the root's local translation and its animation
    // bindings. It also leaves the spring solver's initial local matrix intact.
    this.#pivot.copy(this.#bone.position).applyQuaternion(this.#driver.quaternion);
    this.#driver.position.copy(this.#bone.position).sub(this.#pivot);
    this.#driver.updateMatrixWorld(true);
  }

  reset(): void {
    this.#phase = 0; this.#weight = 0;
    this.#driver.position.set(0, 0, 0); this.#driver.quaternion.identity();
    this.#driver.updateMatrixWorld(true);
  }

  destroy(): void {
    this.reset();
    if (this.#bone && this.#parent) {
      const index = this.#parent.children.indexOf(this.#driver);
      this.#parent.add(this.#bone); this.#parent.remove(this.#driver);
      this.#parent.children.splice(this.#parent.children.indexOf(this.#bone), 1);
      this.#parent.children.splice(index, 0, this.#bone);
      this.#refreshOrdering();
    }
    this.#bone = undefined; this.#parent = undefined; this.#settings = undefined;
  }

  #refreshOrdering(): void {
    // The solver caches ancestors. Public remove/add invalidates that cache
    // without changing spring parameters, rest states or collider associations.
    for (const joint of [...(this.springs?.joints ?? [])]) { this.springs!.deleteJoint(joint); this.springs!.addJoint(joint); }
  }
}
