import { expect, it } from "vitest";
import { AnimationClip, Object3D, Quaternion, QuaternionKeyframeTrack, Vector3, VectorKeyframeTrack } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { VRMHumanBoneName, VRMPose } from "@pixiv/three-vrm";
import { VRMAnimationLoaderPlugin, type VRMAnimation } from "@pixiv/three-vrm-animation";
import { AdjustableIdle, RebasedBuiltinGesture } from "../src/adjustments.js";
import { builtinMotionBytes } from "../src/builtin-motions.js";
import { BUILTIN_ANIMATIONS } from "../src/builtin-motion-catalog.js";
import { VrmAnimationPlayer } from "../src/playback.js";
const names=BUILTIN_ANIMATIONS.slice(1).map(entry=>entry.name);
const q=(values:ArrayLike<number>,at=0)=>new Quaternion().fromArray(values,at).normalize();
async function fixture(version:"0"|"1",missingFingers=false){
 const root=new Object3D(),nodes=new Map<VRMHumanBoneName,Object3D>(),originals=new Map<string,AnimationClip>();
 const loader=new GLTFLoader();loader.register(parser=>new VRMAnimationLoaderPlugin(parser));
 for(const {name}of BUILTIN_ANIMATIONS){
  const asset=await loader.parseAsync(await builtinMotionBytes(name),""),animation=(asset.userData.vrmAnimations as VRMAnimation[])[0]!;
  const tracks=[];
  for(const[bone,track]of animation.humanoidTracks.rotation){
   if(missingFingers&&/Thumb|Index|Middle|Ring|Little/.test(bone))continue;
   let node=nodes.get(bone);if(!node){node=new Object3D();node.name="Normalized_"+bone;root.add(node);nodes.set(bone,node);}
   const copy=track.clone();copy.name=node.name+".quaternion";
   if(version==="0")copy.values=copy.values.map((value,index)=>index%2===0?-value:value);
   tracks.push(copy);
  }
  originals.set(name,new AnimationClip(name,animation.duration,tracks));
 }
 const humanoid={getNormalizedBoneNode:(bone:VRMHumanBoneName)=>nodes.get(bone)??null};
 const idle=new AdjustableIdle(originals.get("StarLiteIdle")!,root,humanoid,version);
 const pose=()=>idle.neutralPose(Object.fromEntries([...nodes].map(([bone])=>[bone,{rotation:[0,0,0,1]}])) as VRMPose);
 return{root,nodes,originals,humanoid,idle,pose};
}
for(const version of["0","1"]as const)for(const name of names)it(`${name} uses the selected calibrated Idle at both boundaries on VRM${version}`,async()=>{
 const f=await fixture(version),source=f.originals.get(name)!,original=source.tracks.map(t=>Array.from(t.values));
 f.idle.update({armLiftDegrees:24,wristLiftDegrees:30,palmTwistDegrees:-15,elbowBendDegrees:12,handCurl:.4});
 const target=f.pose(),gesture=new RebasedBuiltinGesture(source,f.root,f.humanoid,target);
 for(const [index,track]of gesture.clip.tracks.entries()){
  const bone=track.name.slice("Normalized_".length,-".quaternion".length)as VRMHumanBoneName;
  const sourceTrack=source.tracks[index]!;
  expect(q(sourceTrack.values).angleTo(q(sourceTrack.values,sourceTrack.values.length-4))).toBeLessThan(1e-5);
  expect(q(track.values).angleTo(new Quaternion().fromArray(target[bone]!.rotation!).normalize()),bone).toBeLessThan(1e-5);
  expect(q(track.values,track.values.length-4).angleTo(new Quaternion().fromArray(target[bone]!.rotation!).normalize()),bone).toBeLessThan(1e-5);
  // Sampling actual arm/body curves catches changes to a high-wave's local
  // angular motion, not just a synthetic first/last keyframe coincidence.
  if(!/LowerArm|Thumb|Index|Middle|Ring|Little/.test(bone))for(let at=0;at<track.values.length;at+=4){
   const before=q(sourceTrack.values).invert().multiply(q(sourceTrack.values,at));
   const after=q(track.values).invert().multiply(q(track.values,at));
   expect(after.angleTo(before),bone).toBeLessThan(1e-5);
  }
 }
 expect(source.tracks.map(t=>Array.from(t.values))).toEqual(original);expect(gesture.clip.duration).toBe(source.duration);
 const once=gesture.clip.tracks.map(t=>Array.from(t.values));for(let i=0;i<20;i++)gesture.update(target);expect(gesture.clip.tracks.map(t=>Array.from(t.values))).toEqual(once);
 f.idle.update({});gesture.update(f.pose());
 const fresh=new RebasedBuiltinGesture(source,f.root,f.humanoid,f.pose());expect(gesture.clip.tracks.map(t=>Array.from(t.values))).toEqual(fresh.clip.tracks.map(t=>Array.from(t.values)));
});
it("rebases to an authored Idle pose without applying program-Idle sliders to that pose",async()=>{
 const f=await fixture("1"),target=f.pose(),source=f.originals.get("StarLiteHappyWave")!;
 const authored=new Quaternion().setFromAxisAngle(new Vector3(1,0,0),.45);target.leftUpperArm={rotation:authored.toArray()};
 const gesture=new RebasedBuiltinGesture(source,f.root,f.humanoid,target);
 f.idle.update({armLiftDegrees:40});gesture.update(target);
 const arm=gesture.clip.tracks.find(t=>t.name.includes("leftUpperArm"))!;expect(q(arm.values).angleTo(authored)).toBeLessThan(1e-5);
});
it("skips unmapped fingers and missing reference rotations without adding channels",async()=>{
 const f=await fixture("0",true),source=f.originals.get("StarLiteSleepyStartle")!,target=f.pose();delete target.leftUpperArm;
 const hips=new VectorKeyframeTrack("Normalized_hips.position",[0,1],[0,1,0,0,1.1,0]);source.tracks.push(hips);
 const gesture=new RebasedBuiltinGesture(source,f.root,f.humanoid,target);
 expect(gesture.clip.tracks).toHaveLength(source.tracks.length);expect(gesture.clip.tracks.at(-1)).toBe(hips);
 const missing=source.tracks.find(t=>t.name.includes("leftUpperArm"))!;expect(gesture.clip.tracks.find(t=>t.name===missing.name)).toBe(missing);
 expect(gesture.clip.tracks.some(t=>/Thumb|Index|Middle|Ring|Little/.test(t.name))).toBe(false);
});
it("updates shared gesture samples during playback without resetting phase, promises or authored actions",async()=>{
 const root=new Object3D(),arm=new Object3D();arm.name="arm";root.add(arm);
 const neutral=new Quaternion().setFromAxisAngle(new Vector3(0,0,1),.3),delta=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),.7);
 const original=new AnimationClip("StarLiteHappyWave",2,[new QuaternionKeyframeTrack("arm.quaternion",[0,1,2],[0,0,0,1,...delta.toArray(),0,0,0,1])]);
 const target:VRMPose={leftUpperArm:{rotation:neutral.toArray()}},gesture=new RebasedBuiltinGesture(original,root,{getNormalizedBoneNode:name=>name==="leftUpperArm"?arm:null},target);
 const authored=new AnimationClip("UserWave",2,[new QuaternionKeyframeTrack("arm.quaternion",[0,2],[...delta.toArray(),...delta.toArray()])]);
 const player=new VrmAnimationPlayer(root,new Map([[gesture.clip.name,gesture.clip],[authored.name,authored]]),()=>arm.quaternion.copy(neutral));
 const promise=player.play(gesture.clip.name);player.update(.8);
 const changed=new Quaternion().setFromAxisAngle(new Vector3(0,0,1),.6);gesture.update({leftUpperArm:{rotation:changed.toArray()}});player.update(0);
 expect(player.play(gesture.clip.name)).toBe(promise);
 const expected=changed.clone().multiply(new Quaternion().slerp(delta,.8));expect(arm.quaternion.clone().normalize().angleTo(expected.normalize())).toBeLessThan(1e-5);
 player.update(1.3);await expect(promise).resolves.toBe("completed");
 const user=player.play("UserWave");player.update(.5);gesture.update(target);player.update(0);expect(arm.quaternion.clone().normalize().angleTo(delta)).toBeLessThan(1e-5);
 player.stop();await expect(user).resolves.toBe("stopped");player.destroy();
});

for(const version of ["0","1"]as const)for(const handCurl of [0,1])it(`preserves active HappyWave fingers at handCurl=${handCurl} on VRM${version}`,async()=>{
 const f=await fixture(version);f.idle.update({handCurl,wristLiftDegrees:30});const target=f.pose(),source=f.originals.get("StarLiteHappyWave")!;
 const gesture=new RebasedBuiltinGesture(source,f.root,f.humanoid,target);
 let animated=0;
 for(const[index,track]of gesture.clip.tracks.entries()){
  if(!/Thumb|Index|Middle|Ring|Little/.test(track.name))continue;
  const original=source.tracks[index]!,first=q(original.values);
  const moving=Array.from({length:original.times.length},(_,i)=>first.angleTo(q(original.values,i*4))).some(angle=>angle>1e-4);
  if(!moving)continue;animated++;
  const bone=track.name.slice("Normalized_".length,-".quaternion".length)as VRMHumanBoneName;
  expect(q(track.values).angleTo(q(target[bone]!.rotation!))).toBeLessThan(1e-5);
  expect(q(track.values,track.values.length-4).angleTo(q(target[bone]!.rotation!))).toBeLessThan(1e-5);
  let activeMaximum=0,originalMaximum=0;
  for(let i=0;i<track.times.length;i++)if(track.times[i]!>=.4&&track.times[i]!<=source.duration-.4){
   const originalIndex=Array.from(original.times).indexOf(track.times[i]!);
   expect(originalIndex).toBeGreaterThanOrEqual(0); // No interior resampling.
   expect(Array.from(track.values.slice(i*4,i*4+4))).toEqual(Array.from(original.values.slice(originalIndex*4,originalIndex*4+4)));
   activeMaximum=Math.max(activeMaximum,q(track.values,i*4).angleTo(new Quaternion()));originalMaximum=Math.max(originalMaximum,q(original.values,originalIndex*4).angleTo(new Quaternion()));
  }
  expect(activeMaximum).toBe(originalMaximum); // No doubled curl during the wave.
 }
 expect(animated).toBeGreaterThan(20);
});
it("retains calibrated static fingers throughout CuriousPeek and SleepyStartle",async()=>{
 const f=await fixture("1");f.idle.update({handCurl:1});const target=f.pose();
 for(const name of ["StarLiteCuriousPeek","StarLiteSleepyStartle"]){
  const source=f.originals.get(name)!,gesture=new RebasedBuiltinGesture(source,f.root,f.humanoid,target);
  for(const track of gesture.clip.tracks)if(/Thumb|Index|Middle|Ring|Little/.test(track.name)){
   const bone=track.name.slice("Normalized_".length,-".quaternion".length)as VRMHumanBoneName;
   for(let at=0;at<track.values.length;at+=4)expect(q(track.values,at).angleTo(q(target[bone]!.rotation!))).toBeLessThan(1e-5);
  }
 }
});

for(const elbowBendDegrees of [-20,45])it(`keeps authored active Wave elbows at correction ${elbowBendDegrees} degrees`,async()=>{
 const f=await fixture("1");f.idle.update({elbowBendDegrees});const target=f.pose(),source=f.originals.get("StarLiteHappyWave")!;
 const gesture=new RebasedBuiltinGesture(source,f.root,f.humanoid,target);
 for(const side of["left","right"]as const){
  const bone=(side+"LowerArm")as VRMHumanBoneName,track=gesture.clip.tracks.find(t=>t.name===`Normalized_${bone}.quaternion`)!;
  const original=source.tracks.find(t=>t.name===track.name)!;
  expect(q(track.values).angleTo(q(target[bone]!.rotation!))).toBeLessThan(1e-5);
  expect(q(track.values,track.values.length-4).angleTo(q(target[bone]!.rotation!))).toBeLessThan(1e-5);
  for(let i=0;i<original.times.length;i++)if(original.times[i]!>=.4&&original.times[i]!<=source.duration-.4){
   const derivedIndex=Array.from(track.times).indexOf(original.times[i]!);expect(derivedIndex).toBeGreaterThanOrEqual(0);
   expect(Array.from(track.values.slice(derivedIndex*4,derivedIndex*4+4))).toEqual(Array.from(original.values.slice(i*4,i*4+4)));
  }
 }
});
it("samples only the bounded entry/exit ramps so sparse keys retain gentle endpoint interpolation",()=>{
 const root=new Object3D(),finger=new Object3D();finger.name="finger";root.add(finger);
 const open=new Quaternion(),curl=new Quaternion().setFromAxisAngle(new Vector3(0,0,1),.6),target=new Quaternion().setFromAxisAngle(new Vector3(0,0,1),1.4);
 const track=new QuaternionKeyframeTrack("finger.quaternion",[0,.5,1,1.5,2],[...open.toArray(),...curl.toArray(),...curl.toArray(),...curl.toArray(),...open.toArray()]);
 const source=new AnimationClip("StarLiteHappyWave",2,[track]),original=Array.from(track.values);
 const gesture=new RebasedBuiltinGesture(source,root,{getNormalizedBoneNode:bone=>bone==="leftIndexProximal"?finger:null},{leftIndexProximal:{rotation:target.toArray()}});
 const result=gesture.clip.tracks[0]!;
 expect(result.times.length).toBeLessThanOrEqual(track.times.length+50);expect(result.times.length).toBeGreaterThan(track.times.length);
 expect(Array.from(result.times).filter(t=>t>.400001&&t<1.599999)).toEqual(Array.from(track.times).filter(t=>t>.400001&&t<1.599999));
 const interpolant=(result as QuaternionKeyframeTrack & {createInterpolant(buffer:Float32Array):{evaluate(time:number):ArrayLike<number>}}).createInterpolant(new Float32Array(4));
 const sample=(time:number)=>q(interpolant.evaluate(time));
 expect(sample(0).angleTo(target)).toBeLessThan(1e-5);expect(sample(2).angleTo(target)).toBeLessThan(1e-5);
 const sourceInterpolant=(track as QuaternionKeyframeTrack & {createInterpolant(buffer:Float32Array):{evaluate(time:number):ArrayLike<number>}}).createInterpolant(new Float32Array(4));
 const offset=(time:number)=>sample(time).multiply(q(sourceInterpolant.evaluate(time)).invert());
 const lastStep=offset(2-1/60).angleTo(offset(2)),priorStep=offset(2-2/60).angleTo(offset(2-1/60));
 expect(lastStep).toBeLessThan(priorStep);expect(lastStep).toBeLessThan(.01);
 expect(Array.from(track.values)).toEqual(original);expect(Array.from(track.times)).toEqual([0,.5,1,1.5,2]);
});
