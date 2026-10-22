import { describe, expect, it } from "vitest";
import { AnimationClip, AnimationMixer, Object3D, Quaternion, QuaternionKeyframeTrack, Vector3, VectorKeyframeTrack } from "three";
import type { VRMHumanBoneName, VRMPose } from "@pixiv/three-vrm";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMAnimationLoaderPlugin, type VRMAnimation } from "@pixiv/three-vrm-animation";
import { AdjustableIdle } from "../src/adjustments.js";
import { VrmAnimationPlayer } from "../src/playback.js";
import { validateModelAdjustments, validateVrmWidgetConfig } from "../src/config.js";
import { defaultIdleBytes } from "../src/default-idle.js";

function fixture(missingFingers = false, version: "0" | "1" = "1") {
  const root = new Object3D(), nodes = new Map<string, Object3D>();
  const names = ["hips", "head", ...["left", "right"].flatMap(side => ["UpperArm", "LowerArm", "Hand", ...(missingFingers ? [] : ["IndexProximal", "IndexIntermediate", "IndexDistal", "ThumbMetacarpal", "ThumbProximal", "ThumbDistal"])].map(part => side + part))];
  for (const name of names) { const node = new Object3D(); node.name = "Normalized_" + name; root.add(node); nodes.set(name, node); }
  const start = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), .1), end = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), .15);
  const tracks = names.map(name => new QuaternionKeyframeTrack(nodes.get(name)!.name + ".quaternion", [0, 1, 2], [...start.toArray(), ...end.toArray(), ...start.toArray()]));
  const hips = new VectorKeyframeTrack(nodes.get("hips")!.name + ".position", [0, 1, 2], [0, 1, 0, 0, 1.01, 0, 0, 1, 0]);
  const source = new AnimationClip("StarLiteIdle", 2, [...tracks, hips]);
  if (version === "0") root.rotation.y = Math.PI;
  const idle = new AdjustableIdle(source, root, { getNormalizedBoneNode: (name: VRMHumanBoneName) => nodes.get(name) ?? null }, version);
  return { root, nodes, source, idle, start, end };
}
const rotation = (clip: AnimationClip, node: Object3D, sample = 0) => new Quaternion().fromArray(clip.tracks.find(track => track.name === node.name + ".quaternion")!.values, sample * 4).normalize();
const mirrorRotation = (q: Quaternion) => new Quaternion(q.x, -q.y, -q.z, q.w);

async function actualProgramIdle(version: "0" | "1") {
  const loader = new GLTFLoader(); loader.register(parser => new VRMAnimationLoaderPlugin(parser));
  const asset = await loader.parseAsync(defaultIdleBytes(), "");
  const animation = (asset.userData.vrmAnimations as VRMAnimation[])[0]!;
  const root = new Object3D(), nodes = new Map<VRMHumanBoneName, Object3D>();
  const tracks = [...animation.humanoidTracks.rotation].map(([name, source]) => {
    const node = new Object3D(); node.name = "Normalized_" + name; root.add(node); nodes.set(name, node);
    const track = source.clone(); track.name = node.name + ".quaternion";
    if (version === "0") track.values = track.values.map((value, index) => index % 2 === 0 ? -value : value);
    return track;
  });
  const source = new AnimationClip("StarLiteIdle", animation.duration, tracks);
  const idle = new AdjustableIdle(source, root, { getNormalizedBoneNode: name => nodes.get(name) ?? null }, version);
  return { source, idle, nodes };
}

describe("model adjustment validation", () => {
  it("preserves explicit zeros and accepts the documented boundaries", () => {
    for (const adjustments of [{}, { idle: {}, gaze: {} }, { idle: { armLiftDegrees: -30, palmTwistDegrees: -45, wristLiftDegrees: -45, handCurl: 0, elbowBendDegrees: -20 }, gaze: { headStrength: 0, eyeStrength: 0, smoothingMs: 20 } }, { idle: { armLiftDegrees: 45, palmTwistDegrees: 45, wristLiftDegrees: 45, handCurl: 1, elbowBendDegrees: 45 }, gaze: { headStrength: 2, eyeStrength: 2, smoothingMs: 1000 } }, { idle: { wristLiftDegrees: 0 } }]) {
      expect(() => validateModelAdjustments(adjustments)).not.toThrow();
      expect(() => validateVrmWidgetConfig({ model: "x.vrm", fallback: "x.png", adjustments })).not.toThrow();
    }
  });
  it.each([null, false, [], 1, "", { unknown: 1 }, { idle: null }, { idle: [] }, { gaze: false }, { idle: { xyz: 0 } }, { gaze: { gain: 1 } }, { idle: { handCurl: "0" } }, { idle: { handCurl: -.01 } }, { idle: { armLiftDegrees: 46 } }, { idle: { palmTwistDegrees: -46 } }, { idle: { wristLiftDegrees: -45.01 } }, { idle: { wristLiftDegrees: 45.01 } }, { idle: { wristLiftDegrees: "0" } }, { idle: { wristLiftDegrees: NaN } }, { idle: { elbowBendDegrees: Infinity } }, { gaze: { headStrength: 2.01 } }, { gaze: { eyeStrength: NaN } }, { gaze: { smoothingMs: 19 } }])("rejects malformed calibration %j", input => {
    expect(() => validateModelAdjustments(input)).toThrow("adjustments");
  });
  it.each(["constructor", "toString", "valueOf", "__proto__"])("rejects the prototype key %s even when its value is undefined", key => {
    for (const group of ["idle", "gaze"]) {
      expect(() => validateModelAdjustments({ [group]: Object.fromEntries([[key, undefined]]) })).toThrow(`adjustments.${group}.${key}`);
    }
  });
});

describe("program Idle calibration", () => {
  it("keeps the source immutable, breath/hips tracks unchanged, and resets exactly without accumulating", () => {
    const { source, idle, nodes } = fixture(), original = source.tracks.map(track => Array.from(track.values));
    idle.update({ armLiftDegrees: 20, palmTwistDegrees: 30, wristLiftDegrees: 25, elbowBendDegrees: 10, handCurl: .6 });
    const once = idle.clip.tracks.map(track => Array.from(track.values));
    for (let i = 0; i < 20; i++) idle.update({ armLiftDegrees: 20, palmTwistDegrees: 30, wristLiftDegrees: 25, elbowBendDegrees: 10, handCurl: .6 });
    expect(idle.clip.tracks.map(track => Array.from(track.values))).toEqual(once);
    expect(source.tracks.map(track => Array.from(track.values))).toEqual(original);
    expect(idle.clip.tracks.at(-1)).toBe(source.tracks.at(-1));
    expect(rotation(idle.clip, nodes.get("head")!).angleTo(rotation(source, nodes.get("head")!))).toBeCloseTo(0);
    const arm = nodes.get("leftUpperArm")!;
    const beforeDelta = rotation(source, arm).invert().multiply(rotation(source, arm, 1));
    const afterDelta = rotation(idle.clip, arm).invert().multiply(rotation(idle.clip, arm, 1));
    expect(afterDelta.angleTo(beforeDelta)).toBeCloseTo(0, 5);
    idle.update({}); expect(idle.clip.tracks.map(track => Array.from(track.values))).toEqual(original);
  });
  it("lifts mirrored arms in the character's frontal plane and twists palms independently", () => {
    const { source, idle, nodes } = fixture();
    idle.update({ armLiftDegrees: 20 });
    const left = rotation(idle.clip, nodes.get("leftUpperArm")!).multiply(rotation(source, nodes.get("leftUpperArm")!).invert());
    const right = rotation(idle.clip, nodes.get("rightUpperArm")!).multiply(rotation(source, nodes.get("rightUpperArm")!).invert());
    expect(left.z).toBeGreaterThan(0); expect(right.z).toBeLessThan(0); expect(Math.abs(left.z)).toBeCloseTo(Math.abs(right.z));
    expect(rotation(idle.clip, nodes.get("leftHand")!).angleTo(rotation(source, nodes.get("leftHand")!))).toBeCloseTo(0);
    idle.update({ palmTwistDegrees: 30 });
    expect(rotation(idle.clip, nodes.get("leftHand")!).angleTo(rotation(source, nodes.get("leftHand")!))).toBeCloseTo(Math.PI / 6);
    expect(rotation(idle.clip, nodes.get("leftUpperArm")!).angleTo(rotation(source, nodes.get("leftUpperArm")!))).toBeCloseTo(0);
  });
  it("uses an open pose and a separate thumb opposition recipe while keeping source hand motion", () => {
    const { source, idle, nodes } = fixture(), finger = nodes.get("leftIndexProximal")!, thumb = nodes.get("leftThumbMetacarpal")!;
    idle.update({ handCurl: 0 });
    expect(rotation(idle.clip, finger).angleTo(new Quaternion())).toBeCloseTo(0);
    const delta = rotation(source, finger).invert().multiply(rotation(source, finger, 1));
    expect(rotation(idle.clip, finger, 1).angleTo(delta)).toBeCloseTo(0, 5);
    idle.update({ handCurl: 1 });
    expect(Math.abs(rotation(idle.clip, finger).z)).toBeGreaterThan(.5);
    expect(Math.abs(rotation(idle.clip, thumb).y)).toBeGreaterThan(.2);
    expect(rotation(idle.clip, thumb).angleTo(rotation(idle.clip, finger))).toBeGreaterThan(.2);
    const neutral = idle.neutralPose({ hips: { position: [0, 1, 0] } } as VRMPose);
    expect(neutral.hips!.position).toEqual([0, 1, 0]);
    expect(new Quaternion().fromArray(neutral.leftIndexProximal!.rotation!).angleTo(rotation(idle.clip, finger))).toBeCloseTo(0);
  });
  it.each(["0", "1"] as const)("keeps actual program Idle palm normals mirrored for VRM%s", async version => {
    const { source, idle, nodes } = await actualProgramIdle(version);
    const left = nodes.get("leftHand")!, right = nodes.get("rightHand")!;
    const samples = source.tracks.find(track => track.name === left.name + ".quaternion")!.times.length;
    for (const degrees of [-45, 0, 45]) {
      idle.update({ palmTwistDegrees: degrees });
      for (const sample of [0, Math.floor(samples / 2), samples - 1]) {
        const l = rotation(idle.clip, left, sample), r = rotation(idle.clip, right, sample);
        // In a standard T-pose, palms face down (-Y) on both sides.
        // Compare their resulting normals, not just rotation magnitudes.
        const normalL = new Vector3(0, -1, 0).applyQuaternion(l);
        normalL.x *= -1;
        expect(normalL.distanceTo(new Vector3(0, -1, 0).applyQuaternion(r))).toBeLessThan(.001);
        expect(mirrorRotation(l).angleTo(r)).toBeLessThan(.001);
      }
    }
  });
  it.each(["0", "1"] as const)("raises both wrists independently of palm twist and leaves forearms unchanged for VRM%s", async version => {
    const { source, idle, nodes } = await actualProgramIdle(version);
    const basis = version === "0" ? -1 : 1;
    const getDirection = (side: "left" | "right") => new Vector3((side === "left" ? 1 : -1) * basis, 0, 0).applyQuaternion(rotation(idle.clip, nodes.get(side + "Hand" as VRMHumanBoneName)!));
    idle.update({ wristLiftDegrees: 30 });
    const liftedLeft = getDirection("left"), liftedRight = getDirection("right");
    expect(liftedLeft.y).toBeGreaterThan(new Vector3(basis, 0, 0).applyQuaternion(rotation(source, nodes.get("leftHand")!)).y);
    expect(liftedRight.y).toBeGreaterThan(new Vector3(-basis, 0, 0).applyQuaternion(rotation(source, nodes.get("rightHand")!)).y);
    idle.update({ wristLiftDegrees: 30, palmTwistDegrees: 45 });
    expect(getDirection("left").distanceTo(liftedLeft)).toBeLessThan(.000001);
    expect(getDirection("right").distanceTo(liftedRight)).toBeLessThan(.000001);
    for (const name of ["leftUpperArm", "rightUpperArm", "leftLowerArm", "rightLowerArm"] as const) expect(rotation(idle.clip, nodes.get(name)!).angleTo(rotation(source, nodes.get(name)!))).toBeCloseTo(0, 5);
    idle.update({ wristLiftDegrees: 0, palmTwistDegrees: 0 });
    expect(rotation(idle.clip, nodes.get("leftHand")!).angleTo(rotation(source, nodes.get("leftHand")!))).toBeCloseTo(0, 5);
    expect(rotation(idle.clip, nodes.get("rightHand")!).angleTo(rotation(source, nodes.get("rightHand")!))).toBeCloseTo(0, 5);
  });
  it("keeps wrist world positions fixed when wrist lift and palm direction change", () => {
    const { root, nodes, source, idle } = fixture();
    for (const [side, sign] of [["left", 1], ["right", -1]] as const) {
      const arm = nodes.get(side + "UpperArm")!, forearm = nodes.get(side + "LowerArm")!, hand = nodes.get(side + "Hand")!;
      arm.add(forearm); forearm.position.set(sign * .3, 0, 0);
      forearm.add(hand); hand.position.set(sign * .25, 0, 0);
    }
    const sample = (clip: AnimationClip) => {
      const mixer = new AnimationMixer(root); mixer.clipAction(clip).play(); mixer.update(.6);
      root.updateMatrixWorld(true);
      const positions = ["leftHand", "rightHand"].map(name => nodes.get(name)!.getWorldPosition(new Vector3()));
      mixer.stopAllAction(); mixer.uncacheRoot(root); return positions;
    };
    const before = sample(source);
    idle.update({ wristLiftDegrees: 35, palmTwistDegrees: -30 });
    const after = sample(idle.clip);
    expect(after[0]!.distanceTo(before[0]!)).toBeLessThan(.000001);
    expect(after[1]!.distanceTo(before[1]!)).toBeLessThan(.000001);
  });
  it("skips unmapped optional fingers and does not invent bone tracks", () => {
    const { source, idle } = fixture(true);
    expect(() => idle.update({ handCurl: 1, armLiftDegrees: 10 })).not.toThrow();
    expect(idle.clip.tracks).toHaveLength(source.tracks.length);
    expect(idle.clip.tracks.some(track => /Index|Thumb/.test(track.name))).toBe(false);
  });
  it("produces the same character-space corrections for VRM0 and VRM1", () => {
    const old = fixture(false, "0"), current = fixture(false, "1");
    const settings = { armLiftDegrees: 25, palmTwistDegrees: 30, wristLiftDegrees: 25, elbowBendDegrees: 15, handCurl: .8 };
    old.idle.update(settings); current.idle.update(settings);
    for (const name of ["leftUpperArm", "rightUpperArm", "leftLowerArm", "rightLowerArm", "leftHand", "rightHand", "leftIndexProximal", "rightIndexIntermediate", "leftThumbMetacarpal", "rightThumbDistal"]) {
      const a = rotation(old.idle.clip, old.nodes.get(name)!).premultiply(old.root.quaternion).multiply(old.root.quaternion.clone().invert());
      const b = rotation(current.idle.clip, current.nodes.get(name)!);
      expect(a.angleTo(b), name).toBeCloseTo(0, 5);
    }
  });
  it("updates live Idle samples without resetting phase or promises and leaves a foreground action intact", async () => {
    const { root, nodes, idle } = fixture(), arm = nodes.get("leftUpperArm")!;
    const raised = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), .8);
    const gesture = new AnimationClip("Gesture", 1, [new QuaternionKeyframeTrack(arm.name + ".quaternion", [0, 1], [...raised.toArray(), ...raised.toArray()])]);
    const player = new VrmAnimationPlayer(root, new Map([["StarLiteIdle", idle.clip], ["Gesture", gesture]]), () => arm.quaternion.identity(), "StarLiteIdle");
    const pending = player.play("StarLiteIdle", { mode: "loop" }); player.update(.6);
    idle.update({ armLiftDegrees: 15 }); player.update(0);
    expect(player.play("StarLiteIdle", { mode: "loop" })).toBe(pending);
    expect(arm.quaternion.angleTo(rotation(idle.clip, arm))).toBeGreaterThan(.02); // Still at .6 seconds, not first sample.
    const action = player.play("Gesture"); player.update(.5);
    expect(arm.quaternion.angleTo(raised)).toBeCloseTo(0);
    idle.update({ armLiftDegrees: 30, handCurl: 1 }); player.update(0);
    expect(arm.quaternion.angleTo(raised)).toBeCloseTo(0);
    player.update(.51); expect(await action).toBe("completed");
    const finalGesture = arm.quaternion.clone(); player.update(0); expect(arm.quaternion.angleTo(finalGesture)).toBeCloseTo(0);
    player.update(.4); expect(player.activeName).toBe("StarLiteIdle"); expect(player.mixer.stats.actions.inUse).toBe(1);
    expect(arm.quaternion.angleTo(raised)).toBeGreaterThan(.2);
    player.destroy();
  });
});
