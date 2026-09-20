import { describe, expect, it } from "vitest";
import { AnimationClip, NumberKeyframeTrack, Object3D } from "three";
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
  it("shares an identical playback unless restart is explicit", async () => {
    const { player } = harness();
    const first=player.play("Idle", {mode:"loop"}); expect(player.play("Idle", {mode:"loop"})).toBe(first);
    const next=player.play("Idle", {mode:"loop",restart:true}); expect(await first).toBe("interrupted");
    player.stop(); expect(await next).toBe("stopped");
  });
  it("samples the authored blink closure and reopening", () => {
    const curve: [number, number][]=[[0,0],[3.4,0],[3.48,1],[3.52,1],[3.65,0],[4.7,0]];
    expect(sampleCurve(curve,3.44)).toBeCloseTo(.5); expect(sampleCurve(curve,3.5)).toBe(1); expect(sampleCurve(curve,4)).toBe(0);
  });
});
