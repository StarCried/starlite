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
    const rotation = new Quaternion(), correction = new Quaternion(), motion = new Quaternion(), initial = new Quaternion(), axis = new Vector3();
    for (const target of this.#targets) {
      const { source, track, side, kind } = target;
      track.values.set(source.values);
      const degrees = kind === "arm" ? idle.armLiftDegrees ?? 0
        : kind === "palm" ? idle.palmTwistDegrees ?? 0 : kind === "elbow" ? idle.elbowBendDegrees ?? 0 : 0;
      const hand = kind === "finger" || kind === "thumb";
      if ((!hand && !degrees) || (hand && idle.handCurl === undefined)) continue;
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
        axis.set(kind === "palm" ? side * this.#basis : 0, kind === "elbow" ? -side : 0, kind === "arm" ? side * this.#basis : 0);
        correction.setFromAxisAngle(axis, MathUtils.degToRad(degrees));
      }
      for (let at = 0; at < source.values.length; at += 4) {
        rotation.fromArray(source.values, at);
        if (hand) {
          // Keep the source motion around its first sample, including tiny
          // breathing changes, while replacing only the static finger pose.
          motion.copy(initial).multiply(rotation);
          rotation.copy(correction).multiply(motion);
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
