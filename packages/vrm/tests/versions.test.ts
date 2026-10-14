import {inspectVrm,parseGlb} from "../src/inspect.js";
import {expect,it} from "vitest";
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";
import {AnimationMixer} from "three";
import {VRMLoaderPlugin,VRMUtils} from "@pixiv/three-vrm";
import {VRMAnimationLoaderPlugin,createVRMAnimationClip} from "@pixiv/three-vrm-animation";
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

for(const version of ['0','1'])it(`requires actual blink morph bindings in VRM${version}`,()=>{
 const bytes=Uint8Array.from(model(version)).buffer,json=parseGlb(bytes,'vrm'),offset=28+new DataView(bytes).getUint32(12,true),binary=Buffer.from(bytes.slice(offset));
 const preset=version==='0'?json.extensions.VRM.blendShapeMaster.blendShapeGroups[0]:json.extensions.VRMC_vrm.expressions.preset.blink;
 const binds=version==='0'?preset.binds:preset.morphTargetBinds;
 binds[0].weight=0;expect(()=>inspectVrm(Uint8Array.from(glb(json,binary)).buffer)).toThrow('blink');
 binds[0].weight=version==='0'?100:1;binds[0].index=999;expect(()=>inspectVrm(Uint8Array.from(glb(json,binary)).buffer)).toThrow('blink');
 binds[0].index=0;expect(inspectVrm(Uint8Array.from(glb(json,binary)).buffer).version).toBe(version);
});
