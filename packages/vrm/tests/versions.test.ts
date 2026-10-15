import {inspectVrm,parseGlb} from "../src/inspect.js";
import {expect,it} from "vitest";
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";
import {AnimationMixer} from "three";
import {VRMLoaderPlugin,VRMUtils} from "@pixiv/three-vrm";
import {VRMAnimationLoaderPlugin,createVRMAnimationClip} from "@pixiv/three-vrm-animation";
import {CharacterBehavior} from "../src/character.js";
import {defaultIdleBytes} from "../src/default-idle.js";
import {createHash} from "node:crypto";
// @ts-expect-error test fixture generator is plain JavaScript
import {model,motion,glb} from "../../../tests/fixtures/vrm.mjs";
for(const version of ["0","1"])it(`loads actual VRM${version} and retargets a VRMA clip`,async()=>{
 const loader=new GLTFLoader();loader.register(parser=>new VRMLoaderPlugin(parser));
 const {userData:{vrm}}=await loader.parseAsync(Uint8Array.from(model(version)).buffer,"");
 expect(vrm).toBeTruthy();VRMUtils.rotateVRM0(vrm);
 const motionLoader=new GLTFLoader();motionLoader.register(parser=>new VRMAnimationLoaderPlugin(parser));
 const {userData:{vrmAnimations}}=await motionLoader.parseAsync(Uint8Array.from(motion()).buffer,"");
 const clip=createVRMAnimationClip(vrmAnimations[0],vrm);const mixer=new AnimationMixer(vrm.scene);mixer.clipAction(clip).play();mixer.update(.5);vrm.humanoid.update();
 expect(Math.abs(vrm.humanoid.getNormalizedBoneNode("head").quaternion.z)).toBeGreaterThan(.1);
 mixer.stopAllAction();mixer.uncacheRoot(vrm.scene);VRMUtils.deepDispose(vrm.scene);
});

for(const version of ["0","1"])it(`retargets the approved bundled Idle on VRM${version} without animation files`,async()=>{
 const bytes=defaultIdleBytes();expect(createHash('sha256').update(new Uint8Array(bytes)).digest('hex')).toBe('7bd5ce630f5f624c274ad2de026ad5365297c353d7f265654ed97656a738d248');
 const loader=new GLTFLoader();loader.register(parser=>new VRMLoaderPlugin(parser));
 const {userData:{vrm}}=await loader.parseAsync(Uint8Array.from(model(version)).buffer,'');VRMUtils.rotateVRM0(vrm);
 const motionLoader=new GLTFLoader();motionLoader.register(parser=>new VRMAnimationLoaderPlugin(parser));
 const {userData:{vrmAnimations}}=await motionLoader.parseAsync(bytes,'');const clip=createVRMAnimationClip(vrmAnimations[0],vrm);
 expect(clip.duration).toBeCloseTo(6);expect(clip.tracks.length).toBeGreaterThan(0);
 expect(clip.tracks.every(track=>Array.from(track.values).every(Number.isFinite))).toBe(true);
 const mixer=new AnimationMixer(vrm.scene);mixer.clipAction(clip).play();
 for(let i=0;i<300;i++){mixer.update(1/30);vrm.humanoid.update();}
 expect(vrm.humanoid.getNormalizedBoneNode('leftUpperArm').quaternion.angleTo(new (await import('three')).Quaternion())).toBeGreaterThan(.1);
 mixer.stopAllAction();mixer.uncacheRoot(vrm.scene);VRMUtils.deepDispose(vrm.scene);
});

it("rejects non-finite binary geometry and incomplete humanoid imports",()=>{
 const bytes=Uint8Array.from(model()).buffer, view=new DataView(bytes), binary=28+view.getUint32(12,true);view.setFloat32(binary,NaN,true);
 expect(()=>inspectVrm(bytes)).toThrow("non-finite");
 const valid=Uint8Array.from(model()).buffer;expect(inspectVrm(valid).version).toBe("1");
 expect(parseGlb(valid,"vrm").nodes.length).toBe(15);
 expect(()=>inspectVrm(Uint8Array.from(glb({asset:{version:"2.0"},extensions:{VRM:{specVersion:"0.0"}}})).buffer)).toThrow("humanoid");
});

function blinkVariant(version: string, variant: "none" | "empty" | "zero" | "left" | "right" | "paired" | "emptyCombinedPaired") {
 const bytes=Uint8Array.from(model(version)).buffer, json=parseGlb(bytes,"vrm");
 const binary=Buffer.from(bytes.slice(28+new DataView(bytes).getUint32(12,true)));
 if(version==="0") {
  const groups=json.extensions.VRM.blendShapeMaster.blendShapeGroups, blink=groups[0];
  if(variant==="none") delete json.extensions.VRM.blendShapeMaster;
  else if(variant==="empty") blink.binds=[];
  else if(variant==="zero") blink.binds[0].weight=0;
  else {
   const sides=variant==="left"?["blink_l"]:variant==="right"?["blink_r"]:["blink_l","blink_r"];
   json.extensions.VRM.blendShapeMaster.blendShapeGroups=sides.map(presetName=>({...blink,name:presetName,presetName}));
   if(variant==="emptyCombinedPaired")json.extensions.VRM.blendShapeMaster.blendShapeGroups.push({...blink,binds:[]});
  }
 } else {
  const expressions=json.extensions.VRMC_vrm.expressions, blink=expressions.preset.blink;
  if(variant==="none") delete json.extensions.VRMC_vrm.expressions;
  else if(variant==="empty") blink.morphTargetBinds=[];
  else if(variant==="zero") blink.morphTargetBinds[0].weight=0;
  else {
   const sides=variant==="left"?["blinkLeft"]:variant==="right"?["blinkRight"]:["blinkLeft","blinkRight"];
   expressions.preset=Object.fromEntries(sides.map(name=>[name,{...blink}]));
   if(variant==="emptyCombinedPaired")expressions.preset.blink={morphTargetBinds:[]};
  }
 }
 return Uint8Array.from(glb(json,binary)).buffer;
}

for(const version of ["0","1"])for(const variant of ["none","empty","zero","left","right","paired","emptyCombinedPaired"] as const)it(`keeps VRM${version} usable with ${variant} blink capability`,async()=>{
 const bytes=blinkVariant(version,variant);
 expect(inspectVrm(bytes).version).toBe(version);
 const loader=new GLTFLoader();loader.register(parser=>new VRMLoaderPlugin(parser));
 const {userData:{vrm}}=await loader.parseAsync(bytes,"");
 expect(vrm.humanoid.getNormalizedBoneNode("head")).toBeTruthy();
 const behavior=new CharacterBehavior(vrm);
 behavior.beforeExpressions(3.5);vrm.expressionManager?.update();behavior.afterExpressions();
 const manager=vrm.expressionManager;
 if(variant==="paired"||variant==="emptyCombinedPaired") {
  expect(manager.getValue("blinkLeft")).toBe(1);expect(manager.getValue("blinkRight")).toBe(1);
  behavior.beforeExpressions(.2);manager.update();behavior.afterExpressions();
  expect(manager.getValue("blinkLeft")).toBe(0);expect(manager.getValue("blinkRight")).toBe(0);
 } else {
  for(const expression of manager?.expressions??[])expect(expression.weight).toBe(0);
 }
 // The same imported model still receives the bundled base posture and motion.
 const motionLoader=new GLTFLoader();motionLoader.register(parser=>new VRMAnimationLoaderPlugin(parser));
 const {userData:{vrmAnimations}}=await motionLoader.parseAsync(defaultIdleBytes(),"");
 const clip=createVRMAnimationClip(vrmAnimations[0],vrm), mixer=new AnimationMixer(vrm.scene);
 mixer.clipAction(clip).play();mixer.update(.5);vrm.humanoid.update();
 expect(clip.tracks.length).toBeGreaterThan(0);
 expect(vrm.humanoid.getNormalizedBoneNode("leftUpperArm").quaternion.toArray().every(Number.isFinite)).toBe(true);
 mixer.stopAllAction();mixer.uncacheRoot(vrm.scene);VRMUtils.deepDispose(vrm.scene);
});

for(const version of ["0","1"])it(`still rejects malformed declared blink bindings in VRM${version}`,()=>{
 const bytes=Uint8Array.from(model(version)).buffer,json=parseGlb(bytes,"vrm"),binary=Buffer.from(bytes.slice(28+new DataView(bytes).getUint32(12,true)));
 const preset=version==="0"?json.extensions.VRM.blendShapeMaster.blendShapeGroups[0]:json.extensions.VRMC_vrm.expressions.preset.blink;
 const binds=version==="0"?preset.binds:preset.morphTargetBinds, valid={...binds[0]};
 for(const change of [{index:999},{index:-1},{index:.5},{weight:-1},{weight:version==="0"?101:1.01},{weight:undefined},version==="0"?{mesh:999}:{node:999}]) {
  binds[0]={...valid,...change};expect(()=>inspectVrm(Uint8Array.from(glb(json,binary)).buffer)).toThrow("blink morph binding");
 }
 // One valid bind must not hide a malformed secondary bind.
 binds[0]=valid;binds.push({...valid,index:999});
 expect(()=>inspectVrm(Uint8Array.from(glb(json,binary)).buffer)).toThrow("blink morph binding");
 binds.pop();expect(inspectVrm(Uint8Array.from(glb(json,binary)).buffer).version).toBe(version);
});
