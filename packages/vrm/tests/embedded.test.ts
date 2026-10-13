import { describe, expect, it } from "vitest";
import { AnimationClip, AnimationMixer, BufferAttribute, Euler, Mesh, NumberKeyframeTrack, Object3D, Quaternion, QuaternionKeyframeTrack, Vector3, VectorKeyframeTrack } from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import { VRMExpression, VRMExpressionManager, VRMExpressionMorphTargetBind, VRMHumanoid, type VRM } from "@pixiv/three-vrm";
import { prepareEmbeddedAnimations } from "../src/embedded.js";
import { embeddedAnimationCatalog } from "../src/inspect.js";
import { VrmAnimationPlayer } from "../src/playback.js";
import { validateVrmWidgetConfig } from "../src/config.js";

function rig() {
  const scene = new Object3D(), armature = new Object3D(), hips = new Object3D(), head = new Object3D(), eye = new Object3D();
  scene.add(armature); armature.add(hips); hips.add(head); head.add(eye);
  armature.position.set(.1, .2, .3); armature.quaternion.setFromEuler(new Euler(.2, .3, -.1));
  hips.position.set(0, 1, 0); hips.quaternion.setFromEuler(new Euler(.1, -.1, .3));
  head.position.set(0, .5, 0); head.quaternion.setFromEuler(new Euler(.15, .2, -.4));
  eye.position.set(.03, .1, .03);
  const humanoid = new VRMHumanoid({ hips: { node: hips }, head: { node: head }, leftEye: { node: eye } });
  scene.add(humanoid.normalizedHumanBonesRoot);
  const expressionManager = new VRMExpressionManager();
  const vrm = { scene, humanoid, expressionManager } as unknown as VRM;
  return { scene, armature, hips, head, eye, humanoid, expressionManager, vrm };
}
function asset(scene: Object3D, clips: AnimationClip[], attributes: BufferAttribute[] = []) {
  return { scene, animations: clips, parser: { getDependency: async (_: string, index: number) => attributes[index] } } as unknown as GLTF;
}
function json(name = "Idle", extras?: unknown) {
  return { accessors: [{ type: "SCALAR", componentType: 5126, max: [1] }, { type: "SCALAR", componentType: 5126 }], animations: [{ name, samplers: [{ input: 0, output: 1 }], ...(extras ? { extras } : {}) }] };
}

describe("single-file VRM animations", () => {
  it("inverts the official raw rig rotation mapping including parent/rest rotations", async () => {
    const { scene, humanoid, head, eye, vrm } = rig();
    const normalized = new Quaternion().setFromEuler(new Euler(.4, -.2, .15));
    humanoid.getNormalizedBoneNode("head")!.quaternion.copy(normalized);
    humanoid.update(); const expected = head.quaternion.clone();
    humanoid.resetNormalizedPose(); humanoid.update();
    const source = new AnimationClip("Idle", 1, [new QuaternionKeyframeTrack(head.uuid + ".quaternion", [0, 1], [...expected.toArray(), ...expected.toArray()])]);
    const embedded = await prepareEmbeddedAnimations(asset(scene, [source]), vrm, json());
    const mixer = new AnimationMixer(scene); mixer.clipAction(embedded.clips[0]!).play(); mixer.update(.5);
    expect(humanoid.getNormalizedBoneNode("head")!.quaternion.angleTo(normalized)).toBeCloseTo(0);
    humanoid.update(); expect(head.quaternion.angleTo(expected)).toBeCloseTo(0);
    expect(embedded.eyeClips.size).toBe(0);
    const eyes = await prepareEmbeddedAnimations(asset(scene, [new AnimationClip("Eyes", 1, [new QuaternionKeyframeTrack(eye.uuid + ".quaternion", [0, 1], [0, 0, 0, 1, 0, .1, 0, Math.sqrt(.99)])])]), vrm, json("Eyes"));
    expect(eyes.eyeClips.has("Eyes")).toBe(true);
  });
  it("reconstructs hips translation while leaving other authored local translations intact", async () => {
    const { scene, hips, head, humanoid, vrm } = rig();
    const normalized = humanoid.getNormalizedBoneNode("hips")!, position = normalized.position.clone().add(new Vector3(.1, -.05, .2));
    normalized.position.copy(position); humanoid.update(); const expected = hips.position.clone();
    humanoid.resetNormalizedPose(); humanoid.update();
    const source = new AnimationClip("Idle", 1, [
      new VectorKeyframeTrack(hips.uuid + ".position", [0, 1], [...expected.toArray(), ...expected.toArray()]),
      new VectorKeyframeTrack(head.uuid + ".position", [0, 1], [0, .6, 0, 0, .6, 0]),
    ]);
    const embedded = await prepareEmbeddedAnimations(asset(scene, [source]), vrm, json());
    const mixer = new AnimationMixer(scene); mixer.clipAction(embedded.clips[0]!).play(); mixer.update(.5); humanoid.update();
    expect(normalized.position.distanceTo(position)).toBeCloseTo(0); expect(hips.position.distanceTo(expected)).toBeCloseTo(0);
    expect(head.position.y).toBeCloseTo(.6);
  });
  it("preserves named expression sampling through the expression manager and ignores baked duplicate weights", async () => {
    const { scene, vrm, expressionManager } = rig(), mesh = new Mesh(); scene.add(mesh);
    mesh.morphTargetInfluences = [0]; const expression = new VRMExpression("happy");
    expression.addBind(new VRMExpressionMorphTargetBind({ primitives: [mesh], index: 0, weight: 1 })); expressionManager.registerExpression(expression); scene.add(expression);
    const source = new AnimationClip("Happy", 1, [new NumberKeyframeTrack(mesh.uuid + ".morphTargetInfluences", [0, 1], [0, 1])]);
    const attributes = [new BufferAttribute(new Float32Array([0, 1]), 1), new BufferAttribute(new Float32Array([0, 1]), 1)];
    const embedded = await prepareEmbeddedAnimations(asset(scene, [source], attributes), vrm, json("Happy", { starlite: { expressions: { happy: 0 } } }));
    const mixer = new AnimationMixer(scene); mixer.clipAction(embedded.clips[0]!).play(); mixer.update(.5);
    expressionManager.update(); embedded.applyMorphs();
    expect(expressionManager.getValue("happy")).toBeCloseTo(.5); expect(mesh.morphTargetInfluences[0]).toBeCloseTo(.5);
    expect(embedded.clips[0]!.tracks).toHaveLength(1);
  });
  it("retains scalar cubic expression tangents and clamps to endpoint samples", async () => {
    const { scene, vrm, expressionManager, head } = rig();
    const expression = new VRMExpression("happy"); expressionManager.registerExpression(expression); scene.add(expression);
    const attributes = [new BufferAttribute(new Float32Array([0, 1]), 1), new BufferAttribute(new Float32Array([0, 0, 2, 0, 1, 0]), 1)];
    const source = new AnimationClip("Happy", 1, [new QuaternionKeyframeTrack(head.uuid + ".quaternion", [0, 1], [...head.quaternion.toArray(), ...head.quaternion.toArray()])]);
    const metadata = json("Happy", { starlite: { expressions: { happy: 0 } } }); Object.assign(metadata.animations[0]!.samplers[0]!, { interpolation: "CUBICSPLINE" });
    const embedded = await prepareEmbeddedAnimations(asset(scene, [source], attributes), vrm, metadata);
    const track = embedded.clips[0]!.tracks.at(-1)! as NumberKeyframeTrack & { createInterpolant(): { evaluate(time: number): Float32Array } };
    expect(track.createInterpolant().evaluate(-1)[0]).toBe(0);
    expect(track.createInterpolant().evaluate(.5)[0]).toBeCloseTo(.75);
    expect(track.createInterpolant().evaluate(2)[0]).toBe(1);
  });
  it("plays ordinary morph tracks without expression updates erasing them or accumulating weight", async () => {
    const { scene, vrm, expressionManager } = rig(), mesh = new Mesh(); scene.add(mesh);
    mesh.morphTargetInfluences = [0, .2]; const expression = new VRMExpression("happy");
    expression.addBind(new VRMExpressionMorphTargetBind({ primitives: [mesh], index: 0, weight: 1 })); expressionManager.registerExpression(expression); scene.add(expression);
    const source = new AnimationClip("Face", 1, [new NumberKeyframeTrack(mesh.uuid + ".morphTargetInfluences", [0, 1], [0, .2, 1, .8])]);
    const embedded = await prepareEmbeddedAnimations(asset(scene, [source]), vrm, json("Face"));
    const mixer = new AnimationMixer(scene); mixer.clipAction(embedded.clips[0]!).play(); mixer.update(.5);
    expressionManager.setValue("happy", .25);
    for (let i = 0; i < 3; i++) { expressionManager.update(); embedded.applyMorphs(); expect(mesh.morphTargetInfluences).toEqual([.75, expect.closeTo(.5)]); }
    expect(embedded.clips[0]!.tracks).toHaveLength(2);
    mixer.stopAllAction(); mixer.uncacheRoot(scene);
    const clips = new Map([["Face", embedded.clips[0]!], ["Other", new AnimationClip("Other", 1, [new NumberKeyframeTrack(".position[x]", [0, 1], [0, 0])])]]);
    const player = new VrmAnimationPlayer(scene, clips, () => undefined); void player.play("Face", { mode: "loop" }); player.update(.5); void player.play("Other"); player.update(.1);
    expressionManager.update(); embedded.applyMorphs(); expect(mesh.morphTargetInfluences).toEqual([expect.closeTo(.671875), expect.closeTo(.453125)]); player.destroy();
  });
  it("validates embedded names and permits configured references alongside external Idle", () => {
    const metadata = json(); delete (metadata.animations[0]! as { name?: string }).name;
    expect(embeddedAnimationCatalog(metadata)).toEqual([{ name: "Animation_1", durationMs: 1000 }]);
    expect(() => embeddedAnimationCatalog({ ...metadata, animations: [{ ...metadata.animations[0], name: "StarLiteIdle" }] })).toThrow("name");
    expect(() => embeddedAnimationCatalog({ ...metadata, animations: [metadata.animations[0], { ...metadata.animations[0], name: "Animation_1" }] })).toThrow("name");
    expect(() => validateVrmWidgetConfig({ model: "model.vrm", fallback: "fallback.png", embeddedAnimations: ["Wave"], animations: [{ name: "StarLiteIdle", url: "Idle.vrma" }], ambient: { animations: ["StarLiteIdle"] }, interactions: { click: { animation: "Wave" } } })).not.toThrow();
    expect(() => validateVrmWidgetConfig({ model: "model.vrm", fallback: "fallback.png", embeddedAnimations: ["Wave"], animations: [{ name: "Wave", url: "Wave.vrma" }] })).toThrow("duplicate");
  });
});
