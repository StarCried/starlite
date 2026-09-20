import {expect,it} from "vitest";
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";
import {AnimationMixer} from "three";
import {VRMLoaderPlugin,VRMUtils} from "@pixiv/three-vrm";
import {VRMAnimationLoaderPlugin,createVRMAnimationClip} from "@pixiv/three-vrm-animation";
// @ts-expect-error test fixture generator is plain JavaScript
import {model,motion} from "../../../tests/fixtures/vrm.mjs";
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
