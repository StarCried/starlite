import { expect, it, vi } from "vitest";
import { Object3D, PerspectiveCamera } from "three";
import { VRMLookAt, type VRMHumanoid } from "@pixiv/three-vrm";
import { PointerGaze } from "../src/gaze.js";
import { validateVrmWidgetConfig } from "../src/config.js";

function fixture(version: string) {
  const root = new Object3D(), head = new Object3D(); root.add(head); head.position.y = 1.6; root.updateMatrixWorld(true);
  const applyYawPitch = vi.fn();
  const look = new VRMLookAt({ getRawBoneNode: () => head } as unknown as VRMHumanoid, { applyYawPitch });
  if (version === "0") { look.faceFront.set(0,0,-1); root.rotation.y = Math.PI; root.updateMatrixWorld(true); }
  const camera = new PerspectiveCamera(20, 2/3, .01, 100); camera.position.set(0,1.6,4); camera.lookAt(0,1.6,0); camera.updateMatrixWorld(true);
  return { look, camera, applyYawPitch };
}
for (const version of ["0", "1"]) it(`tracks both sides with smooth bounded VRM${version} gaze`, () => {
  const { look, camera } = fixture(version), gaze = new PointerGaze();
  const rect = { left:100, top:100, width:260, height:390 };
  gaze.move(10000,-10000,rect); gaze.update(look,camera,.033,false);
  const first = look.yaw; expect(Math.abs(first)).toBeGreaterThan(0); expect(Math.abs(first)).toBeLessThan(25);
  for(let i=0;i<100;i++) gaze.update(look,camera,.033,false);
  expect(Math.abs(look.yaw)).toBeCloseTo(25); expect(Math.abs(look.pitch)).toBeCloseTo(15);
  gaze.move(-10000,10000,rect);
  for(let i=0;i<100;i++) gaze.update(look,camera,.033,false);
  expect(look.yaw * first).toBeLessThan(0); expect(Math.abs(look.yaw)).toBeLessThanOrEqual(25);
  gaze.reset(); for(let i=0;i<100;i++) gaze.update(look,camera,.033,false);
  expect(look.yaw).toBeCloseTo(0); expect(look.pitch).toBeCloseTo(0);
});
it("yields to authored gaze and does not jump after pause", () => {
  const {look,camera}=fixture("1"),gaze=new PointerGaze();
  look.yaw=12;look.pitch=-8;gaze.update(look,camera,.1,true);
  expect(look.yaw).toBe(12);expect(look.pitch).toBe(-8);
  gaze.update(look,camera,0,false);expect(look.yaw).toBe(12);
});
it("rejects non-finite and excessive gaze limits",()=>{
  for(const gaze of [{maxYawDegrees:NaN},{maxPitchDegrees:90},{smoothingMs:0}])
    expect(()=>validateVrmWidgetConfig({model:"x.vrm",fallback:"x.png",gaze})).toThrow();
});

it("keeps following across the page outside a corner canvas instead of pinning to the angle limit", () => {
  const { look, camera } = fixture("1"), gaze = new PointerGaze();
  const rect = { left: 1014, top: 928, width: 260, height: 390 };
  const angles: number[] = [];
  for (const x of [240, 600, 950, 1144]) {
    gaze.move(x, 1123, rect, { width: 1296, height: 1318 });
    for (let i=0; i<100; i++) gaze.update(look, camera, .033, false);
    angles.push(look.yaw);
  }
  expect(new Set(angles.map(angle => angle.toFixed(1))).size).toBe(4);
  expect(Math.abs(angles[0]!)).toBeLessThan(25);
  expect(Math.abs(angles[0]!)).toBeGreaterThan(Math.abs(angles[1]!));
  expect(Math.abs(angles[1]!)).toBeGreaterThan(Math.abs(angles[2]!));
  expect(angles[3]).toBeCloseTo(0);
});

for (const version of ["0", "1"]) it(`turns the VRM${version} head visibly without accumulating or overwriting authored pose`,()=>{
 const {camera}=fixture(version),root=new Object3D(),head=new Object3D();root.add(head);head.position.y=1.6;
 root.rotation.y=version==="0"?Math.PI:0;root.updateMatrixWorld(true);
 const gaze=new PointerGaze(),base=head.quaternion.clone(),rect={left:100,top:100,width:260,height:390};
 gaze.move(10000,-10000,rect);
 for(let i=0;i<100;i++){gaze.restoreHead();gaze.updateHead(head,camera,.033,false);}
 expect(gaze.headAngles.yawDegrees).toBeCloseTo(15);expect(gaze.headAngles.pitchDegrees).toBeCloseTo(9);
 expect(head.quaternion.angleTo(base)).toBeGreaterThan(.2);expect(head.quaternion.angleTo(base)).toBeLessThan(.4);
 gaze.restoreHead();expect(head.quaternion.angleTo(base)).toBeCloseTo(0);
 head.rotation.z=.1;const authored=head.quaternion.clone();gaze.updateHead(head,camera,.033,true);
 expect(head.quaternion.angleTo(authored)).toBeCloseTo(0);
});

it("adjusts head and eye response independently, preserves limits and resets each zero strength", () => {
 const {look,camera}=fixture("1"),head=new Object3D(),gaze=new PointerGaze(),rect={left:100,top:100,width:260,height:390};
 head.position.y=1.6;head.updateMatrixWorld(true);gaze.move(10000,-10000,rect);
 gaze.setAdjustments({headStrength:.5,eyeStrength:0});
 for(let i=0;i<100;i++){gaze.updateHead(head,camera,.033,false);gaze.update(look,camera,.033,false);}
 expect(gaze.headAngles.yawDegrees).toBeCloseTo(7.5);expect(gaze.headAngles.pitchDegrees).toBeCloseTo(4.5);
 expect(look.yaw).toBe(0);expect(look.pitch).toBe(0);
 gaze.setAdjustments({headStrength:0,eyeStrength:.5});
 for(let i=0;i<100;i++){gaze.updateHead(head,camera,.033,false);gaze.update(look,camera,.033,false);}
 expect(gaze.headAngles.yawDegrees).toBe(0);expect(head.quaternion.angleTo(new Object3D().quaternion)).toBeCloseTo(0);
 expect(Math.abs(look.yaw)).toBeCloseTo(12.5);expect(Math.abs(look.pitch)).toBeCloseTo(7.5);
 gaze.setAdjustments({headStrength:2,eyeStrength:2});
 for(let i=0;i<100;i++){gaze.updateHead(head,camera,.033,false);gaze.update(look,camera,.033,false);}
 expect(Math.abs(gaze.headAngles.yawDegrees)).toBeLessThanOrEqual(25);expect(Math.abs(gaze.headAngles.pitchDegrees)).toBeLessThanOrEqual(15);
 expect(Math.abs(look.yaw)).toBeLessThanOrEqual(25);expect(Math.abs(look.pitch)).toBeLessThanOrEqual(15);
 look.yaw=8;look.pitch=5;gaze.setAdjustments({headStrength:0,eyeStrength:0});gaze.update(look,camera,.1,true);
 expect(look.yaw).toBe(8);expect(look.pitch).toBe(5); // Authored action still owns the eyes.
 gaze.setAdjustments({});gaze.updateHead(head,camera,.1,false);expect(gaze.headAngles.yawDegrees).toBeGreaterThan(0);
});

it("changes smoothing without changing the final target or mutating caller configuration", () => {
 const fast=fixture("1"),slow=fixture("1"),a=new PointerGaze(),b=new PointerGaze(),rect={left:100,top:100,width:260,height:390};
 const settings={eyeStrength:1,smoothingMs:20};a.setAdjustments(settings);settings.eyeStrength=0;
 b.setAdjustments({smoothingMs:1000});a.move(10000,-10000,rect);b.move(10000,-10000,rect);
 a.update(fast.look,fast.camera,.033,false);b.update(slow.look,slow.camera,.033,false);
 expect(Math.abs(fast.look.yaw)).toBeGreaterThan(Math.abs(slow.look.yaw)*5);
 for(let i=0;i<300;i++){a.update(fast.look,fast.camera,.033,false);b.update(slow.look,slow.camera,.033,false);}
 expect(Math.abs(fast.look.yaw)).toBeCloseTo(Math.abs(slow.look.yaw),2);
});
