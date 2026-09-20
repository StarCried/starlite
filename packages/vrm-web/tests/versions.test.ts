import {inspectVrm,parseGlb} from "../src/inspect.js";
import {expect,it} from "vitest";
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";
import {AnimationMixer} from "three";
import {VRMLoaderPlugin,VRMUtils} from "@pixiv/three-vrm";
import {VRMAnimationLoaderPlugin,createVRMAnimationClip} from "@pixiv/three-vrm-animation";
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

it("rejects non-finite binary geometry and incomplete humanoid imports",()=>{
 const bytes=Uint8Array.from(model()).buffer, view=new DataView(bytes), binary=28+view.getUint32(12,true);view.setFloat32(binary,NaN,true);
 expect(()=>inspectVrm(bytes)).toThrow("non-finite");
 const valid=Uint8Array.from(model()).buffer;expect(inspectVrm(valid).version).toBe("1");
 expect(parseGlb(valid,"vrm").nodes.length).toBe(15);
 expect(()=>inspectVrm(Uint8Array.from(glb({asset:{version:"2.0"},extensions:{VRM:{specVersion:"0.0"}}})).buffer)).toThrow("humanoid");
});
