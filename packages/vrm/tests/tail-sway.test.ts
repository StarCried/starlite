import { expect, it } from "vitest";
import { Object3D, Quaternion, Vector3 } from "three";
import { VRMSpringBoneJoint, VRMSpringBoneManager } from "@pixiv/three-vrm";
import { TailSway } from "../src/tail-sway.js";
import { validateModelAdjustments } from "../src/config.js";

function rig(rotated = false, physical = false) {
  const scene = new Object3D(), hips = new Object3D(), root = new Object3D(), tip = new Object3D();
  scene.add(hips); hips.add(root); root.add(tip); root.position.set(.1, .3, .1);
  tip.position.set(0, 0, .5);
  if (rotated) { scene.rotation.y = Math.PI; hips.rotation.z = .7; root.rotation.x = .4; }
  scene.updateMatrixWorld(true);
  const springs = new VRMSpringBoneManager();
  const joint = new VRMSpringBoneJoint(root, tip, {stiffness: 1.5, dragForce: .8, gravityPower: 0});
  if (physical) { springs.addJoint(joint); springs.setInitState(); }
  const sway = new TailSway(scene, new Map([["Tail.Root", [root]], ["duplicate", [root, tip]]]), springs);
  return { scene, hips, root, tip, springs, joint, sway };
}
function run(sway: TailSway, seconds: number, idle = true) { for (let n = 0; n < seconds * 120; n++) sway.update(1 / 120, idle); }

it("validates root-only configuration, bounds, fractional periods and explicit zero", () => {
  for (const tailSway of [{rootBone:"Tail.Root"}, {rootBone:"Tail.Root",amplitudeDegrees:0,periodSeconds:3}, {rootBone:"尾巴",amplitudeDegrees:50,periodSeconds:30}, {rootBone:"Tail",periodSeconds:10.5}]) expect(() => validateModelAdjustments({tailSway})).not.toThrow();
  for (const tailSway of [null,{}, {rootBone:""}, {rootBone:"a\n"}, {rootBone:"x",amplitudeDegrees:51}, {rootBone:"x",periodSeconds:0}, {rootBone:"x",periodSeconds:Infinity}, {rootBone:"x",axis:"y"}]) expect(() => validateModelAdjustments({tailSway})).toThrow("tailSway");
});
for (const rotated of [false, true]) it(`rotates horizontally about the root regardless of exported axes (${rotated})`, () => {
  const {scene,hips,root,tip,sway} = rig(rotated), local = root.quaternion.clone(), position = root.position.clone();
  const origin = root.getWorldPosition(new Vector3()), height = tip.getWorldPosition(new Vector3()).y;
  sway.set({rootBone:"Tail.Root",amplitudeDegrees:35,periodSeconds:10});
  const zero = tip.getWorldPosition(new Vector3());
  run(sway, 2.5); scene.updateMatrixWorld(true);
  expect(root.getWorldPosition(new Vector3()).distanceTo(origin)).toBeLessThan(1e-9);
  expect(tip.getWorldPosition(new Vector3()).y).toBeCloseTo(height, 9);
  expect(tip.getWorldPosition(new Vector3()).distanceTo(zero)).toBeGreaterThan(.2);
  expect(root.quaternion.toArray()).toEqual(local.toArray()); expect(root.position.toArray()).toEqual(position.toArray());
  run(sway, 5); scene.updateMatrixWorld(true); expect(tip.getWorldPosition(new Vector3()).y).toBeCloseTo(height, 9);
  sway.destroy(); sway.destroy(); scene.updateMatrixWorld(true);
  expect(hips.children).toEqual([root]); expect(tip.getWorldPosition(new Vector3()).distanceTo(zero)).toBeLessThan(1e-9);
});
it("edits live without replacing the driver, pauses phase and fades out for foreground motions", () => {
  const {root,sway} = rig(); sway.set({rootBone:"Tail.Root",amplitudeDegrees:35,periodSeconds:10});run(sway,2);
  const driver=root.parent!, before=driver.quaternion.clone();
  sway.update(0,true);expect(driver.quaternion.toArray()).toEqual(before.toArray());
  sway.set({rootBone:"Tail.Root",amplitudeDegrees:50,periodSeconds:8});
  expect(root.parent).toBe(driver);expect(driver.quaternion.toArray()).toEqual(before.toArray());
  sway.update(1/120,false);expect(driver.quaternion.angleTo(before)).toBeLessThan(.1);
  run(sway,1,false);expect(driver.quaternion.angleTo(new Quaternion())).toBeLessThan(.0001);
  run(sway,1);expect(driver.quaternion.angleTo(new Quaternion())).toBeGreaterThan(.05);
  sway.reset();expect(driver.quaternion.toArray()).toEqual([0,0,0,1]);
  sway.set();expect(root.parent).not.toBe(driver);
});
it("keeps the previous binding on invalid roots and preserves all real spring settings", () => {
  const {scene,root,tip,sway,joint,springs}=rig(false,true), settings={...joint.settings};
  sway.set({rootBone:"Tail.Root",amplitudeDegrees:35});const parent=root.parent;
  for(const rootBone of ["missing","duplicate"])expect(()=>sway.set({rootBone})).toThrow("rootBone");
  expect(root.parent).toBe(parent);
  const original=tip.getWorldPosition(new Vector3());
  for(let i=0;i<300;i++){sway.update(1/120,true);springs.update(1/120);scene.updateMatrixWorld(true);}
  expect(tip.getWorldPosition(new Vector3()).distanceTo(original)).toBeGreaterThan(.05);
  expect(joint.settings).toEqual(settings);expect([...springs.joints]).toEqual([joint]);
  sway.destroy();springs.update(1/120);expect(joint.settings).toEqual(settings);
});
