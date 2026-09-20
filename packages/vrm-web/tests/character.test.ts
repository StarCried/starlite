import {expect,it,vi} from "vitest";
import {Object3D,SkinnedMesh} from "three";
import type {VRM} from "@pixiv/three-vrm";
import {CharacterBehavior} from "../src/character.js";
import type {CharacterProfile} from "../src/types.js";
function fixture(){
 const scene=new Object3D(), ear=new Object3D(),collar=new Object3D(),cone=new Object3D(),mesh=new SkinnedMesh();
 ear.name="EarL";ear.userData.name="Ear.L";collar.name="Collar";cone.name="Cone";scene.add(ear,collar,cone,mesh);
 mesh.morphTargetDictionary={ExprBlink_Happy:0,ExprBlink_Tease:1};mesh.morphTargetInfluences=[0,0];
 const values=new Map<string,number>(),init=vi.fn();
 const manager={getExpression:()=>({}),getValue:(name:string)=>values.get(name)??0,setValue:(name:string,value:number)=>values.set(name,value)};
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
