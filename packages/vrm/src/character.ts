import { Quaternion, Vector3, type Object3D, type SkinnedMesh } from "three";
import { VRMExpressionMorphTargetBind, type VRM } from "@pixiv/three-vrm";
import type { CharacterProfile } from "./types.js";

export function sampleCurve(curve: readonly (readonly [number, number])[], time: number): number {
  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1]!, b = curve[i]!;
    if (time <= b[0]) return a[1] + (b[1] - a[1]) * Math.max(0, (time - a[0]) / (b[0] - a[0]));
  }
  return curve.at(-1)?.[1] ?? 0;
}

export class CharacterBehavior {
  readonly #vrm: VRM;
  readonly #profile: CharacterProfile | undefined;
  readonly #blinkExpressions: readonly string[];
  readonly #morphs = new Map<string, { mesh: SkinnedMesh; index: number }[]>();
  readonly #earBones = new Map<string, Object3D>();
  readonly #baseEar = new Map<string, { rotation: Quaternion; position: Vector3 }>();
  #time = 0;
  #weights = "";
  #blinkAmount = 0;
  #authoredBlink: ReadonlyMap<string, number> | undefined;
  constructor(vrm: VRM, profile?: CharacterProfile) {
    this.#vrm = vrm; this.#profile = profile;
    const usable = (name: string): boolean => vrm.expressionManager?.getExpression(name)?.binds.some(bind =>
      bind instanceof VRMExpressionMorphTargetBind && bind.weight > 0
      && bind.primitives.some(mesh => mesh.morphTargetInfluences?.[bind.index] !== undefined)) ?? false;
    // Prefer a combined Blink. A complete left/right pair is equivalent; a
    // lone eyelid must not turn an ordinary blink into an unintended wink.
    this.#blinkExpressions = usable("blink") ? ["blink"]
      : usable("blinkLeft") && usable("blinkRight") ? ["blinkLeft", "blinkRight"] : [];
    if (!profile) return;
    vrm.scene.traverse((object) => {
      const mesh = object as SkinnedMesh;
      for (const [name, index] of Object.entries(mesh.morphTargetDictionary ?? {})) {
        const targets = this.#morphs.get(name) ?? []; targets.push({ mesh, index }); this.#morphs.set(name, targets);
      }
    });
    for (const name of profile.earBones) {
      const bone = findAuthoredNode(vrm.scene, name);
      if (!bone) throw new Error(`character profile is missing bone: ${name}`);
      this.#earBones.set(name, bone);
      this.#baseEar.set(name, { rotation: bone.quaternion.clone(), position: bone.position.clone() });
    }
    for (const value of Object.values(profile.expressions)) {
      if (!vrm.expressionManager?.getExpression(value.expression)) throw new Error(`character expression is missing: ${value.expression}`);
      if (value.blink && !this.#morphs.has(value.blink)) throw new Error(`character blink morph is missing: ${value.blink}`);
    }
    for (const [name, visible] of [[profile.accessories.collar, profile.accessories.collarVisible], [profile.accessories.cone, profile.accessories.coneVisible]] as const) {
      const object = findAuthoredNode(vrm.scene, name);
      if (!object) throw new Error(`character accessory is missing: ${name}`);
      object.visible = visible;
    }
  }
  beforeExpressions(delta: number, authoredBlink = false): void {
    this.#time += delta;
    if (authoredBlink && !this.#profile) return;
    const manager = this.#vrm.expressionManager;
    // Recipes without a correction already have closed eyes (e.g. Proud), so
    // their share also replaces Basis. Additive totals above one stay additive.
    const total = this.#profile ? Object.values(this.#profile.expressions).reduce((sum, item) => sum + Math.min(1, Math.max(0, manager?.getValue(item.expression) ?? 0)), 0) : 0;
    // Each custom correction closes its expression's share of the eyelids.
    // Ordinary blink must still close the remaining Basis share during fades.
    const curve = this.#profile?.blink.curve ?? [[0, 0], [3.4, 0], [3.48, 1], [3.52, 1], [3.65, 0], [4.7, 0]];
    this.#authoredBlink = authoredBlink ? new Map(this.#blinkExpressions.map(name => [name, manager?.getValue(name) ?? 0])) : undefined;
    this.#blinkAmount = this.#authoredBlink ? Math.max(0, ...this.#authoredBlink.values()) : sampleCurve(curve, this.#time % (this.#profile?.blink.period ?? 4.7));
    for (const name of this.#blinkExpressions) {
      const amount = this.#authoredBlink?.get(name) ?? this.#blinkAmount;
      manager?.setValue(name, Math.max(0, 1 - total) * amount);
    }
  }
  afterExpressions(): void {
    const profile = this.#profile;
    if (!profile) return;
    const weights = Object.entries(profile.expressions).map(([name, item]) => [name, Math.min(1, Math.max(0, this.#vrm.expressionManager?.getValue(item.expression) ?? 0))] as const);
    const key = weights.map(([, weight]) => weight.toFixed(4)).join(",");
    if (key !== this.#weights) {
      if (!weights.some(([, weight]) => weight > .001) || !this.#weights) this.#time = 0;
      this.#weights = key;
      // Set the authored ear rest pose only when expression weights change;
      // steady frames leave the spring solver's inertia intact.
      const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
      for (const [name, bone] of this.#earBones) {
        const neutral = profile.earPoses.Neutral?.[name];
        const base = this.#baseEar.get(name)!;
        const reference = neutral ? new Quaternion(...neutral.rotation) : base.rotation;
        const rotation = reference.clone();
        let accumulated = Math.max(0, 1 - total);
        const position = (neutral?.position ? new Vector3(...neutral.position) : base.position.clone()).multiplyScalar(accumulated);
        for (const [emotion, weight] of weights) {
          if (weight <= 0) continue;
          const pose = profile.earPoses[emotion]?.[name];
          if (!pose) throw new Error(`missing ear pose: ${emotion}/${name}`);
          rotation.slerp(new Quaternion(...pose.rotation), weight / (accumulated + weight));
          position.addScaledVector(pose.position ? new Vector3(...pose.position) : base.position, weight);
          accumulated += weight;
        }
        bone.quaternion.copy(rotation); bone.position.copy(position.divideScalar(Math.max(1, total)));
        // Spring joints disable matrixAutoUpdate. Their rest state reads both
        // quaternion and matrix, so compose the authored local pose before
        // propagating world matrices or capturing a new spring rest direction.
        // Otherwise a changing expression mixes the new rotation with the
        // preceding frame's simulated matrix and makes the ears jump.
        bone.updateMatrix();
      }
      this.#vrm.scene.updateMatrixWorld(true);
      // Expression changes establish a new authored rest direction for ears only.
      for (const joint of this.#vrm.springBoneManager?.joints ?? []) {
        if (profile.earBones.some((name) => this.#earBones.get(name) === joint.bone)) joint.setInitState();
      }
    }
    for (const [name, weight] of weights) {
      const blink = profile.expressions[name]?.blink;
      if (!blink) continue;
      for (const { mesh, index } of this.#morphs.get(blink) ?? []) mesh.morphTargetInfluences![index] = weight * this.#blinkAmount;
    }
    // Only the applied neutral share changes; the animation's sampled value
    // remains available to the next authored frame or captured-pose transition.
    for (const [name, value] of this.#authoredBlink ?? []) this.#vrm.expressionManager?.setValue(name, value);
    this.#authoredBlink = undefined;
  }
  reset(): void { this.#time = 0; this.#weights = ""; this.#blinkAmount = 0; this.#authoredBlink = undefined; }
}

function findAuthoredNode(root: Object3D, name: string): Object3D | undefined {
 let found: Object3D | undefined; root.traverse((node) => { if (node.name === name || node.userData.name === name) found = node; }); return found;
}
