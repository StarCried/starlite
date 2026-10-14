import {afterEach,expect,it,vi} from "vitest";
import {mkdtempSync,writeFileSync,rmSync,symlinkSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createRequire} from "node:module";
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
it("large VRMs remain blocked for publication but may use authorized local preview",()=>{
 const root=mkdtempSync(join(tmpdir(),"hexo-direct-budget-"));roots.push(root);
 const original=model(), jsonSize=original.readUInt32LE(12), json=JSON.parse(original.subarray(20,20+jsonSize).toString());
 const binary=Buffer.alloc(8*1024*1024);original.subarray(28+jsonSize).copy(binary);json.buffers[0].byteLength=binary.length;
 writeFileSync(join(root,"large.vrm"),glb(json,binary));
 expect(()=>collectVrmFileAssets("./large.vrm",root)).toThrow("8388608-byte limit");
 expect(collectVrmFileAssets("./large.vrm",root,{localPreview:true}).localPreview).toBe(true);
});
it("malformed embedded profiles fail before a model is published",()=>{
 const root=mkdtempSync(join(tmpdir(),"hexo-direct-profile-"));roots.push(root);
 const original=model(), jsonSize=original.readUInt32LE(12), json=JSON.parse(original.subarray(20,20+jsonSize).toString());
 json.extras={starlite:{profile:{schemaVersion:1,type:"arbitrary-script"}}};
 writeFileSync(join(root,"invalid-profile.vrm"),glb(json,original.subarray(28+jsonSize)));
 expect(()=>collectVrmFileAssets("./invalid-profile.vrm",root)).toThrow("unsupported character profile");
});
