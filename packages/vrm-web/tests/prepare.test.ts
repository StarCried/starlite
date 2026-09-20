import { afterEach, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareModel, readPreparedBundle } from "../src/prepare.js";
const temporary: string[] = [];
afterEach(async()=>{for(const path of temporary.splice(0))await rm(path,{recursive:true,force:true})});
function fixture(json: unknown): Uint8Array {const text=Buffer.from(JSON.stringify(json));const size=Math.ceil(text.length/4)*4;const b=Buffer.alloc(20+size,32);b.writeUInt32LE(0x46546c67,0);b.writeUInt32LE(2,4);b.writeUInt32LE(b.length,8);b.writeUInt32LE(size,12);b.writeUInt32LE(0x4e4f534a,16);text.copy(b,20);return b}
async function setup(){const root=await mkdtemp(join(tmpdir(),"vrm-prepare-test-"));temporary.push(root);const model=join(root,"source.vrm");await writeFile(model,fixture({asset:{version:"2.0"},extensions:{VRM:{specVersion:"0.0"}}}));return {root,model,output:join(root,"output")}}
it("prepares a hashed bundle and refuses overwrite or tampering",async()=>{
 const request=await setup();const manifest=await prepareModel(request);expect(manifest.publication.allowRedistribution).toBe(false);
 expect((await readPreparedBundle(request.output)).files.size).toBe(1);
 await expect(prepareModel(request)).rejects.toThrow("already exists");
 await writeFile(join(request.output,"model.vrm"),"damaged");await expect(readPreparedBundle(request.output)).rejects.toThrow("hash mismatch");
});
it("validates before touching destination and rejects external references",async()=>{
 const request=await setup();await writeFile(request.model,fixture({asset:{version:"2.0"},extensions:{VRM:{}},buffers:[{uri:"../private.bin"}]}));
 await expect(prepareModel(request)).rejects.toThrow("external");await expect(readFile(join(request.output,"manifest.json"))).rejects.toThrow();
});
it("rejects traversal and symlinks escaping a prepared bundle",async()=>{
 const request=await setup();const manifest=await prepareModel(request);manifest.model.file="../source.vrm";
 await writeFile(join(request.output,"manifest.json"),JSON.stringify(manifest));await expect(readPreparedBundle(request.output)).rejects.toThrow("invalid manifest asset");
 await symlink(request.model,join(request.output,"escape.vrm"));manifest.model.file="escape.vrm";await writeFile(join(request.output,"manifest.json"),JSON.stringify(manifest));await expect(readPreparedBundle(request.output)).rejects.toThrow("leaves bundle");
});
