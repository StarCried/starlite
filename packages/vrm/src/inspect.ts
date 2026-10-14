type Json = Record<string, any>;
export const MAX_MODEL_BYTES = 64 * 1024 * 1024;
export const MAX_ANIMATION_BYTES = 16 * 1024 * 1024;
export function parseGlb(bytes: ArrayBuffer, kind: "vrm" | "vrma"): Json {
  const limit = kind === "vrm" ? MAX_MODEL_BYTES : MAX_ANIMATION_BYTES;
  if (bytes.byteLength < 20 || bytes.byteLength > limit) throw new Error("invalid GLB size");
  const view = new DataView(bytes);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.byteLength) throw new Error("invalid GLB header");
  let json: Json | undefined;
  let binSize = 0;
  let binStart = 0;
  let chunkCount = 0;
  for (let offset = 12; offset < bytes.byteLength;) {
    if (offset + 8 > bytes.byteLength) throw new Error("truncated GLB chunk");
    const size = view.getUint32(offset, true), type = view.getUint32(offset + 4, true);
    offset += 8;
    if (size % 4 || size > bytes.byteLength - offset) throw new Error("invalid GLB chunk length");
    if (chunkCount === 0 && type === 0x4e4f534a) {
      json = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes, offset, size)));
    } else if (chunkCount === 1 && type === 0x004e4942) { binSize = size; binStart = offset; }
    else throw new Error("unexpected GLB chunk");
    offset += size; chunkCount++;
  }
  if (!json || json.asset?.version !== "2.0") throw new Error("glTF 2.0 is required");
  const expected = kind === "vrm" ? (json.extensions?.VRM ?? json.extensions?.VRMC_vrm) : json.extensions?.VRMC_vrm_animation;
  if (!expected) throw new Error(`missing ${kind} extension`);
  if (kind === "vrm" && json.extensions?.VRM && json.extensions.VRM.specVersion !== "0.0") throw new Error("unsupported VRM version");
  if (kind === "vrm" && json.extensions?.VRMC_vrm && json.extensions.VRMC_vrm.specVersion !== "1.0") throw new Error("unsupported VRM version");
  if (kind === "vrma" && expected.specVersion !== "1.0") throw new Error("VRMA 1.0 is required");
  const allowed = new Set(["VRM", "VRMC_vrm", "VRMC_vrm_animation", "VRMC_materials_mtoon", "VRMC_springBone", "VRMC_node_constraint", "VRMC_materials_hdr_emissiveMultiplier", "KHR_materials_unlit", "KHR_texture_transform", "KHR_materials_emissive_strength"]);
  if ((json.extensionsRequired ?? []).some((name: string) => !allowed.has(name))) throw new Error("unsupported required glTF extension");
  // No externally resolved buffers, images or extension URIs. The loader only
  // receives self-contained GLB; model import cannot access the network or disk.
  const visit = (value: unknown, depth = 0): void => {
    if (depth > 64) throw new Error("glTF nesting limit exceeded");
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (key === "uri") throw new Error("external glTF resources are not supported");
      if (typeof child === "number" && !Number.isFinite(child)) throw new Error("non-finite glTF value");
      visit(child, depth + 1);
    }
  };
  visit(json);
  if ((json.buffers?.length ?? 0) > 1 || (json.buffers?.[0]?.byteLength ?? 0) > binSize) throw new Error("invalid GLB buffer");
  for (const buffer of json.bufferViews ?? []) {
    const start = buffer.byteOffset ?? 0, length = buffer.byteLength;
    if (buffer.buffer !== 0 || !Number.isSafeInteger(start) || !Number.isSafeInteger(length) || start < 0 || length < 0 || start + length > (json.buffers?.[0]?.byteLength ?? 0)) throw new Error("invalid glTF buffer view");
  }
  if ((json.nodes?.length ?? 0) > 4096 || (json.accessors?.length ?? 0) > 32768) throw new Error("glTF resource count exceeded");
  validateStructure(json, new DataView(bytes, binStart, binSize));
  return json;
}

export function embeddedAnimationCatalog(json: Json): { name: string; durationMs: number }[] {
  const animations = json.animations ?? [];
  if (!Array.isArray(animations) || animations.length > 64) throw new Error("at most 64 embedded animations are supported");
  const names = new Set<string>();
  return animations.map((animation: Json, index: number) => {
    const name = animation.name ?? "Animation_" + (index + 1);
    if (typeof name !== "string" || !name.trim() || new TextEncoder().encode(name).length > 128 || /[\u0000-\u001f\u007f]/.test(name) || name === "StarLiteIdle" || names.has(name)) throw new Error("invalid or duplicate embedded animation name");
    names.add(name);
    let duration = 0;
    for (const sampler of animation.samplers ?? []) {
      const accessor = json.accessors?.[sampler.input];
      if (!accessor || accessor.type !== "SCALAR" || accessor.componentType !== 5126 || !Number.isFinite(accessor.max?.[0])) throw new Error("embedded animation has invalid animation times");
      duration = Math.max(duration, accessor.max[0]);
    }
    if (!(duration > 0) || duration > 600) throw new Error("embedded animation duration must be between 0 and 600 seconds");
    return { name, durationMs: duration * 1000 };
  });
}

export function inspectVrm(bytes: ArrayBuffer): { version: "0" | "1"; name?: string; expressions: string[]; animations: { name: string; durationMs: number }[] } {
  const json = parseGlb(bytes, "vrm");
  const v0 = json.extensions.VRM;
  const humanoid = (v0 ?? json.extensions.VRMC_vrm).humanoid?.humanBones;
  const bones = v0 ? Object.fromEntries((humanoid ?? []).map((b:Json) => [b.bone,b])) : humanoid;
  const required = ["hips","spine","head", ...["left","right"].flatMap(side => ["UpperLeg","LowerLeg","Foot","UpperArm","LowerArm","Hand"].map(part=>side+part))];
  const used = new Set<number>();
  for (const name of required) {
    const node = bones?.[name]?.node;
    if (!Number.isSafeInteger(node) || !json.nodes?.[node] || used.has(node)) throw new Error("invalid required humanoid bone");
    used.add(node);
  }
  const usableBlink = (name: string): boolean => {
    const expressions = v0?.blendShapeMaster?.blendShapeGroups;
    const binds = v0 ? expressions?.find((item: Json) => item.presetName === name)?.binds
      : json.extensions.VRMC_vrm.expressions?.preset?.[name]?.morphTargetBinds;
    return Array.isArray(binds) && binds.some((bind: Json) => {
      const mesh = v0 ? bind.mesh : json.nodes?.[bind.node]?.mesh;
      const primitives = json.meshes?.[mesh]?.primitives;
      return Number.isSafeInteger(mesh) && Number.isSafeInteger(bind.index) && bind.index >= 0
        && Number.isFinite(bind.weight) && bind.weight > 0 && bind.weight <= (v0 ? 100 : 1)
        && Array.isArray(primitives) && primitives.some((primitive: Json) => primitive.targets?.[bind.index] !== undefined);
    });
  };
  if (!usableBlink("blink") && !(v0 ? usableBlink("blink_l") && usableBlink("blink_r") : usableBlink("blinkLeft") && usableBlink("blinkRight"))) {
    throw new Error("VRM needs usable blink morph bindings, or both left and right blink presets");
  }
  const meta = (v0 ?? json.extensions.VRMC_vrm).meta ?? {};
  const name = v0 ? meta.title : meta.name;
  return {
    version: v0 ? "0" : "1",
    ...(typeof name === "string" ? { name } : {}),
    animations: embeddedAnimationCatalog(json),
    expressions: v0 ? (v0.blendShapeMaster?.blendShapeGroups ?? []).map((group: Json) => group.name) : Object.keys({ ...json.extensions.VRMC_vrm.expressions?.preset, ...json.extensions.VRMC_vrm.expressions?.custom }),
  };
}

export function inspectVrma(bytes: ArrayBuffer): { durationMs: number } {
  const json = parseGlb(bytes, "vrma");
  if (json.animations?.length !== 1) throw new Error("each VRMA file must contain exactly one animation");
  let duration = 0;
  for (const sampler of json.animations[0].samplers ?? []) {
    const accessor = json.accessors?.[sampler.input];
    if (!accessor || accessor.type !== "SCALAR" || accessor.componentType !== 5126 || !Number.isFinite(accessor.max?.[0])) throw new Error("VRMA has invalid animation times");
    duration = Math.max(duration, accessor.max[0]);
  }
  if (!(duration > 0) || duration > 600) throw new Error("VRMA duration must be between 0 and 600 seconds");
  return { durationMs: duration * 1000 };
}

function validateStructure(json: Json, binary: DataView): void {
  for (const key of ["nodes", "accessors", "bufferViews", "buffers", "meshes", "images", "animations", "skins", "scenes"]) {
    if (json[key] !== undefined && !Array.isArray(json[key])) throw new Error(`invalid glTF ${key}`);
  }
  const views = json.bufferViews ?? [], nodes = json.nodes ?? [], accessors = json.accessors ?? [];
  const integer = (n: any, min: number, max: number) => Number.isSafeInteger(n) && n >= min && n <= max;
  const index = (n: any, array: any[]) => integer(n, 0, array.length - 1);
  const seen = new Set<number>(), active = new Set<number>(), parents = new Set<number>();
  const walk = (i: number, depth: number) => {
    if (!index(i, nodes) || active.has(i) || depth > 128) throw new Error("invalid glTF node hierarchy");
    if (seen.has(i)) return;
    const node = nodes[i]; if (!node || typeof node !== "object") throw new Error("invalid glTF node");
    seen.add(i); active.add(i);
    if (node.children !== undefined && !Array.isArray(node.children)) throw new Error("invalid node children");
    for (const child of node.children ?? []) { if (parents.has(child)) throw new Error("node has multiple parents"); parents.add(child); walk(child, depth + 1); }
    active.delete(i);
  };
  for (let i = 0; i < nodes.length; i++) walk(i, 0);
  const components: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
  const sizes: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
  let decoded = 0;
  const span = (viewIndex: number, offset: number, count: number, element: number, alignment: number, strided = false) => {
    if (!index(viewIndex, views)) throw new Error("invalid accessor buffer view");
    const v = views[viewIndex], stride = strided ? (v.byteStride ?? element) : element;
    if (!integer(offset, 0, v.byteLength) || offset % alignment || !integer(stride, element, 256) || stride % alignment || offset + (count - 1) * stride + element > v.byteLength) throw new Error("accessor exceeds buffer view");
    return (v.byteOffset ?? 0) + offset;
  };
  for (const a of accessors) {
    const width = sizes[a?.componentType], count = a?.count, componentsCount = components[a?.type];
    if (!width || !componentsCount || !integer(count, 1, 2000000)) throw new Error("invalid accessor allocation");
    const dimension = a.type === "MAT2" ? 2 : a.type === "MAT3" ? 3 : a.type === "MAT4" ? 4 : 0;
    const element = dimension ? Math.ceil(dimension * width / 4) * 4 * dimension : width * componentsCount;
    decoded += element * count;
    if (decoded > 256 * 1024 * 1024) throw new Error("decoded geometry exceeds 256 MiB");
    const checkFloats = (at:number,n:number,stride:number) => {
      if(a.componentType!==5126) return;
      for(let k=0;k<n;k++)for(let c=0;c<componentsCount;c++)if(!Number.isFinite(binary.getFloat32(at+k*stride+c*4,true)))throw new Error("non-finite accessor value");
    };
    if (a.bufferView !== undefined) {
      const at=span(a.bufferView,a.byteOffset??0,count,element,width,true);
      checkFloats(at,count,views[a.bufferView].byteStride??element);
    }
    if (a.sparse) {
      const sparse = a.sparse, n = sparse.count, iw = sizes[sparse.indices?.componentType];
      if (!integer(n, 1, count) || ![5121, 5123, 5125].includes(sparse.indices?.componentType)) throw new Error("invalid sparse accessor");
      const at = span(sparse.indices.bufferView, sparse.indices.byteOffset ?? 0, n, iw!, iw!);
      const valuesAt=span(sparse.values?.bufferView, sparse.values?.byteOffset ?? 0, n, element, width);
      checkFloats(valuesAt,n,element);
      let previous = -1;
      for (let k = 0; k < n; k++) {
        const offset = at + k * iw!; const next = iw === 1 ? binary.getUint8(offset) : iw === 2 ? binary.getUint16(offset, true) : binary.getUint32(offset, true);
        if (next <= previous || next >= count) throw new Error("invalid sparse index"); previous = next;
      }
    }
  }
  for (const animation of json.animations ?? []) {
    if (!Array.isArray(animation.samplers) || !Array.isArray(animation.channels)) throw new Error("invalid animation");
    for (const channel of animation.channels) {
      if (!index(channel.sampler, animation.samplers) || !index(channel.target?.node, nodes) || !["translation", "rotation", "scale", "weights"].includes(channel.target?.path)) throw new Error("invalid animation channel");
    }
    for (const sampler of animation.samplers) {
      if (!index(sampler.input, accessors) || !index(sampler.output, accessors)) throw new Error("invalid animation accessor");
      const a = accessors[sampler.input];
      if (a.type !== "SCALAR" || a.componentType !== 5126 || a.sparse || a.bufferView === undefined) throw new Error("invalid animation timeline");
      const start = span(a.bufferView, a.byteOffset ?? 0, a.count, 4, 4); let previous = -1;
      for (let i = 0; i < a.count; i++) {
        const time = binary.getFloat32(start + i * 4, true);
        if (!Number.isFinite(time) || time <= previous || time < 0 || time > 600) throw new Error("invalid animation times"); previous = time;
      }
      if (!Array.isArray(a.max) || Math.abs(a.max[0] - previous) > .001) throw new Error("animation duration does not match timeline");
      if (sampler.interpolation !== undefined && !["LINEAR", "STEP", "CUBICSPLINE"].includes(sampler.interpolation)) throw new Error("unsupported animation interpolation");
    }
  }
}
