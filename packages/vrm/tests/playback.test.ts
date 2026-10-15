import { describe, expect, it, vi } from "vitest";
import { AnimationClip, NumberKeyframeTrack, QuaternionKeyframeTrack, Quaternion, Object3D, Vector3, VectorKeyframeTrack, type Interpolant } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VrmAnimationPlayer } from "../src/playback.js";
import { sampleCurve } from "../src/character.js";
// @ts-expect-error test fixture generator is plain JavaScript
import { glb } from "../../../tests/fixtures/vrm.mjs";

function harness() {
  const root = new Object3D(); root.name = "root";
  const clip = new AnimationClip("Idle", 1, [new NumberKeyframeTrack(".position[x]", [0, .5, 1], [0, 1, 0])]);
  const player = new VrmAnimationPlayer(root, new Map([["Idle", clip], ["Click", clip.clone()]]), () => root.position.set(0, 0, 0));
  return { player, root };
}
describe("VRM animation contract", () => {
  it("finishes a real single clip and restores the neutral pose", async () => {
    const { player, root } = harness();
    const result = player.play("Click"); player.update(.5);
    expect(root.position.x).toBeCloseTo(1);
    player.update(.6); expect(await result).toBe("completed"); expect(root.position.x).toBe(0);
  });
  it("holds a loop promise until interruption, never substituting unknown names", async () => {
    const { player } = harness();
    const loop = player.play("Idle", { mode: "loop" }); let settled = false;
    void loop.then(() => { settled = true; }); player.update(4); await Promise.resolve(); expect(settled).toBe(false);
    await expect(player.play("idle")).rejects.toThrow(); expect(player.activeName).toBe("Idle");
    const click = player.play("Click"); expect(await loop).toBe("interrupted");
    player.destroy(); player.destroy(); expect(await click).toBe("stopped");
  });
  it("plays the complete gesture and blends its final pose directly into the configured Idle", async () => {
    const root = new Object3D();
    const idle = new AnimationClip("Idle", 1, [new NumberKeyframeTrack(".position[x]", [0, 1], [0, 0])]);
    const gesture = new AnimationClip("Gesture", 2, [new NumberKeyframeTrack(".position[x]", [0, 1, 2], [0, 2, 3])]);
    const player = new VrmAnimationPlayer(root, new Map([["Idle", idle], ["Gesture", gesture]]), () => root.position.set(0, 0, 0), "Idle");
    void player.play("Idle", {mode:"loop"});
    const result = player.play("Gesture"); let settled = false;
    void result.then(() => { settled = true; });
    player.update(1.9); await Promise.resolve();
    expect(settled).toBe(false); expect(player.activeName).toBe("Gesture");
    player.update(.11);
    expect(await result).toBe("completed"); expect(player.activeName).toBe("Idle");
    expect(root.position.x).toBeCloseTo(3);
    player.update(.1); expect(root.position.x).toBeCloseTo(2.53125);
    player.update(.1); expect(root.position.x).toBeCloseTo(1.5);
    player.update(.21); expect(root.position.x).toBe(0);
    expect(player.mixer.stats.actions.inUse).toBe(1);
    player.stop(); expect(player.activeName).toBeUndefined(); expect(root.position.x).toBe(0);
    player.destroy();
  });
  it("shares an identical playback unless restart is explicit", async () => {
    const { player } = harness();
    const first=player.play("Idle", {mode:"loop"}); expect(player.play("Idle", {mode:"loop"})).toBe(first);
    const next=player.play("Idle", {mode:"loop",restart:true}); expect(await first).toBe("interrupted");
    player.stop(); expect(await next).toBe("stopped");
  });
  it("keeps the visible pose continuous when a raised gesture is interrupted", async () => {
    const { player, root } = harness();
    const idle = player.play("Idle", {mode:"loop"}); player.update(.5);
    expect(root.position.x).toBeCloseTo(1);
    const click = player.play("Click");
    expect(await idle).toBe("interrupted"); expect(root.position.x).toBeCloseTo(1);
    player.update(.1); expect(root.position.x).toBeCloseTo(.875);
    player.update(.1); expect(root.position.x).toBeCloseTo(.7);
    expect(player.mixer.stats.actions.inUse).toBe(2);
    player.update(.2); expect(root.position.x).toBeCloseTo(.8);
    expect(player.mixer.stats.actions.inUse).toBe(1);
    player.stop(); expect(await click).toBe("stopped"); expect(root.position.x).toBe(0);
  });
  it("blends bone rotations as quaternions without a neutral rotation snap", () => {
    const root = new Object3D();
    const raised = new Quaternion(0, Math.SQRT1_2, 0, Math.SQRT1_2);
    const clip = new AnimationClip("gesture", 1, [new QuaternionKeyframeTrack(".quaternion", [0,.5,1], [0,0,0,1,...raised.toArray(),0,0,0,1])]);
    const player = new VrmAnimationPlayer(root, new Map([["first",clip],["second",clip.clone()]]),()=>root.quaternion.identity());
    void player.play("first"); player.update(.5);
    void player.play("second"); expect(root.quaternion.angleTo(raised)).toBeCloseTo(0);
    player.update(.1); expect(root.quaternion.angleTo(new Quaternion())).toBeCloseTo(Math.PI*.4375);
    player.destroy(); expect(root.quaternion.angleTo(new Quaternion())).toBe(0);
  });
  it("captures rapid transitions without accumulating outgoing actions", () => {
    const { player, root } = harness();
    void player.play("Idle", {mode:"loop"}); player.update(.5);
    for(let i=0;i<20;i++) {
      const position = root.position.x;
      void player.play(i%2 ? "Idle" : "Click", {restart:true,mode:"loop"});
      expect(root.position.x).toBeCloseTo(position);
      player.update(.025);
      expect(player.mixer.stats.actions.inUse).toBeLessThanOrEqual(2);
    }
    player.update(.4); expect(player.mixer.stats.actions.inUse).toBe(1);
    player.destroy(); expect(player.mixer.stats.actions.inUse).toBe(0);
  });
  it("starts and lands more gently than its middle without overshooting the target", () => {
    const root = new Object3D();
    const idle = new AnimationClip("Idle", 1, [new NumberKeyframeTrack(".position[x]", [0,1], [0,0])]);
    const raised = new AnimationClip("Raised", 1, [new NumberKeyframeTrack(".position[x]", [0,1], [1,1])]);
    const player = new VrmAnimationPlayer(root, new Map([["Idle",idle],["Raised",raised]]),()=>root.position.set(0,0,0));
    void player.play("Idle", {mode:"loop"});
    void player.play("Raised", {mode:"loop"});
    const positions = [root.position.x];
    for (let i=0;i<40;i++) { player.update(.01); positions.push(root.position.x); }
    expect(positions[0]).toBe(0); expect(positions.at(-1)).toBeCloseTo(1);
    for (let i=1;i<positions.length;i++) {
      expect(positions[i]).toBeGreaterThanOrEqual(positions[i-1]!);
      expect(positions[i]).toBeLessThanOrEqual(1);
    }
    const middleStep = positions[20]! - positions[19]!;
    expect(positions[1]! - positions[0]!).toBeLessThan(middleStep * .1);
    expect(positions[40]! - positions[39]!).toBeLessThan(middleStep * .1);
    expect(player.mixer.stats.actions.inUse).toBe(1);
    player.destroy();
  });
  it("returns tracks absent from the destination to neutral along the eased blend", () => {
    const root = new Object3D();
    const first = new AnimationClip("First", 1, [new NumberKeyframeTrack(".position[x]", [0,1], [2,2])]);
    const second = new AnimationClip("Second", 1, [new NumberKeyframeTrack(".position[y]", [0,1], [1,1])]);
    const player = new VrmAnimationPlayer(root, new Map([["First",first],["Second",second]]),()=>root.position.set(0,0,0));
    void player.play("First", {mode:"loop"}); player.update(.5);
    void player.play("Second", {mode:"loop"});
    expect(root.position.toArray()).toEqual([2,0,0]);
    player.update(.1);
    expect(root.position.x).toBeCloseTo(1.6875); expect(root.position.y).toBeCloseTo(.15625);
    player.update(.3);
    expect(root.position.toArray()).toEqual([0,1,0]);
    expect(player.mixer.stats.actions.inUse).toBe(1);
    player.destroy();
  });
  it("reaches the same pose at 30 fps, 60 fps and a single large update", () => {
    const sample = (steps: number[]) => {
      const {player,root} = harness();
      void player.play("Idle", {mode:"loop"}); player.update(.5);
      void player.play("Click", {mode:"loop"});
      for (const step of steps) player.update(step);
      const result = {x:root.position.x, actions:player.mixer.stats.actions.inUse};
      player.destroy(); return result;
    };
    const at30 = sample(Array.from({length:6},()=>1/30));
    const at60 = sample(Array.from({length:12},()=>1/60));
    const oneStep = sample([.2]);
    expect(at30.x).toBeCloseTo(oneStep.x,6); expect(at60.x).toBeCloseTo(oneStep.x,6);
    expect(at30.actions).toBe(2); expect(at60.actions).toBe(2);
    const finished30 = sample(Array.from({length:15},()=>1/30));
    const finished60 = sample(Array.from({length:30},()=>1/60));
    const large = sample([.5]);
    expect(finished30.x).toBeCloseTo(large.x,6); expect(finished60.x).toBeCloseTo(large.x,6);
    expect(finished30.actions).toBe(1); expect(finished60.actions).toBe(1); expect(large.actions).toBe(1);
  });
  it("can finish a short once during entry and return to Idle without a pose snap", async () => {
    const root = new Object3D();
    const idle = new AnimationClip("Idle", 1, [new NumberKeyframeTrack(".position[x]", [0,1], [0,0])]);
    const short = new AnimationClip("Short", .08, [new NumberKeyframeTrack(".position[x]", [0,.08], [0,2])]);
    const player = new VrmAnimationPlayer(root, new Map([["Idle",idle],["Short",short]]),()=>root.position.set(0,0,0),"Idle");
    void player.play("Idle", {mode:"loop"});
    const result = player.play("Short"); player.update(.1);
    expect(await result).toBe("completed"); expect(player.activeName).toBe("Idle");
    const exitPose = root.position.x;
    expect(exitPose).toBeGreaterThan(0); expect(exitPose).toBeLessThan(2);
    player.update(0); expect(root.position.x).toBeCloseTo(exitPose);
    player.update(.2); expect(root.position.x).toBeCloseTo(exitPose/2);
    player.update(.21); expect(root.position.x).toBe(0);
    expect(player.mixer.stats.actions.inUse).toBe(1);
    player.destroy();
  });
  it.each([["Embedded", "External"], ["External", "Embedded"]])("blends %s into %s when bone and expression targets have UUID/name aliases", (from, to) => {
    const root = new Object3D(), hips = new Object3D(), expression = Object.assign(new Object3D(), { weight: 0 });
    hips.name = "Normalized_Hips"; expression.name = "VRMExpression_happy"; root.add(hips, expression);
    const raised = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);
    const embedded = new AnimationClip("Embedded", 1, [
      new QuaternionKeyframeTrack(hips.uuid + ".quaternion", [0, 1], [0, 0, 0, 1, ...raised.toArray()]),
      new VectorKeyframeTrack(hips.uuid + ".position", [0, 1], [0, 0, 0, 1, 2, 3]),
      new NumberKeyframeTrack(expression.uuid + ".weight", [0, 1], [0, 1]),
    ]);
    const external = new AnimationClip("External", 1, [
      new QuaternionKeyframeTrack(hips.name + ".quaternion", [0, 1], [0, 0, 0, 1, ...raised.toArray()]),
      new VectorKeyframeTrack(hips.name + ".position", [0, 1], [0, 0, 0, 1, 2, 3]),
      new NumberKeyframeTrack(expression.name + ".weight", [0, 1], [0, 1]),
    ]);
    const player = new VrmAnimationPlayer(root, new Map([["Embedded", embedded], ["External", external]]), () => {
      hips.quaternion.identity(); hips.position.set(0, 0, 0); expression.weight = 0;
    });
    void player.play(from, { mode: "loop" }); player.update(.3);
    void player.play(to, { mode: "loop" });
    for (let i = 1; i <= 16; i++) {
      player.update(1 / 30);
      const t = Math.min(1, i / 30 / VrmAnimationPlayer.transitionSeconds), blend = t * t * (3 - 2 * t);
      const weight = .3 * (1 - blend) + i / 30 * blend;
      expect(hips.quaternion.angleTo(new Quaternion())).toBeCloseTo(weight * Math.PI / 2, 5);
      expect(hips.position.distanceTo(new Vector3(weight, 2 * weight, 3 * weight))).toBeCloseTo(0, 6);
      expect(expression.weight).toBeCloseTo(weight, 6);
    }
    expect(embedded.tracks[0]!.name).toBe(hips.uuid + ".quaternion");
    expect(external.tracks[0]!.name).toBe(hips.name + ".quaternion");
    expect(player.mixer.stats.actions.inUse).toBe(1);
    player.destroy();
  });
  it("returns an absent destination track to neutral even when an unused clip aliases it", () => {
    const root = new Object3D(), bone = new Object3D(); bone.name = "Normalized_Arm"; root.add(bone);
    const first = new AnimationClip("First", 1, [new NumberKeyframeTrack(bone.uuid + ".position[x]", [0, 1], [2, 2])]);
    const second = new AnimationClip("Second", 1, [new NumberKeyframeTrack(".position[y]", [0, 1], [1, 1])]);
    const alias = new AnimationClip("Unused", 1, [new NumberKeyframeTrack(bone.name + ".position[x]", [0, 1], [3, 3])]);
    const player = new VrmAnimationPlayer(root, new Map([["First", first], ["Second", second], ["Unused", alias]]), () => {
      root.position.set(0, 0, 0); bone.position.set(0, 0, 0);
    });
    void player.play("First", { mode: "loop" }); player.update(.3); void player.play("Second", { mode: "loop" });
    player.update(.2); expect(bone.position.x).toBeCloseTo(1); expect(root.position.y).toBeCloseTo(.5);
    player.update(.2); player.update(1 / 30);
    expect(bone.position.x).toBe(0); expect(root.position.y).toBe(1);
    player.destroy();
  });
  it("keeps authored blink and look-at detection after target aliases are normalized", () => {
    const root = new Object3D(), lookAt = new Object3D(), blink = Object.assign(new Object3D(), { weight: 0 });
    lookAt.name = "VRMLookAtQuaternionProxy"; blink.name = "VRMExpression_blink"; root.add(lookAt, blink);
    const clip = new AnimationClip("Authored", 1, [
      new QuaternionKeyframeTrack(lookAt.name + ".quaternion", [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
      new NumberKeyframeTrack(blink.name + ".weight", [0, 1], [0, 1]),
    ]);
    const player = new VrmAnimationPlayer(root, new Map([["Authored", clip]]), () => undefined);
    expect(player.hasLookAtTrack).toBe(false); expect(player.hasBlinkTrack).toBe(false);
    void player.play("Authored"); expect(player.hasLookAtTrack).toBe(true); expect(player.hasBlinkTrack).toBe(true);
    player.stop(); expect(player.hasLookAtTrack).toBe(false); expect(player.hasBlinkTrack).toBe(false);
    player.destroy();
  });
  it("preserves GLTF cubic sampling and shares source keyframe arrays when rebinding aliases", async () => {
    const raised = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);
    const values = new Float32Array([
      0, 1,
      0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0,
      0, 0, 0, 0, ...raised.toArray(), 0, 0, 0, 0,
    ]);
    const bytes = glb({
      asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: "Normalized_Head" }],
      buffers: [{ byteLength: values.byteLength }],
      bufferViews: [{ buffer: 0, byteLength: 8 }, { buffer: 0, byteOffset: 8, byteLength: values.byteLength - 8 }],
      accessors: [
        { bufferView: 0, componentType: 5126, count: 2, type: "SCALAR", min: [0], max: [1] },
        { bufferView: 1, componentType: 5126, count: 6, type: "VEC4" },
      ],
      animations: [{ name: "Cubic", samplers: [{ input: 0, output: 1, interpolation: "CUBICSPLINE" }], channels: [{ sampler: 0, target: { node: 0, path: "rotation" } }] }],
    }, Buffer.from(values.buffer));
    const { scene: root, animations: [clip] } = await new GLTFLoader().parseAsync(Uint8Array.from(bytes).buffer, "");
    const bone = root.children[0]!, track = clip!.tracks[0]! as QuaternionKeyframeTrack & { createInterpolant(result?: Float32Array): Interpolant };
    const player = new VrmAnimationPlayer(root, new Map([["Cubic", clip!]]), () => bone.quaternion.identity());
    const actions = vi.spyOn(player.mixer, "clipAction");
    void player.play("Cubic", { mode: "loop" });
    const rebound = (actions.mock.calls[0]![0] as AnimationClip).tracks[0]! as typeof track;
    expect(rebound).not.toBe(track); expect(rebound.name).toBe(bone.uuid + ".quaternion");
    expect(rebound.times).toBe(track.times); expect(rebound.values).toBe(track.values);
    expect(rebound.createInterpolant).toBe(track.createInterpolant);
    player.update(.25);
    const expected = new Quaternion().fromArray(track.createInterpolant().evaluate(.25));
    expect(bone.quaternion.angleTo(expected)).toBeCloseTo(0, 6);
    expect(track.name).toBe(bone.name + ".quaternion");
    player.destroy(); actions.mockRestore();
  });
  it("samples the authored blink closure and reopening", () => {
    const curve: [number, number][]=[[0,0],[3.4,0],[3.48,1],[3.52,1],[3.65,0],[4.7,0]];
    expect(sampleCurve(curve,3.44)).toBeCloseTo(.5); expect(sampleCurve(curve,3.5)).toBe(1); expect(sampleCurve(curve,4)).toBe(0);
  });
});
