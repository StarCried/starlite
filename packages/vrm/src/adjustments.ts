import { AnimationClip, MathUtils, PropertyBinding, Quaternion, Vector3, type Object3D, type QuaternionKeyframeTrack } from "three";
import type { VRMHumanoid, VRMHumanBoneName, VRMPose } from "@pixiv/three-vrm";
import type { ModelAdjustments } from "./types.js";

type Idle = NonNullable<ModelAdjustments["idle"]>;
interface Target {
  bone: VRMHumanBoneName;
  side: number;
  kind: "arm" | "palm" | "elbow" | "finger" | "thumb";
  joint?: string;
  source: QuaternionKeyframeTrack;
  track: QuaternionKeyframeTrack;
}

/** A controller-owned derivative of the program Idle; authored clips never enter here. */
export class AdjustableIdle {
  readonly clip: AnimationClip;
  readonly #targets: Target[] = [];
  readonly #basis: number;
  constructor(source: AnimationClip, root: Object3D, humanoid: Pick<VRMHumanoid, "getNormalizedBoneNode">, metaVersion: "0" | "1" = "1") {
    // Match createVRMAnimationClip: VRM0 faces -Z, so its normalized rig's
    // X/Z rotation axes are the opposite of VRM1's character-space axes.
    this.#basis = metaVersion === "0" ? -1 : 1;
    const bones = new Map<Object3D, Omit<Target, "source" | "track">>();
    for (const [side, sign] of [["left", 1], ["right", -1]] as const) {
      const add = (suffix: string, kind: Target["kind"], joint?: string) => {
        const bone = (side + suffix) as VRMHumanBoneName, node = humanoid.getNormalizedBoneNode(bone);
        if (node) bones.set(node, { bone, side: sign, kind, ...(joint ? { joint } : {}) });
      };
      add("UpperArm", "arm"); add("LowerArm", "elbow"); add("Hand", "palm");
      for (const finger of ["Index", "Middle", "Ring", "Little"]) {
        for (const joint of ["Proximal", "Intermediate", "Distal"]) add(finger + joint, "finger", joint);
      }
      for (const joint of ["Metacarpal", "Proximal", "Distal"]) add("Thumb" + joint, "thumb", joint);
    }
    const tracks = source.tracks.map(track => {
      const parsed = PropertyBinding.parseTrackName(track.name);
      const node = PropertyBinding.findNode(root, parsed.nodeName) as Object3D | null;
      const bone = node ? bones.get(node) : undefined;
      if (!bone || parsed.propertyName !== "quaternion" || track.getValueSize() !== 4 || track.ValueTypeName !== "quaternion") return track;
      const copy = track.clone() as QuaternionKeyframeTrack;
      this.#targets.push({ ...bone, source: track as QuaternionKeyframeTrack, track: copy });
      return copy;
    });
    this.clip = new AnimationClip(source.name, source.duration, tracks, source.blendMode);
  }
  update(idle: Idle = {}): void {
    const rotation = new Quaternion(), correction = new Quaternion(), wrist = new Quaternion(), motion = new Quaternion(), initial = new Quaternion(), axis = new Vector3();
    for (const target of this.#targets) {
      const { source, track, side, kind } = target;
      track.values.set(source.values);
      const degrees = kind === "arm" ? idle.armLiftDegrees ?? 0
        : kind === "palm" ? idle.palmTwistDegrees ?? 0 : kind === "elbow" ? idle.elbowBendDegrees ?? 0 : 0;
      const hand = kind === "finger" || kind === "thumb";
      const wristDegrees = kind === "palm" ? idle.wristLiftDegrees ?? 0 : 0;
      if ((!hand && !degrees && !wristDegrees) || (hand && idle.handCurl === undefined)) continue;
      if (hand) {
        initial.fromArray(source.values, 0).invert();
        // The four fingers curl towards the palm. The thumb has its own
        // opposition and flexion recipe rather than sharing their bend axis.
        const curl = idle.handCurl!;
        if (kind === "finger") {
          const bend = target.joint === "Proximal" ? 70 : target.joint === "Intermediate" ? 90 : 60;
          correction.setFromAxisAngle(axis.set(0, 0, -side * this.#basis), MathUtils.degToRad(bend * curl));
        } else if (target.joint === "Metacarpal") {
          correction.setFromAxisAngle(axis.set(0, side, 0), MathUtils.degToRad(35 * curl));
          correction.multiply(rotation.setFromAxisAngle(axis.set(0, 0, -side * this.#basis), MathUtils.degToRad(15 * curl)));
        } else {
          correction.setFromAxisAngle(axis.set(0, 0, -side * this.#basis), MathUtils.degToRad((target.joint === "Proximal" ? 45 : 65) * curl));
        }
      } else {
        // A rotation axis is an axial vector: mirroring left/right across X
        // keeps its X sign and reverses Y/Z. Opposite palm-X signs would
        // turn one palm inward and the other outward.
        axis.set(kind === "palm" ? this.#basis : 0, kind === "elbow" ? -side : 0, kind === "arm" ? side * this.#basis : 0);
        correction.setFromAxisAngle(axis, MathUtils.degToRad(degrees));
        if (kind === "palm") wrist.setFromAxisAngle(axis.set(0, 0, side * this.#basis), MathUtils.degToRad(wristDegrees));
      }
      for (let at = 0; at < source.values.length; at += 4) {
        rotation.fromArray(source.values, at);
        if (hand) {
          // Keep the source motion around its first sample, including tiny
          // breathing changes, while replacing only the static finger pose.
          motion.copy(initial).multiply(rotation);
          rotation.copy(correction).multiply(motion);
        } else if (kind === "palm") {
          // Bend in the forearm's frame before applying the palm-local twist,
          // so changing palm direction does not rotate the wrist-lift axis.
          rotation.premultiply(wrist).multiply(correction);
        } else if (kind === "arm") rotation.premultiply(correction);
        else rotation.multiply(correction);
        rotation.normalize().toArray(track.values, at);
      }
    }
  }
  /** Refresh stopped/paused neutral without sampling or resetting the live mixer. */
  neutralPose(pose: VRMPose): VRMPose {
    const result = { ...pose };
    for (const { bone, track } of this.#targets) {
      result[bone] = { ...result[bone], rotation: Array.from(track.values.slice(0, 4)) as [number, number, number, number] };
    }
    return result;
  }
}

/** Controller-owned program gestures expressed around the selected neutral pose.
 * Only generated built-ins enter here; source clips and authored motions stay intact.
 */
export class RebasedBuiltinGesture {
  readonly clip: AnimationClip;
  readonly #targets: {bone: VRMHumanBoneName; source: QuaternionKeyframeTrack; track: QuaternionKeyframeTrack; boundaryOnly: boolean}[] = [];
  constructor(source: AnimationClip, root: Object3D, humanoid: Pick<VRMHumanoid, "getNormalizedBoneNode">, pose: VRMPose) {
    const bones = new Map<Object3D, VRMHumanBoneName>();
    for (const [name, value] of Object.entries(pose)) {
      if (!value?.rotation) continue;
      const bone = name as VRMHumanBoneName, node = humanoid.getNormalizedBoneNode(bone);
      if (node) bones.set(node, bone);
    }
    const tracks = source.tracks.map(track => {
      const parsed = PropertyBinding.parseTrackName(track.name);
      const node = PropertyBinding.findNode(root, parsed.nodeName) as Object3D | null;
      const bone = node ? bones.get(node) : undefined;
      if (!bone || parsed.propertyName !== "quaternion" || track.getValueSize() !== 4 || track.ValueTypeName !== "quaternion") return track;
      const first = new Quaternion().fromArray(track.values, 0).normalize(), sample = new Quaternion();
      let boundaryOnly = false;
      if (/LowerArm|Thumb|Index|Middle|Ring|Little/.test(bone)) for (let at = 4; at < track.values.length; at += 4) {
        if (first.angleTo(sample.fromArray(track.values, at).normalize()) > 1e-4) { boundaryOnly = true; break; }
      }
      const original = track as QuaternionKeyframeTrack;
      const base = boundaryOnly ? sampleGestureBoundaries(original, source.duration) : original;
      const copy = base.clone();
      this.#targets.push({bone, source:base, track:copy, boundaryOnly});
      return copy;
    });
    this.clip = new AnimationClip(source.name, source.duration, tracks, source.blendMode);
    this.update(pose);
  }
  update(pose: VRMPose): void {
    const correction = new Quaternion(), first = new Quaternion(), sample = new Quaternion(), boundaryCorrection = new Quaternion();
    const ramp = Math.min(.4, this.clip.duration / 2);
    for (const {bone, source, track, boundaryOnly} of this.#targets) {
      track.values.set(source.values);
      const target = pose[bone]?.rotation;
      if (!target) continue;
      correction.fromArray(target).normalize().multiply(first.fromArray(source.values, 0).normalize().invert());
      for (let at = 0; at < source.values.length; at += 4) {
        // q(t) = targetIdle * inverse(originalFirst) * originalSample(t).
        // Rebuild from immutable source each time, retaining local motion and
        // mixer-owned sample arrays rather than accumulating calibration.
        let offset = correction;
        if (boundaryOnly && ramp > 0) {
          // Full offsets can overfold an authored elbow or double a fist's
          // curl. Match rest at the boundaries, retaining active elbow/finger
          // shapes. Static tracks continue to follow the adjusted rest.
          const time = source.times[at / 4]!;
          const t = MathUtils.clamp(Math.min(time, this.clip.duration - time) / ramp, 0, 1);
          const weight = 1 - t * t * (3 - 2 * t);
          if (weight === 0) continue;
          offset = boundaryCorrection.identity().slerp(correction, weight);
        }
        sample.fromArray(source.values, at).premultiply(offset).normalize().toArray(track.values, at);
      }
    }
  }
}

/** Sparse authored first/last keys would otherwise linearize the eased offset.
 * Add at most 50 samples per affected track, only in the bounded two ramps.
 */
function sampleGestureBoundaries(source: QuaternionKeyframeTrack, duration: number): QuaternionKeyframeTrack {
  const ramp = Math.min(.4, duration / 2);
  if (ramp <= 0) return source;
  const times = new Set<number>(source.times);
  const steps = Math.ceil(ramp * 60);
  for (let step = 0; step <= steps; step++) {
    const time = Math.min(ramp, step / 60);
    times.add(Math.fround(time)); times.add(Math.fround(duration-time));
  }
  const base = source.clone(); base.times = new Float32Array([...times].sort((a,b)=>a-b));
  base.values = new Float32Array(base.times.length*4);
  const interpolant = (source as QuaternionKeyframeTrack & {createInterpolant(result: Float32Array): {evaluate(time:number): ArrayLike<number>}}).createInterpolant(new Float32Array(4));
  // Preserve every original timestamp/value exactly, including interior keys.
  const originals = new Map(Array.from(source.times, (time,index)=>[time,index]));
  for (let index = 0; index < base.times.length; index++) {
    const time = base.times[index]!, original = originals.get(time);
    base.values.set(original === undefined ? interpolant.evaluate(time) : source.values.subarray(original*4,original*4+4),index*4);
  }
  return base;
}
