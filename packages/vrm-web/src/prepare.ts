import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { inspectVrm, inspectVrma, MAX_MODEL_BYTES, MAX_ANIMATION_BYTES } from "./inspect.js";
import { validateCharacterProfile } from "./config.js";
import type { CharacterProfile } from "./types.js";
export interface AssetRecord { file: string; sha256: string; bytes: number }
export interface VrmManifest {
 schemaVersion: 1; tool: "vrm-companion-assets"; backend: "vrm";
 model: AssetRecord & { sourceSha256: string };
 animations: (AssetRecord & { name: string; durationMs: number })[];
 profile?: AssetRecord;
 publication: { allowRedistribution: boolean };
}
export interface PrepareRequest { model: string; animations?: { name: string; path: string }[]; profile?: string; output: string; allowRedistribution?: boolean }
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const arrayBuffer = (bytes: Uint8Array) => Uint8Array.from(bytes).buffer;
async function bounded(path: string, maximum: number): Promise<Buffer> {
 const info = await lstat(path); if (!info.isFile() || info.size > maximum) throw new Error("invalid asset size or file type");
 const bytes = await readFile(path); if (bytes.byteLength > maximum) throw new Error("asset exceeds byte limit"); return bytes;
}
function animationNames(animations: {name:string}[]): void {
 if (!Array.isArray(animations) || animations.length > 64) throw new Error("invalid animation collection");
 const names = new Set<string>();
 for (const a of animations) { if (!a || typeof a.name !== "string" || !a.name.trim() || a.name.length > 128 || names.has(a.name)) throw new Error("duplicate or invalid animation name"); names.add(a.name); }
}
function profileNames(profile: CharacterProfile, animations: {name:string}[]): void {
 if (profile.neutralAnimation && !animations.some(a => a.name === profile.neutralAnimation)) throw new Error("profile neutral animation is missing");
}
/** Validate every source before creating output. Never overwrite an existing bundle. */
export async function prepareModel(request: PrepareRequest): Promise<VrmManifest> {
 const bytes = await bounded(request.model, MAX_MODEL_BYTES); inspectVrm(arrayBuffer(bytes));
 const animations = request.animations ?? []; animationNames(animations);
 const files = new Map<string, Buffer>([["model.vrm", bytes]]);
 const record = (file:string, data:Buffer): AssetRecord => ({ file, sha256:hash(data), bytes:data.byteLength });
 const manifest: VrmManifest = { schemaVersion:1, tool:"vrm-companion-assets", backend:"vrm", model:{...record("model.vrm",bytes),sourceSha256:hash(bytes)}, animations:[], publication:{allowRedistribution:request.allowRedistribution === true} };
 let total = 0;
 for (const [i, source] of animations.entries()) {
  const data = await bounded(source.path, MAX_ANIMATION_BYTES); total += data.byteLength;
  if (total > 64*1024*1024) throw new Error("animation collection exceeds 64 MiB");
  const {durationMs} = inspectVrma(arrayBuffer(data)); const file = `motions/${i}.vrma`;
  files.set(file,data); manifest.animations.push({...record(file,data),name:source.name,durationMs});
 }
 if (request.profile) {
  const data = await bounded(request.profile, 1024*1024); const profile:unknown = JSON.parse(data.toString("utf8")); validateCharacterProfile(profile); profileNames(profile,animations);
  files.set("profile.json",data); manifest.profile = record("profile.json",data);
 }
 const output = resolve(request.output); await mkdir(dirname(output),{recursive:true});
 try { await lstat(output); throw new Error("output already exists"); } catch(error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
 const stage = await mkdtemp(join(dirname(output),".vrm-stage-"));
 try {
  for (const [file,data] of files) { const path = join(stage,file); await mkdir(dirname(path),{recursive:true}); await writeFile(path,data,{flag:"wx"}); }
  await writeFile(join(stage,"manifest.json"),JSON.stringify(manifest,null,2)+"\n",{flag:"wx"});
  await rename(stage,output); return manifest;
 } catch(error) { await rm(stage,{recursive:true,force:true}); throw error; }
}
/** Read only declared, hashed files contained in the prepared bundle. */
export async function readPreparedBundle(directory: string): Promise<{manifest:VrmManifest;files:Map<string,Buffer>}> {
 const root = await realpath(directory), raw = await bounded(join(root,"manifest.json"),1024*1024);
 const manifest = JSON.parse(raw.toString("utf8")) as VrmManifest;
 if (manifest.schemaVersion !== 1 || manifest.tool !== "vrm-companion-assets" || manifest.backend !== "vrm" || typeof manifest.publication?.allowRedistribution !== "boolean" || !/^[a-f0-9]{64}$/.test(manifest.model?.sourceSha256)) throw new Error("invalid VRM manifest");
 animationNames(manifest.animations);
 const files = new Map<string,Buffer>();
 const load = async (item:AssetRecord, maximum:number) => {
  if (!item || typeof item.file !== "string" || !item.file || isAbsolute(item.file) || /[\\:?%#]/.test(item.file) || item.file.split("/").some(p => !p || p === "." || p === "..") || files.has(item.file) || !/^[a-f0-9]{64}$/.test(item.sha256) || !Number.isSafeInteger(item.bytes) || item.bytes < 1 || item.bytes > maximum) throw new Error("invalid manifest asset");
  const path = await realpath(join(root,item.file)), part = relative(root,path);
  if (isAbsolute(part) || part === ".." || part.startsWith("../") || part.startsWith("..\\")) throw new Error("manifest asset leaves bundle");
  const bytes = await bounded(path,maximum);
  if (bytes.byteLength !== item.bytes || hash(bytes) !== item.sha256) throw new Error("manifest asset hash mismatch");
  files.set(item.file,bytes); return bytes;
 };
 inspectVrm(arrayBuffer(await load(manifest.model,MAX_MODEL_BYTES)));
 let total = 0;
 for (const item of manifest.animations) {
  const bytes = await load(item,MAX_ANIMATION_BYTES); total += bytes.byteLength;
  if (total > 64*1024*1024) throw new Error("animation collection exceeds 64 MiB");
  const inspected = inspectVrma(arrayBuffer(bytes));
  if (!Number.isFinite(item.durationMs) || Math.abs(inspected.durationMs-item.durationMs) > 1) throw new Error("manifest animation duration mismatch");
 }
 if (manifest.profile) { const bytes = await load(manifest.profile,1024*1024); const profile:unknown = JSON.parse(bytes.toString("utf8")); validateCharacterProfile(profile); profileNames(profile,manifest.animations); }
 return {manifest,files};
}
