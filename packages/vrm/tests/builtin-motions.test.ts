import { expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { AnimationMixer, Quaternion } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import { VRMAnimationLoaderPlugin, createVRMAnimationClip } from "@pixiv/three-vrm-animation";
import { builtinMotionBytes } from "../src/builtin-motions.js";
import { BUILTIN_ANIMATIONS, isBuiltinAnimation } from "../src/builtin-motion-catalog.js";
import { parseGlb, inspectVrma, embeddedAnimationCatalog } from "../src/inspect.js";
import { validateVrmWidgetConfig } from "../src/config.js";
// @ts-expect-error synthetic artwork-free fixture
import { model, glb } from "../../../tests/fixtures/vrm.mjs";
const provenance = JSON.parse(readFileSync(new URL("../BUNDLED_MOTIONS.json", import.meta.url), "utf8"));
for (const entry of BUILTIN_ANIMATIONS.slice(1)) {
  it(`${entry.name} is intact, artwork-free and contains no symbol or half-squint channel`, async () => {
    const bytes = await builtinMotionBytes(entry.name), json = parseGlb(bytes, "vrma");
    const recorded = provenance.clips.find((clip: {name:string}) => clip.name === entry.name);
    expect(createHash("sha256").update(new Uint8Array(bytes)).digest("hex")).toBe(recorded.sha256);
    expect(bytes.byteLength).toBe(recorded.bytes);
    expect(inspectVrma(bytes).durationMs).toBeCloseTo(entry.durationMs, 2);
    for (const key of ["meshes", "skins", "images", "textures", "materials"]) expect(json[key] ?? []).toHaveLength(0);
    const expression = json.extensions.VRMC_vrm_animation.expressions;
    expect(Object.keys(expression?.custom ?? {})).toHaveLength(0);
    expect(Object.keys(expression?.preset ?? {})).toEqual(entry.name === "StarLiteSleepyStartle" ? ["blink"] : entry.name === "StarLiteHappyWave" ? ["happy"] : []);
    const forbidden = new Set(Object.entries(json.extensions.VRMC_vrm_animation.humanoid.humanBones).filter(([bone]) => /hips|leg|foot|toe|eye/i.test(bone)).map(([, binding]) => (binding as {node:number}).node));
    expect(json.animations[0].channels.every((channel: any) => !forbidden.has(channel.target.node))).toBe(true);
    expect(json.animations[0].channels.every((channel: any) => channel.target.path === "rotation" || channel.target.path === "translation")).toBe(true);
    expect(isBuiltinAnimation(entry.name)).toBe(true);
    expect(() => validateVrmWidgetConfig({model:"m.vrm",fallback:"f.png",animations:[{name:entry.name,url:"override.vrma"}]})).toThrow("invalid or duplicate");
    expect(() => validateVrmWidgetConfig({model:"m.vrm",fallback:"f.png",interactions:{click:{animation:entry.name}},dialogue:{idle:{animation:entry.name,lines:["Hello"]}}})).not.toThrow();
    const modelJson = parseGlb(Uint8Array.from(model()).buffer, "vrm");
    modelJson.animations = [{ name: entry.name }];
    expect(() => embeddedAnimationCatalog(modelJson)).toThrow("reserved");
  });
  for (const version of ["0", "1"]) for (const blink of [true, false]) it(`${entry.name} retargets on VRM${version} with optional blink=${blink} and missing fingers`, async () => {
    const loader = new GLTFLoader(); loader.register(parser => new VRMLoaderPlugin(parser));
    const original = model(version), sourceJson = parseGlb(Uint8Array.from(original).buffer,"vrm");
    if (!blink) {
      if (version === "0") delete sourceJson.extensions.VRM.blendShapeMaster;
      else delete sourceJson.extensions.VRMC_vrm.expressions;
    }
    const source = glb(sourceJson, original.subarray(28 + original.readUInt32LE(12)));
    const {userData:{vrm}} = await loader.parseAsync(Uint8Array.from(source).buffer, "");
    VRMUtils.rotateVRM0(vrm);
    const motionLoader = new GLTFLoader(); motionLoader.register(parser => new VRMAnimationLoaderPlugin(parser));
    const {userData:{vrmAnimations}} = await motionLoader.parseAsync(await builtinMotionBytes(entry.name), "");
    const clip = createVRMAnimationClip(vrmAnimations[0], vrm);
    expect(clip.duration * 1000).toBeCloseTo(entry.durationMs, 2);
    expect(clip.tracks.length).toBeGreaterThan(2);
    expect(clip.tracks.every(track => Array.from(track.values).every(Number.isFinite))).toBe(true);
    const hips = vrm.humanoid.getNormalizedBoneNode("hips"), before = hips.position.clone();
    const mixer = new AnimationMixer(vrm.scene); mixer.clipAction(clip).play();
    let maximum = 0, headChange = 0;
    mixer.update(0);const firstHead=vrm.humanoid.getNormalizedBoneNode("head").quaternion.clone();
    for (let step = 0; step < entry.durationMs / 1000 * 60; step++) {
      mixer.update(1/60); vrm.humanoid.update();
      maximum = Math.max(maximum, vrm.humanoid.getNormalizedBoneNode("leftUpperArm").quaternion.angleTo(new Quaternion()));
      headChange=Math.max(headChange,firstHead.angleTo(vrm.humanoid.getNormalizedBoneNode("head").quaternion));
      expect(hips.position.toArray()).toEqual(before.toArray());
    }
    expect(maximum).toBeGreaterThan(.1);
    if (entry.name !== "StarLiteHappyWave") expect(headChange).toBeGreaterThan(.05);
    mixer.stopAllAction(); mixer.uncacheRoot(vrm.scene); VRMUtils.deepDispose(vrm.scene);
  });
}

it("SleepyStartle keeps its wake-up rebound and blink but stays head-neutral after settling", async () => {
  const loader = new GLTFLoader().register(parser => new VRMAnimationLoaderPlugin(parser));
  const {userData:{vrmAnimations}} = await loader.parseAsync(await builtinMotionBytes("StarLiteSleepyStartle"), "");
  const motion = vrmAnimations[0], head = motion.humanoidTracks.rotation.get("head");
  const interpolate = head.createInterpolant(new Float32Array(4));
  const rotation = (time:number) => new Quaternion().fromArray(interpolate.evaluate(time)).normalize();
  const neutral = rotation(0);
  // Drowsy nod and the rebound remain a real motion before the final settle.
  expect(rotation(2.92).angleTo(neutral)).toBeGreaterThan(.1);
  expect(rotation(3.12).angleTo(rotation(3.29))).toBeGreaterThan(.1);
  for(let time=3.87;time<=5.5;time+=1/120) expect(rotation(time).angleTo(neutral)).toBeLessThan(1e-5);
  const blink = motion.expressionTracks.preset.get("blink").createInterpolant(new Float32Array(1));
  expect(blink.evaluate(4.69)[0]).toBeGreaterThan(.9);
  expect(blink.evaluate(4.8)[0]).toBe(0);
});

// The packaged wave starts from the program Idle itself, before per-model pose
// calibration. An unrelated character's rest pose changes the whole hand arc.
it("authored RaisedHandWave preserves its complete gesture and smile between program-Idle boundaries", async () => {
  const loader = new GLTFLoader(); loader.register(parser => new VRMAnimationLoaderPlugin(parser));
  const read = async (name:string) => (await loader.parseAsync(await builtinMotionBytes(name), "")).userData.vrmAnimations[0];
  const idle = await read("StarLiteIdle"), wave = await read("StarLiteHappyWave");
  const rotation = (values:ArrayLike<number>, offset=0) => new Quaternion().fromArray(values,offset).normalize();
  for (const [bone, track] of wave.humanoidTracks.rotation) {
    const neutral = rotation(idle.humanoidTracks.rotation.get(bone).values);
    expect(rotation(track.values).angleTo(neutral),bone).toBeLessThan(1e-5);
    expect(rotation(track.values,track.values.length-4).angleTo(neutral),bone).toBeLessThan(1e-5);
  }
  // The selected edited clip has secondary motion on its left side too; the
  // raw 0.6-second loop/right-arm-only reconstruction is not this animation.
  for(const bone of ["rightHand","leftHand"]) {
    const sample = wave.humanoidTracks.rotation.get(bone).createInterpolant(new Float32Array(4));
    let range=0; const first=rotation(sample.evaluate(.4));
    for(let time=.4;time<=4.2;time+=1/60) range=Math.max(range,first.angleTo(rotation(sample.evaluate(time))));
    expect(range).toBeGreaterThan(bone==="rightHand"?.3:.05);
  }
  const smile=wave.expressionTracks.preset.get("happy").createInterpolant(new Float32Array(1));
  for(const [time,weight]of [[0,0],[.4,0],[.7,.5],[1.2,.82],[2.2,.75],[3,.82],[3.5,.4],[3.9,0],[4.6,0]]) expect(smile.evaluate(time)[0]).toBeCloseTo(weight,5);
});

for(const version of ["0","1"]) it(`RaisedHandWave drives the model's standard happy expression on VRM${version}`,async()=>{
  const original=model(version),json=parseGlb(Uint8Array.from(original).buffer,"vrm");
  if(version==="0") json.extensions.VRM.blendShapeMaster.blendShapeGroups.push({name:"Joy",presetName:"joy",binds:[{mesh:0,index:0,weight:100}]});
  else json.extensions.VRMC_vrm.expressions.preset.happy={morphTargetBinds:[{node:0,index:0,weight:1}]};
  const loader=new GLTFLoader().register(parser=>new VRMLoaderPlugin(parser));
  const {userData:{vrm}}=await loader.parseAsync(Uint8Array.from(glb(json,original.subarray(28+original.readUInt32LE(12)))).buffer,"");
  const motionLoader=new GLTFLoader().register(parser=>new VRMAnimationLoaderPlugin(parser));
  const {userData:{vrmAnimations}}=await motionLoader.parseAsync(await builtinMotionBytes("StarLiteHappyWave"),"");
  const mixer=new AnimationMixer(vrm.scene);mixer.clipAction(createVRMAnimationClip(vrmAnimations[0],vrm)).play();
  mixer.update(1.2);vrm.expressionManager.update();
  expect(vrm.expressionManager.getValue("happy")).toBeCloseTo(.82,5);
  mixer.update(2.7);vrm.expressionManager.update();
  expect(vrm.expressionManager.getValue("happy")).toBeCloseTo(0,5);
  mixer.stopAllAction();mixer.uncacheRoot(vrm.scene);VRMUtils.deepDispose(vrm.scene);
});
