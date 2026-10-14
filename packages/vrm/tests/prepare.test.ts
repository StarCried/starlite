import { afterEach, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareModel, readPreparedBundle } from "../src/prepare.js";
import { parseGlb } from "../src/inspect.js";
// @ts-expect-error plain JS fixture
import {model as modelFixture, glb} from "../../../tests/fixtures/vrm.mjs";
const temporary: string[] = [];
afterEach(async()=>{for(const path of temporary.splice(0))await rm(path,{recursive:true,force:true})});
function fixture(json: unknown): Uint8Array {const text=Buffer.from(JSON.stringify(json));const size=Math.ceil(text.length/4)*4;const b=Buffer.alloc(20+size,32);b.writeUInt32LE(0x46546c67,0);b.writeUInt32LE(2,4);b.writeUInt32LE(b.length,8);b.writeUInt32LE(size,12);b.writeUInt32LE(0x4e4f534a,16);text.copy(b,20);return b}
async function setup(){const root=await mkdtemp(join(tmpdir(),"vrm-prepare-test-"));temporary.push(root);const model=join(root,"source.vrm");await writeFile(model,modelFixture());return {root,model,output:join(root,"output")}}
it("prepares a hashed bundle and refuses overwrite or tampering",async()=>{
 const request=await setup();const manifest=await prepareModel(request);expect(manifest.publication.allowRedistribution).toBe(false);
 expect((await readPreparedBundle(request.output)).files.size).toBe(1);
 await expect(prepareModel(request)).rejects.toThrow("already exists");
 await writeFile(join(request.output,"model.vrm"),"damaged");await expect(readPreparedBundle(request.output)).rejects.toThrow("hash mismatch");
});
it("validates before touching destination and rejects external references",async()=>{
 const request=await setup();await writeFile(request.model,fixture({asset:{version:"2.0"},extensions:{VRM:{specVersion:"0.0"}},buffers:[{uri:"../private.bin"}]}));
 await expect(prepareModel(request)).rejects.toThrow("external");await expect(readFile(join(request.output,"manifest.json"))).rejects.toThrow();
});
it("rejects traversal and symlinks escaping a prepared bundle",async()=>{
 const request=await setup();const manifest=await prepareModel(request);manifest.model.file="../source.vrm";
 await writeFile(join(request.output,"manifest.json"),JSON.stringify(manifest));await expect(readPreparedBundle(request.output)).rejects.toThrow("invalid manifest asset");
 await symlink(request.model,join(request.output,"escape.vrm"));manifest.model.file="escape.vrm";await writeFile(join(request.output,"manifest.json"),JSON.stringify(manifest));await expect(readPreparedBundle(request.output)).rejects.toThrow("leaves bundle");
});

it("accepts a neutral profile bound to embedded Idle or the bundled baseline",async()=>{
 const request=await setup(), bytes=Uint8Array.from(modelFixture()).buffer, json=parseGlb(bytes,"vrm");
 const binary=Buffer.from(bytes.slice(28+new DataView(bytes).getUint32(12,true))),times=new Float32Array([0,1]),rotations=new Float32Array([0,0,0,1,0,0,0,1]);
 const view=json.bufferViews.length,accessor=json.accessors.length;
 json.bufferViews.push({buffer:0,byteOffset:binary.length,byteLength:times.byteLength},{buffer:0,byteOffset:binary.length+times.byteLength,byteLength:rotations.byteLength});
 json.accessors.push({bufferView:view,componentType:5126,count:2,type:"SCALAR",min:[0],max:[1]},{bufferView:view+1,componentType:5126,count:2,type:"VEC4"});
 const bin=Buffer.concat([binary,Buffer.from(times.buffer),Buffer.from(rotations.buffer)]);json.buffers[0].byteLength=bin.length;
 json.animations=[{name:"Idle",samplers:[{input:accessor,output:accessor+1}],channels:[{sampler:0,target:{node:2,path:"rotation"}}]}];
 await writeFile(request.model,glb(json,bin));
 const profile=join(request.root,"profile.json"),base={schemaVersion:1,type:"weiguang",neutralPose:{},earPoses:{Neutral:{}},earBones:[],expressions:{},accessories:{collar:"Collar",cone:"Cone",collarVisible:true,coneVisible:false},blink:{period:4,curve:[[0,0],[4,0]]}};
 for(const name of ["Idle","StarLiteIdle"]){
  const output=join(request.root,name);await writeFile(profile,JSON.stringify({...base,neutralAnimation:name}));
  await prepareModel({...request,profile,output});expect((await readPreparedBundle(output)).files.size).toBe(2);
 }
 await writeFile(profile,JSON.stringify({...base,neutralAnimation:"Missing"}));
 await expect(prepareModel({...request,profile})).rejects.toThrow("neutral animation is missing");
});
