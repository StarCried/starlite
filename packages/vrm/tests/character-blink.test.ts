import { expect, it } from "vitest";
import { BufferGeometry, Float32BufferAttribute, Mesh, MeshBasicMaterial, Object3D, Vector3 } from "three";
import { VRMExpression, VRMExpressionManager, VRMExpressionMorphTargetBind, type VRM } from "@pixiv/three-vrm";
import { CharacterBehavior } from "../src/character.js";
import type { CharacterProfile } from "../src/types.js";

// Two eyelid vertices, one unit apart in Basis. Each expression recipe is an
// actual relative morph, and each correction is the delta from its expression
// to the same fully closed pose. No private model geometry is used here.
function eyelids() {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute([0, .5, 0, 0, -.5, 0], 3));
  geometry.morphTargetsRelative = true;
  const closure = [1, .25, .75, .6, .4, 1];
  geometry.morphAttributes.position = closure.map((amount) => new Float32BufferAttribute([0, -.5 * amount, 0, 0, .5 * amount, 0], 3));
  const mesh = new Mesh(geometry, new MeshBasicMaterial());
  mesh.morphTargetDictionary = { Blink: 0, Happy: 1, HappyBlink: 2, Tease: 3, TeaseBlink: 4, Proud: 5 };
  const scene = new Object3D(), collar = new Object3D(), cone = new Object3D();
  collar.name = "Collar"; cone.name = "Cone"; scene.add(mesh, collar, cone);
  const manager = new VRMExpressionManager();
  for (const [name, index] of [["blink", 0], ["happy", 1], ["Tease", 3], ["relaxed", 5]] as const) {
    const expression = new VRMExpression(name);
    expression.addBind(new VRMExpressionMorphTargetBind({ primitives: [mesh], index, weight: 1 }));
    manager.registerExpression(expression);
  }
  const profile: CharacterProfile = {
    schemaVersion: 1, type: "weiguang", neutralPose: {}, earBones: [],
    earPoses: { Neutral: {}, Happy: {}, Tease: {}, Proud: {} },
    expressions: { Happy: { expression: "happy", blink: "HappyBlink" }, Tease: { expression: "Tease", blink: "TeaseBlink" }, Proud: { expression: "relaxed" } },
    accessories: { collar: "Collar", cone: "Cone", collarVisible: true, coneVisible: false },
    blink: { period: 5, curve: [[0, 0], [.1, 1], [.2, 0], [5, 0]] },
  };
  const behavior = new CharacterBehavior({ scene, expressionManager: manager } as unknown as VRM, profile);
  behavior.afterExpressions();
  return {
    manager, behavior, mesh,
    frame(delta: number, authored = false) { behavior.beforeExpressions(delta, authored); manager.update(); behavior.afterExpressions(); },
    gap() { return mesh.getVertexPosition(0, new Vector3()).y - mesh.getVertexPosition(1, new Vector3()).y; },
  };
}

it.each([0, .1, .4, .7, 1])("fully closes the remaining neutral eyelids at expression weight %s", (weight) => {
  const f = eyelids(); f.manager.setValue("happy", weight);
  f.frame(.1); expect(f.gap()).toBeCloseTo(0);
  f.frame(.1); expect(f.gap()).toBeCloseTo(1 - .25 * weight);
  expect(f.mesh.morphTargetInfluences![2]).toBe(0);
});

it("closes a partial mix of two distinct eye shapes, then restores both shapes", () => {
  const f = eyelids(); f.manager.setValue("happy", .3); f.manager.setValue("Tease", .4);
  f.frame(.1); expect(f.gap()).toBeCloseTo(0);
  f.frame(.1); expect(f.gap()).toBeCloseTo(1 - .3 * .25 - .4 * .6);
});

it("preserves fully closed recipes while closing their remaining Basis share", () => {
  const f = eyelids(); f.manager.setValue("relaxed", .4);
  f.frame(.1); expect(f.gap()).toBeCloseTo(0);
  f.frame(.1); expect(f.gap()).toBeCloseTo(.6);
  f.manager.setValue("relaxed", 1); f.frame(4.9); expect(f.gap()).toBeCloseTo(0);
});

it("mixes an already closed recipe with an open-eye recipe without over-closing", () => {
  const f = eyelids(); f.manager.setValue("relaxed", .3); f.manager.setValue("happy", .4);
  f.frame(.1); expect(f.gap()).toBeCloseTo(0);
  f.frame(.1); expect(f.gap()).toBeCloseTo(.6);
});

it("closes throughout a continuous gesture fade and then returns to open Basis", () => {
  const f = eyelids(); f.manager.setValue("happy", .4); f.frame(.1);
  for (const weight of [.7, 1, .4, .1, 0]) {
    f.manager.setValue("happy", weight); f.frame(0); expect(f.gap()).toBeCloseTo(0);
  }
  f.frame(.2); expect(f.gap()).toBeCloseTo(1);
  expect(f.mesh.morphTargetInfluences).toEqual([0, 0, 0, 0, 0, 0]);
});

it("does not leave a custom correction behind when a gesture fades to neutral", () => {
  const f = eyelids(); f.manager.setValue("happy", .4); f.frame(.1); expect(f.gap()).toBeCloseTo(0);
  f.manager.setValue("happy", 0); f.frame(.1);
  expect(f.gap()).toBeCloseTo(1); expect(f.mesh.morphTargetInfluences![2]).toBe(0);
  f.frame(.1); expect(f.gap()).toBeCloseTo(0);
});

it("uses authored blink timing while closing a partial emotion without double closure", () => {
  const f = eyelids(); f.manager.setValue("happy", .4); f.manager.setValue("blink", 1);
  f.frame(.05, true); expect(f.gap()).toBeCloseTo(0);
  expect(f.manager.getValue("blink")).toBe(1);
  f.manager.setValue("blink", 0); f.frame(.05, true);
  expect(f.gap()).toBeCloseTo(.9); expect(f.mesh.morphTargetInfluences![2]).toBe(0);
});

it.each([0, .3, 1])("preserves authored blink progress %s over a partial emotion", (amount) => {
  const f = eyelids(); f.manager.setValue("happy", .4); f.manager.setValue("blink", amount);
  f.frame(.1, true);
  expect(f.gap()).toBeCloseTo(.9 * (1 - amount)); expect(f.manager.getValue("blink")).toBe(amount);
});

it("keeps additive expression semantics above unit total and clamps the neutral share", () => {
  const f = eyelids(); f.manager.setValue("happy", .8); f.manager.setValue("Tease", .7);
  f.frame(.1);
  expect(f.manager.getValue("blink")).toBe(0);
  expect(f.manager.getValue("happy")).toBe(.8); expect(f.manager.getValue("Tease")).toBe(.7);
  // The existing additive blend extrapolates at totals above one; no negative
  // ordinary Blink weight or hidden normalization is introduced to conceal it.
  expect(f.gap()).toBeCloseTo(-.5);
});

it("switches from authored timing back to natural timing without retaining its correction", () => {
  const f = eyelids(); f.manager.setValue("happy", .4); f.manager.setValue("blink", 1);
  f.frame(.2, true); expect(f.gap()).toBeCloseTo(0);
  f.frame(0); expect(f.gap()).toBeCloseTo(.9); expect(f.mesh.morphTargetInfluences![2]).toBe(0);
});

// Separate left/right lids prove that the paired standard presets affect both
// eyes, rather than merely writing expression names without visible movement.
function standardEyelids(presets: readonly string[]) {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute([-.5, .5, 0, -.5, -.5, 0, .5, .5, 0, .5, -.5, 0], 3));
  geometry.morphTargetsRelative = true;
  geometry.morphAttributes.position = [
    [0, -.5, 0, 0, .5, 0, 0, -.5, 0, 0, .5, 0],
    [0, -.5, 0, 0, .5, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, -.5, 0, 0, .5, 0],
  ].map(values => new Float32BufferAttribute(values, 3));
  const mesh = new Mesh(geometry, new MeshBasicMaterial()), scene = new Object3D(), manager = new VRMExpressionManager();
  scene.add(mesh);
  for (const name of presets) {
    const expression = new VRMExpression(name);
    if (name !== "emptyBlink") expression.addBind(new VRMExpressionMorphTargetBind({ primitives: [mesh], index: name === "blinkLeft" ? 1 : name === "blinkRight" ? 2 : 0, weight: 1 }));
    else expression.expressionName = "blink";
    manager.registerExpression(expression);
  }
  const behavior = new CharacterBehavior({ scene, expressionManager: manager } as unknown as VRM);
  return {
    manager,
    frame(delta: number, authored = false) { behavior.beforeExpressions(delta, authored); manager.update(); behavior.afterExpressions(); },
    gaps() { return [0, 2].map(index => mesh.getVertexPosition(index, new Vector3()).y - mesh.getVertexPosition(index + 1, new Vector3()).y); },
  };
}

it.each([["blinkLeft", "blinkRight"], ["emptyBlink", "blinkLeft", "blinkRight"]])("naturally closes and reopens both lids through %j", (...presets) => {
  const f = standardEyelids(presets);
  f.frame(3.5); expect(f.gaps()).toEqual([0, 0]);
  f.frame(.2); expect(f.gaps()).toEqual([1, 1]);
});

it.each([[], ["blinkLeft"], ["blinkRight"], ["emptyBlink"]])("keeps lids open without a complete usable blink capability: %j", (...presets) => {
  const f = standardEyelids(presets), names = f.manager.expressions.map(expression => expression.expressionName);
  f.frame(3.5); expect(f.gaps()).toEqual([1, 1]);
  expect(f.manager.expressions.map(expression => expression.expressionName)).toEqual(names);
});

it("preserves authored asymmetric blinks on a standard paired model", () => {
  const f = standardEyelids(["blinkLeft", "blinkRight"]);
  f.manager.setValue("blinkLeft", .25); f.manager.setValue("blinkRight", .75);
  f.frame(3.5, true); expect(f.gaps()).toEqual([.75, .25]);
  f.frame(0); expect(f.gaps()).toEqual([0, 0]);
});

it("keeps an authored wink available when automatic blink is unavailable", () => {
  const f = standardEyelids(["blinkLeft"]);
  f.manager.setValue("blinkLeft", 1); f.frame(3.5, true);
  expect(f.gaps()).toEqual([0, 1]);
});

it("prefers a usable combined Blink without double-closing through the paired presets", () => {
  const f = standardEyelids(["blink", "blinkLeft", "blinkRight"]);
  f.frame(3.5); expect(f.gaps()).toEqual([0, 0]);
  expect(f.manager.getValue("blinkLeft")).toBe(0); expect(f.manager.getValue("blinkRight")).toBe(0);
});
