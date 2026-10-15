import {afterEach,expect,it,vi} from "vitest";
import {mkdtempSync,writeFileSync,rmSync,symlinkSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createRequire} from "node:module";
import {Window,type HTMLElement} from "happy-dom";
import {collectVrmModelAssets,collectVrmFileAssets,isLocalVrmFile,collectRuntimeAssets,resolveRuntimeDist} from "../src/assets";
import {readEnabledConfig} from "../src/config";
import {registerHexoWidget} from "../src/index";
// @ts-expect-error plain JS fixture
import {model,motion,glb} from "../../../tests/fixtures/vrm.mjs";
const {prepareModel}=createRequire(import.meta.url)("@starcried/starlite-vrm/prepare");
const roots:string[]=[];
afterEach(()=>{for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true})});
async function bundle(allowRedistribution=true){
 const root=mkdtempSync(join(tmpdir(),"hexo-vrm-test-"));roots.push(root);
 writeFileSync(join(root,"source.vrm"),model());writeFileSync(join(root,"Idle.vrma"),motion());
 await prepareModel({model:join(root,"source.vrm"),animations:[{name:"Idle",path:join(root,"Idle.vrma")}],output:join(root,"bundle"),allowRedistribution});
 return join(root,"bundle");
}
it("ships only the VRM backend and resolves every hashed motion URL",async()=>{
 const directory=await bundle(), assets=collectVrmModelAssets(directory);
 const runtime=collectRuntimeAssets(resolveRuntimeDist("vrm"),"vrm");
 expect(runtime.assets.map(a=>a.relativePath)).toEqual(["index.js","widget.css"]);
 expect(assets.assets.some(a=>a.relativePath==="motions/0.vrma")).toBe(true);
 const enabled=readEnabledConfig({config:{root:"/blog/",starlite:{backend:"vrm",enable:true,bundle:directory,fallback:"fallback.png",publication:{confirm:true,allowRedistribution:true,sourceSha256:assets.sourceSha256},ambient:{animations:["Idle"]},gaze:{maxYawDegrees:20,maxPitchDegrees:12},dialogue:{click:{animation:"Idle",linesByAnimation:{Idle:["Hello","Welcome"]}}}}},extend:{generator:{register:vi.fn()},injector:{register:vi.fn()}},log:{warn:vi.fn()}},assets)!;
 expect(enabled.widget).toMatchObject({backend:"vrm",render:{fps:30,maxDevicePixelRatio:1.5},animations:[{name:"Idle",url:`/blog/${assets.routePrefix}/motions/0.vrma`}]});
 expect(enabled.showOnMobile).toBe(false);
 expect(enabled.widget).toMatchObject({gaze:{maxYawDegrees:20,maxPitchDegrees:12},dialogue:{click:{animation:"Idle",linesByAnimation:{Idle:["Hello","Welcome"]}}}});
});
it("keeps redistribution and source identity gates for VRM",async()=>{
 const directory=await bundle(false);expect(()=>collectVrmModelAssets(directory)).toThrow("redistribution");
 const allowed=await bundle(), assets=collectVrmModelAssets(allowed);
 const hexo:any={config:{starlite:{backend:"vrm",enable:true,bundle:allowed,fallback:"fallback.png",publication:{confirm:true,allowRedistribution:true,sourceSha256:"0".repeat(64)}}}};
 expect(()=>readEnabledConfig(hexo,assets)).toThrow("sourceSha256");
 writeFileSync(join(allowed,"motions/0.vrma"),"broken");expect(()=>collectVrmModelAssets(allowed)).toThrow("hash mismatch");
});

function animatedModel() {
 const original=model(), jsonSize=original.readUInt32LE(12), json=JSON.parse(original.subarray(20,20+jsonSize).toString());
 const binary=Buffer.concat([original.subarray(28+jsonSize),Buffer.from(new Float32Array([0,1,0,0,0,1,0,0,.15,Math.sqrt(1-.15**2)]).buffer)]);
 const offset=json.buffers[0].byteLength;json.buffers[0].byteLength=binary.byteLength;
 const view=json.bufferViews.length, accessor=json.accessors.length;
 json.bufferViews.push({buffer:0,byteOffset:offset,byteLength:8},{buffer:0,byteOffset:offset+8,byteLength:32});
 json.accessors.push({bufferView:view,componentType:5126,type:"SCALAR",count:2,min:[0],max:[1]},{bufferView:view+1,componentType:5126,type:"VEC4",count:2});
 json.animations=[{name:"Idle",samplers:[{input:accessor,output:accessor+1}],channels:[{sampler:0,target:{node:2,path:"rotation"}}]}];
 return glb(json,binary);
}
it("direct local VRM needs no manifest and forwards embedded Idle as neutral pose",()=>{
 const root=mkdtempSync(join(tmpdir(),"hexo-direct-vrm-"));roots.push(root);writeFileSync(join(root,"avatar.vrm"),animatedModel());
 let generator:any, injector:any;
 const hexo:any={base_dir:root,config:{root:"/blog/",starlite:{enable:true,backend:"vrm",model:"./avatar.vrm",fallback:"avatar.png",publication:{confirm:true,allowRedistribution:true},ambient:{animations:["Idle"]}}},extend:{generator:{register:(_n:any,f:any)=>generator=f},injector:{register:(_n:any,f:any)=>injector=f}},log:{warn:vi.fn()}};
 registerHexoWidget(hexo);const routes=generator(), html=injector();
 expect(routes.filter((r:any)=>r.path.endsWith(".vrm"))).toHaveLength(1);
 expect(routes.some((r:any)=>r.path.endsWith(".vrma"))).toBe(false);
 expect(html).toContain('"embeddedAnimations":["Idle"]');expect(html).toContain('"neutralAnimation":"Idle"');
 expect(html).toContain('"model":"/blog/vrm-model/');
 const assets=collectVrmFileAssets("./avatar.vrm",root);
 delete hexo.config.starlite.fallback;
 expect(readEnabledConfig(hexo,assets)?.widget.fallback).toBe(`/blog/${assets.routePrefix}/fallback.svg`);
 hexo.config.starlite.publication.sourceSha256="0".repeat(64);
 expect(()=>readEnabledConfig(hexo,assets)).toThrow("sourceSha256");
 delete hexo.config.starlite.publication.sourceSha256;hexo.config.starlite.publication.confirm=false;
 expect(()=>readEnabledConfig(hexo,assets)).toThrow("confirm");
});
it("direct import rejects broken/symlink sources and keeps URLs distinct from files",()=>{
 const root=mkdtempSync(join(tmpdir(),"hexo-direct-invalid-"));roots.push(root);
 writeFileSync(join(root,"broken.vrm"),"broken");expect(()=>collectVrmFileAssets("./broken.vrm",root)).toThrow("GLB");
 writeFileSync(join(root,"avatar.vrm"),model());symlinkSync(join(root,"avatar.vrm"),join(root,"linked.vrm"));
 expect(()=>collectVrmFileAssets("./linked.vrm",root)).toThrow("non-symlink");
 expect(isLocalVrmFile("https://example.test/avatar.vrm",root)).toBe(false);
 expect(isLocalVrmFile("/assets/avatar.vrm",root)).toBe(false);expect(isLocalVrmFile("./missing.vrm",root)).toBe(true);
});
it("prepared manifests also expose embedded animations without a second catalog",async()=>{
 const root=mkdtempSync(join(tmpdir(),"hexo-embedded-bundle-"));roots.push(root);writeFileSync(join(root,"avatar.vrm"),animatedModel());
 await prepareModel({model:join(root,"avatar.vrm"),output:join(root,"bundle"),allowRedistribution:true});
 expect(collectVrmModelAssets(join(root,"bundle")).vrm?.embeddedAnimations).toEqual(["Idle"]);
});
it("VRM publication accepts 9 MiB while over 10 MiB requires authorized local preview",()=>{
 const root=mkdtempSync(join(tmpdir(),"hexo-direct-budget-"));roots.push(root);
 const original=model(), jsonSize=original.readUInt32LE(12), json=JSON.parse(original.subarray(20,20+jsonSize).toString());
 const binary=Buffer.alloc(10*1024*1024);original.subarray(28+jsonSize).copy(binary);json.buffers[0].byteLength=binary.length;
 writeFileSync(join(root,"large.vrm"),glb(json,binary));
 expect(()=>collectVrmFileAssets("./large.vrm",root)).toThrow("10485760-byte limit");
 expect(collectVrmFileAssets("./large.vrm",root,{localPreview:true}).localPreview).toBe(true);
 const accepted=binary.subarray(0,9*1024*1024);json.buffers[0].byteLength=accepted.length;
 writeFileSync(join(root,"accepted.vrm"),glb(json,accepted));
 expect(collectVrmFileAssets("./accepted.vrm",root).localPreview).toBeUndefined();
});
it("malformed embedded profiles fail before a model is published",()=>{
 const root=mkdtempSync(join(tmpdir(),"hexo-direct-profile-"));roots.push(root);
 const original=model(), jsonSize=original.readUInt32LE(12), json=JSON.parse(original.subarray(20,20+jsonSize).toString());
 json.extras={starlite:{profile:{schemaVersion:1,type:"arbitrary-script"}}};
 writeFileSync(join(root,"invalid-profile.vrm"),glb(json,original.subarray(28+jsonSize)));
 expect(()=>collectVrmFileAssets("./invalid-profile.vrm",root)).toThrow("unsupported character profile");
});

function characterProfile(neutralAnimation: string) {
 return {schemaVersion:1,type:"weiguang",neutralAnimation,neutralPose:{},earBones:[],earPoses:{Neutral:{}},expressions:{},accessories:{collar:"head",cone:"spine",collarVisible:true,coneVisible:true},blink:{period:4,curve:[[0,0],[4,0]]}};
}
function profileModel(neutralAnimation: string, embedded = false, alternative?: string) {
 const original=embedded?animatedModel():model(), jsonSize=original.readUInt32LE(12), json=JSON.parse(original.subarray(20,20+jsonSize).toString());
 if(alternative)json.animations.push({...structuredClone(json.animations[0]),name:alternative});
 json.extras={starlite:{profile:characterProfile(neutralAnimation)}};
 return glb(json,original.subarray(28+jsonSize));
}
function simpleHexo(root: string, options: Record<string, unknown> = {}) {
 let generator:any,injector:any;
 const hexo:any={base_dir:root,config:{starlite:{enable:true,backend:"vrm",model:"./avatar.vrm",publication:{confirm:true,allowRedistribution:true},...options}},extend:{generator:{register:(_n:any,f:any)=>generator=f},injector:{register:(_n:any,f:any)=>injector=f}},log:{warn:vi.fn()}};
 registerHexoWidget(hexo);
 return {hexo,generate:()=>generator(),inject:()=>injector() as string};
}

it("the README's minimal VRM configuration leaves the ready host transparent to blog clicks",async()=>{
 const root=mkdtempSync(join(tmpdir(),"hexo-vrm-readme-"));roots.push(root);
 const original=model(),jsonSize=original.readUInt32LE(12),json=JSON.parse(original.subarray(20,20+jsonSize).toString());delete json.extensions.VRMC_vrm.expressions;
 writeFileSync(join(root,"avatar.vrm"),glb(json,original.subarray(28+jsonSize)));
 const blog=simpleHexo(root);expect(blog.generate().some((route:any)=>route.path.endsWith(".vrm"))).toBe(true);
 const html=blog.inject(), source=html.match(/<script type="module">([\s\S]*)<\/script>/)![1]!.replace("import(entryUrl.href)","load(entryUrl.href)");
 const win=new Window({url:"https://blog.example/"}),idle: (()=>void)[]=[];
 Object.defineProperty(win.document,"readyState",{value:"complete",configurable:true});Object.defineProperty(win.document,"visibilityState",{value:"visible",configurable:true});
 win.matchMedia=vi.fn(()=>({matches:false,addEventListener(){}})) as any;(win as any).requestIdleCallback=(callback:()=>void)=>{idle.push(callback);return 1};
 const mount=vi.fn(async(..._args:any[])=>({status:"running",destroy(){}})),load=vi.fn(async()=>({mountModelWidget:mount}));
 try {
  new Function("globalThis","document","load",source)(win,win.document,load);idle.shift()?.();await new Promise(resolve=>setTimeout(resolve,0));
  expect(mount).toHaveBeenCalledOnce();expect(mount.mock.calls[0]?.[1]).toMatchObject({interactions:{passThrough:true,click:false}});
  const host=win.document.querySelector("[data-starlite-widget-host]") as HTMLElement;
  expect(host.style.visibility).toBe("");expect(win.getComputedStyle(host).pointerEvents).toBe("none");
 } finally {await win.happyDOM.close()}
});

it.each([
 [{},true],
 [{drag:true},false],
 [{drag:false},true],
 [{passThrough:false},false],
 [{passThrough:false,drag:true},false],
 [{passThrough:true},true],
] as const)("keeps explicit VRM interaction choices while choosing a safe blog default: %j",(interactions,expected)=>{
 const root=mkdtempSync(join(tmpdir(),"hexo-vrm-interactions-"));roots.push(root);writeFileSync(join(root,"avatar.vrm"),model());
 const assets=collectVrmFileAssets("./avatar.vrm",root),blog=simpleHexo(root,{interactions});
 expect(readEnabledConfig(blog.hexo,assets)?.widget.interactions).toMatchObject({...interactions,passThrough:expected});
});

it("still rejects explicit drag and pass-through together",()=>{
 const root=mkdtempSync(join(tmpdir(),"hexo-vrm-drag-"));roots.push(root);writeFileSync(join(root,"avatar.vrm"),model());
 expect(()=>simpleHexo(root,{interactions:{drag:true,passThrough:true}}).generate()).toThrow("passThrough and drag");
});

it("rejects a missing embedded profile neutral animation during generation with the field and name",()=>{
 const root=mkdtempSync(join(tmpdir(),"hexo-vrm-profile-action-"));roots.push(root);writeFileSync(join(root,"avatar.vrm"),profileModel("Missing"));
 expect(()=>collectVrmFileAssets("./avatar.vrm",root)).toThrow('extras.starlite.profile.neutralAnimation references unavailable animation "Missing"');
 expect(()=>simpleHexo(root).generate()).toThrow("choose an embedded/configured VRMA animation or StarLiteIdle");
});

it.each([["Idle",true],["StarLiteIdle",false]] as const)("accepts an embedded profile's available neutral animation %s",(name,embedded)=>{
 const root=mkdtempSync(join(tmpdir(),"hexo-vrm-profile-valid-"));roots.push(root);writeFileSync(join(root,"avatar.vrm"),profileModel(name,embedded));
 expect(()=>simpleHexo(root).generate()).not.toThrow();
});

it("validates embedded profiles against configured external VRMA names too",()=>{
 const root=mkdtempSync(join(tmpdir(),"hexo-vrm-profile-external-"));roots.push(root);writeFileSync(join(root,"avatar.vrm"),profileModel("ExternalPose"));
 const blog=simpleHexo(root,{animations:[{name:"ExternalPose",url:"motions/Pose.vrma"}]});
 expect(()=>blog.generate()).not.toThrow();expect(blog.inject()).toContain('"name":"ExternalPose","url":"/motions/Pose.vrma"');
});

it("validates embedded profiles against prepared bundle motions",async()=>{
 const root=mkdtempSync(join(tmpdir(),"hexo-vrm-profile-bundle-"));roots.push(root);writeFileSync(join(root,"avatar.vrm"),profileModel("ExternalPose"));writeFileSync(join(root,"Pose.vrma"),motion());
 await prepareModel({model:join(root,"avatar.vrm"),animations:[{name:"ExternalPose",path:join(root,"Pose.vrma")}],output:join(root,"bundle"),allowRedistribution:true});
 expect(()=>collectVrmModelAssets(join(root,"bundle"))).not.toThrow();
});

it("names a missing explicit neutral animation before runtime loading",()=>{
 const root=mkdtempSync(join(tmpdir(),"hexo-vrm-neutral-missing-"));roots.push(root);writeFileSync(join(root,"avatar.vrm"),model());
 expect(()=>simpleHexo(root,{neutralAnimation:"Missing"}).generate()).toThrow('starlite.neutralAnimation references unavailable animation "Missing"');
 expect(()=>simpleHexo(root,{neutralAnimation:"StarLiteIdle"}).generate()).not.toThrow();
});

it.each([false,true])("rejects a missing inline profile baseline even when embedded Idle exists: %s",(idle)=>{
 const root=mkdtempSync(join(tmpdir(),"hexo-vrm-inline-profile-missing-"));roots.push(root);writeFileSync(join(root,"avatar.vrm"),idle?animatedModel():model());
 expect(()=>simpleHexo(root,{profile:characterProfile("Missing")}).generate()).toThrow('starlite.profile.neutralAnimation references unavailable animation "Missing"');
});

it("uses the embedded profile baseline before discovered Idle and preserves an explicit override",()=>{
 const root=mkdtempSync(join(tmpdir(),"hexo-vrm-embedded-profile-baseline-"));roots.push(root);writeFileSync(join(root,"avatar.vrm"),profileModel("Pose",true,"Pose"));
 const assets=collectVrmFileAssets("./avatar.vrm",root);
 expect(assets.vrm?.neutralAnimation).toBe("Pose");
 expect(readEnabledConfig(simpleHexo(root).hexo,assets)?.widget).toHaveProperty("neutralAnimation","Pose");
 expect(readEnabledConfig(simpleHexo(root,{neutralAnimation:"Idle"}).hexo,assets)?.widget).toHaveProperty("neutralAnimation","Idle");
});

it("uses inline profile baseline ahead of model profile and Idle, allowing an explicit override",()=>{
 const root=mkdtempSync(join(tmpdir(),"hexo-vrm-inline-profile-baseline-"));roots.push(root);writeFileSync(join(root,"avatar.vrm"),profileModel("Idle",true,"Pose"));
 const assets=collectVrmFileAssets("./avatar.vrm",root);
 expect(readEnabledConfig(simpleHexo(root,{profile:characterProfile("Pose")}).hexo,assets)?.widget).toHaveProperty("neutralAnimation","Pose");
 expect(readEnabledConfig(simpleHexo(root,{profile:characterProfile("Pose"),neutralAnimation:"Idle"}).hexo,assets)?.widget).toHaveProperty("neutralAnimation","Idle");
 expect(readEnabledConfig(simpleHexo(root,{profile:characterProfile("StarLiteIdle")}).hexo,assets)?.widget).toHaveProperty("neutralAnimation","StarLiteIdle");
});

it("lets a URL profile choose its loaded baseline instead of forcing discovered or embedded Idle",()=>{
 const root=mkdtempSync(join(tmpdir(),"hexo-vrm-url-profile-baseline-"));roots.push(root);writeFileSync(join(root,"avatar.vrm"),profileModel("Pose",true,"Pose"));
 const assets=collectVrmFileAssets("./avatar.vrm",root),profile="https://example.test/profile.json";
 const widget=readEnabledConfig(simpleHexo(root,{profile}).hexo,assets)?.widget;
 expect(widget).toMatchObject({profile});expect(widget).not.toHaveProperty("neutralAnimation");
 expect(readEnabledConfig(simpleHexo(root,{profile,neutralAnimation:"Idle"}).hexo,assets)?.widget).toHaveProperty("neutralAnimation","Idle");
});

it("retains a prepared external profile's baseline ahead of model profile and discovered Idle",async()=>{
 const root=mkdtempSync(join(tmpdir(),"hexo-vrm-prepared-profile-baseline-"));roots.push(root);writeFileSync(join(root,"avatar.vrm"),profileModel("Idle",true));writeFileSync(join(root,"Pose.vrma"),motion());writeFileSync(join(root,"profile.json"),JSON.stringify(characterProfile("Pose")));
 await prepareModel({model:join(root,"avatar.vrm"),animations:[{name:"Pose",path:join(root,"Pose.vrma")}],profile:join(root,"profile.json"),output:join(root,"bundle"),allowRedistribution:true});
 const assets=collectVrmModelAssets(join(root,"bundle")),blog=simpleHexo(root,{bundle:join(root,"bundle"),fallback:"fallback.png",publication:{confirm:true,allowRedistribution:true,sourceSha256:assets.sourceSha256}});
 expect(assets.vrm?.neutralAnimation).toBe("Pose");expect(readEnabledConfig(blog.hexo,assets)?.widget).toHaveProperty("neutralAnimation","Pose");
});
