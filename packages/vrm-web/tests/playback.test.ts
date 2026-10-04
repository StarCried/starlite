import { describe, expect, it } from "vitest";
import { AnimationClip, NumberKeyframeTrack, QuaternionKeyframeTrack, Quaternion, Object3D } from "three";
import { VrmAnimationPlayer } from "../src/playback.js";
import { sampleCurve } from "../src/character.js";

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
    player.update(.1); expect(root.position.x).toBeCloseTo(1.5);
    player.update(.11); expect(root.position.x).toBe(0);
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
    player.update(.1); expect(root.position.x).toBeCloseTo(.6);
    player.update(.1); expect(root.position.x).toBeCloseTo(.4);
    player.stop(); expect(await click).toBe("stopped"); expect(root.position.x).toBe(0);
  });
  it("blends bone rotations as quaternions without a neutral rotation snap", () => {
    const root = new Object3D();
    const raised = new Quaternion(0, Math.SQRT1_2, 0, Math.SQRT1_2);
    const clip = new AnimationClip("gesture", 1, [new QuaternionKeyframeTrack(".quaternion", [0,.5,1], [0,0,0,1,...raised.toArray(),0,0,0,1])]);
    const player = new VrmAnimationPlayer(root, new Map([["first",clip],["second",clip.clone()]]),()=>root.quaternion.identity());
    void player.play("first"); player.update(.5);
    void player.play("second"); expect(root.quaternion.angleTo(raised)).toBeCloseTo(0);
    player.update(.1); expect(root.quaternion.angleTo(new Quaternion())).toBeCloseTo(Math.PI*.3);
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
    player.update(.3); expect(player.mixer.stats.actions.inUse).toBe(1);
    player.destroy(); expect(player.mixer.stats.actions.inUse).toBe(0);
  });
  it("samples the authored blink closure and reopening", () => {
    const curve: [number, number][]=[[0,0],[3.4,0],[3.48,1],[3.52,1],[3.65,0],[4.7,0]];
    expect(sampleCurve(curve,3.44)).toBeCloseTo(.5); expect(sampleCurve(curve,3.5)).toBe(1); expect(sampleCurve(curve,4)).toBe(0);
  });
});
