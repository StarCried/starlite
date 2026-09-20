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
