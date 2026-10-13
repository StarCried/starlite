import { expect, it } from "vitest";
import { Object3D, PerspectiveCamera, Quaternion, Vector3 } from "three";
import { VRMSpringBoneJoint, VRMSpringBoneManager } from "@pixiv/three-vrm";
import { HostMotion } from "../src/host-motion.js";

function rig(center: boolean) {
 const root=new Object3D(), bone=new Object3D(), tail=new Object3D();tail.position.y=.3;bone.add(tail);root.add(bone);root.updateMatrixWorld(true);
 const joint=new VRMSpringBoneJoint(bone,tail,{stiffness:1.5,dragForce:.45,gravityPower:0});if(center)joint.center=root;
 const manager=new VRMSpringBoneManager();manager.addJoint(joint);manager.setInitState();
 const camera=new PerspectiveCamera(30,2/3);camera.position.set(0,1,4);camera.lookAt(0,1,0);camera.updateMatrixWorld(true);
 return {root,bone,joint,manager,camera,motion:new HostMotion(root,manager)};
}
for(const centered of [false,true])it(`uses real spring inertia when dragging with ${centered?'avatar-relative':'world'} physics, then settles`,()=>{
 const {root,bone,camera,motion,joint}=rig(centered), original=bone.quaternion.clone();
 motion.setPosition(100,100);motion.update(1/30,camera,480);expect(bone.quaternion.angleTo(original)).toBeLessThan(.001);
 motion.setPosition(160,100);motion.update(1/30,camera,480);
 const moved=bone.quaternion.angleTo(original);expect(moved).toBeGreaterThan(.03);expect(moved).toBeLessThan(1);
 expect(root.position.equals(new Vector3())).toBe(true); // Canvas framing does not translate.
 for(let i=0;i<180;i++)motion.update(1/30,camera,480);
 expect(bone.quaternion.angleTo(original)).toBeLessThan(.01);
 motion.destroy();expect(joint.center).toBe(centered?root:null);
});
it('rejects invalid movement, bounds fast drags and drops paused input',()=>{
 const {root,bone,camera,motion}=rig(true);
 for(const point of [[NaN,0],[0,Infinity],[65537,0]])expect(()=>motion.setPosition(point[0]!,point[1]!)).toThrow('invalid host position');
 motion.setPosition(0,0);motion.setPosition(60000,-60000);motion.update(1/30,camera,480);
 expect(bone.quaternion.angleTo(new Quaternion())).toBeLessThan(1);expect(root.position.length()).toBe(0);
 for(let i=0;i<180;i++)motion.update(1/30,camera,480);
 motion.setPosition(-60000,60000);motion.suspend();motion.setPosition(10,10);
 motion.update(1/30,camera,480);expect(bone.quaternion.angleTo(new Quaternion())).toBeLessThan(.01);
 motion.destroy();motion.destroy();
});

for(const centered of [false,true])it(`captures changed spring rest poses in the same ${centered?'centered':'world'} physics space after a drag`,()=>{
 const {root,bone,camera,motion,joint}=rig(centered), axis=new Vector3(0,0,1);
 motion.setPosition(0,0);
 for(let step=1;step<=3;step++){motion.setPosition(step*100,0);motion.update(1/60,camera,480);}
 for(let frame=0;frame<60;frame++)motion.update(1/60,camera,480);
 // The canvas returns to its drawing origin after each simulated frame, while
 // the spring tails retain the cumulative host movement in physics space.
 expect(root.position.length()).toBe(0);
 let captured=0;
 for(const delta of [0,1/60,1/30,.1,1/60]){
  const target=new Quaternion().setFromAxisAngle(axis,.1*++captured);
  motion.update(delta,camera,480,()=>{
   expect(root.position.length()).toBeGreaterThan(.1);
   bone.quaternion.copy(target);bone.updateMatrix();root.updateMatrixWorld(true);
   joint.setInitState();
  });
  expect(root.position.length()).toBe(0);
  expect(bone.quaternion.angleTo(target)).toBeLessThan(1e-6);
 }
 motion.destroy();
});

it('runs pre-physics work without springs and restores the drawing origin if it fails',()=>{
 const root=new Object3D(), camera=new PerspectiveCamera(), noSprings=new HostMotion(root);
 let calls=0;noSprings.update(0,camera,480,()=>{calls++;});expect(calls).toBe(1);
 const f=rig(false);f.motion.setPosition(0,0);f.motion.setPosition(100,0);f.motion.update(1/60,f.camera,480);
 expect(()=>f.motion.update(0,f.camera,480,()=>{throw new Error('rest failed');})).toThrow('rest failed');
 expect(f.root.position.length()).toBe(0);f.motion.destroy();noSprings.destroy();
});
