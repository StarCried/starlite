import {expect,it,vi} from "vitest";
import {Object3D,Quaternion,SkinnedMesh,Vector3} from "three";
import {VRMSpringBoneJoint,VRMSpringBoneManager,VRMExpression,VRMExpressionMorphTargetBind,type VRM} from "@pixiv/three-vrm";
import {CharacterBehavior} from "../src/character.js";
import type {CharacterProfile} from "../src/types.js";
function fixture(){
 const scene=new Object3D(), ear=new Object3D(),collar=new Object3D(),cone=new Object3D(),mesh=new SkinnedMesh();
 ear.name="EarL";ear.userData.name="Ear.L";collar.name="Collar";cone.name="Cone";scene.add(ear,collar,cone,mesh);
 mesh.morphTargetDictionary={ExprBlink_Happy:0,ExprBlink_Tease:1};mesh.morphTargetInfluences=[0,0];
 const values=new Map<string,number>(),init=vi.fn();
 const blinkMesh=new SkinnedMesh();blinkMesh.morphTargetInfluences=[0];const blink=new VRMExpression("blink");blink.addBind(new VRMExpressionMorphTargetBind({primitives:[blinkMesh],index:0,weight:1}));
 const manager={getExpression:(name:string)=>name==="blink"?blink:({}),getValue:(name:string)=>values.get(name)??0,setValue:(name:string,value:number)=>values.set(name,value)};
 const vrm={scene,expressionManager:manager,springBoneManager:{joints:[{bone:ear,setInitState:init}]}} as unknown as VRM;
 const pose={"Ear.L":{rotation:[0,0,0,1] as [number,number,number,number]}};
 const profile:CharacterProfile={schemaVersion:1,type:"weiguang",neutralPose:{},earBones:["Ear.L"],earPoses:{Neutral:pose,Happy:pose,Tease:pose,Proud:pose},expressions:{Happy:{expression:"happy",blink:"ExprBlink_Happy"},Tease:{expression:"Tease",blink:"ExprBlink_Tease"},Proud:{expression:"relaxed"}},accessories:{collar:"Collar",cone:"Cone",collarVisible:true,coneVisible:false},blink:{period:5,curve:[[0,0],[.1,1],[.2,0],[5,0]]}};
 return {vrm,profile,mesh,values,init,collar,cone};
}
it("natural blink yields to authored blink tracks",()=>{
 const f=fixture(), behavior=new CharacterBehavior(f.vrm);behavior.beforeExpressions(3.5);expect(f.values.get("blink")).toBe(1);
 f.values.set("blink",.4);behavior.beforeExpressions(.1,true);expect(f.values.get("blink")).toBe(.4);
});
it("fixed expressions use their custom blink recipe and preserve Proud closed eyes",()=>{
 const f=fixture(), behavior=new CharacterBehavior(f.vrm,f.profile);behavior.afterExpressions();
 f.values.set("Tease",1);behavior.beforeExpressions(.1);behavior.afterExpressions();
 expect(f.values.get("blink")).toBe(0);expect(f.mesh.morphTargetInfluences).toEqual([0,1]);
 f.values.set("Tease",0);f.values.set("relaxed",1);behavior.beforeExpressions(0);behavior.afterExpressions();
 expect(f.mesh.morphTargetInfluences).toEqual([0,0]);expect(f.values.get("relaxed")).toBe(1);
});
it("sets accessory defaults and only resets ear spring rest state on changes",()=>{
 const f=fixture(), behavior=new CharacterBehavior(f.vrm,f.profile);expect(f.collar.visible).toBe(true);expect(f.cone.visible).toBe(false);
 behavior.afterExpressions();expect(f.init).toHaveBeenCalledOnce();behavior.afterExpressions();expect(f.init).toHaveBeenCalledOnce();
 f.values.set("happy",1);behavior.afterExpressions();expect(f.init).toHaveBeenCalledTimes(2);
});

it.each([30,60])("keeps ear rest matrices consistent with a fading authored pose at %s FPS",fps=>{
 const f=fixture(), root=f.vrm.scene, first=root.getObjectByName("EarL")!, second=new Object3D(), tail=new Object3D();
 second.name="EarTip";second.userData.name="Ear.L.001";second.position.y=.3;tail.position.y=.2;first.add(second);second.add(tail);root.updateMatrixWorld(true);
 const joints=[new VRMSpringBoneJoint(first,second,{stiffness:12,dragForce:.8}),new VRMSpringBoneJoint(second,tail,{stiffness:12,dragForce:.8})];
 const manager=new VRMSpringBoneManager();for(const joint of joints)manager.addJoint(joint);manager.setInitState();
 Object.assign(f.vrm,{springBoneManager:manager});
 const neutral=new Quaternion(), target=new Quaternion().setFromAxisAngle(new Vector3(0,0,1),.7);
 f.profile.earBones.push("Ear.L.001");
 for(const poses of Object.values(f.profile.earPoses))poses["Ear.L.001"]={rotation:neutral.toArray()};
 // Other fixture recipes share Neutral, so replace Happy rather than mutate it.
 f.profile.earPoses.Happy={"Ear.L":{rotation:target.toArray()},"Ear.L.001":{rotation:target.toArray()}};
 const behavior=new CharacterBehavior(f.vrm,f.profile), matrixRotation=new Quaternion(), scale=new Vector3(), position=new Vector3();
 for(const weight of [0,.2,.4,.6,.8,1,.8,.6,.4,.2,0]){
  f.values.set("happy",weight);behavior.afterExpressions();
  const expected=neutral.clone().slerp(target,weight);
  for(const bone of [first,second]){
   bone.matrix.decompose(position,matrixRotation,scale);
   expect(matrixRotation.angleTo(expected)).toBeLessThan(1e-6);
  }
  manager.update(1/fps);
  for(const bone of [first,second])expect(bone.quaternion.angleTo(expected)).toBeLessThan(1e-6);
 }
 for(let frame=0;frame<fps;frame++){behavior.afterExpressions();manager.update(1/fps);}
 for(const bone of [first,second])expect(bone.quaternion.angleTo(neutral)).toBeLessThan(1e-6);
});
