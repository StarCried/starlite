type Json = Record<string, any>;
export type VrmInspectionErrorCode = "INVALID_GLB" | "UNSUPPORTED_FORMAT" | "UNSUPPORTED_VERSION" | "UNSUPPORTED_EXTENSION" | "EXTERNAL_RESOURCE" | "RESOURCE_LIMIT" | "INVALID_STRUCTURE" | "HUMANOID_BONES" | "INVALID_BLINK" | "INVALID_LOOK_AT" | "INVALID_ANIMATION";
export interface VrmInspectionErrorDetails {
  missingBones?: readonly string[];
  invalidBones?: readonly string[];
  duplicateBones?: readonly string[];
  preset?: string;
}
/** Controlled diagnostic text only: never include input paths, URIs or JSON text. */
export class VrmInspectionError extends Error {
  readonly code: VrmInspectionErrorCode;
  readonly details: Readonly<VrmInspectionErrorDetails>;
  constructor(code: VrmInspectionErrorCode, message: string, details: VrmInspectionErrorDetails = {}) {
    super(message);
    this.name = "VrmInspectionError";
    this.code = code;
    this.details = details;
  }
}
export interface VrmInspection {
  version: "0" | "1";
  name?: string;
  expressions: string[];
  animations: { name: string; durationMs: number }[];
  capabilities: {
    humanoid: { requiredBones: string[]; optionalBones: string[] };
    blink: { automatic: boolean; combined: boolean; left: boolean; right: boolean };
    lookAt: { mode: "bone" | "expression" | "none"; head: boolean; eyes: boolean; horizontal: boolean; vertical: boolean };
  };
  /** Logical accessor bytes and aggregate mesh primitive counts, not GPU memory. */
  metrics: { fileBytes: number; nodeCount: number; meshCount: number; primitiveCount: number; materialCount: number; textureCount: number; imageCount: number; vertexCount: number; triangleCount: number; morphTargetCount: number; decodedAccessorBytes: number };
}
const requiredBones = ["hips", "spine", "head", ...["left", "right"].flatMap(side => ["UpperLeg", "LowerLeg", "Foot", "UpperArm", "LowerArm", "Hand"].map(part => side + part))];
const optionalBones = ["chest", "upperChest", "neck", "jaw", ...["left", "right"].flatMap(side => ["Eye", "Shoulder", "Toes", ...["ThumbMetacarpal", "ThumbProximal", "ThumbIntermediate", "ThumbDistal", ...["Index", "Middle", "Ring", "Little"].flatMap(finger => ["Proximal", "Intermediate", "Distal"].map(part => finger + part))]].map(part => side + part))];
export const MAX_MODEL_BYTES = 64 * 1024 * 1024;
export const MAX_ANIMATION_BYTES = 16 * 1024 * 1024;
export function parseGlb(bytes: ArrayBuffer, kind: "vrm" | "vrma"): Json {
  try { return parseGlbContents(bytes, kind); }
  catch (error) {
    if (error instanceof VrmInspectionError) throw error;
    // Type errors from malformed object shapes must not expose raw input.
    throw new VrmInspectionError("INVALID_STRUCTURE", "invalid glTF structure; re-export a self-contained VRM/VRMA file");
  }
}
function parseGlbContents(bytes: ArrayBuffer, kind: "vrm" | "vrma"): Json {
  const limit = kind === "vrm" ? MAX_MODEL_BYTES : MAX_ANIMATION_BYTES;
  if (bytes.byteLength < 20 || bytes.byteLength > limit) throw new VrmInspectionError("INVALID_GLB", `invalid GLB size; ${kind.toUpperCase()} must be a binary glTF 2.0 file no larger than ${limit / 1024 / 1024} MiB`);
  const view = new DataView(bytes);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.byteLength) throw new VrmInspectionError("INVALID_GLB", "invalid GLB header; export binary glTF 2.0 VRM/VRMA, not FBX or JSON glTF");
  let json: Json | undefined;
  let binSize = 0;
  let binStart = 0;
  let chunkCount = 0;
  for (let offset = 12; offset < bytes.byteLength;) {
    if (offset + 8 > bytes.byteLength) throw new VrmInspectionError("INVALID_GLB", "truncated GLB chunk; download or export the complete file again");
    const size = view.getUint32(offset, true), type = view.getUint32(offset + 4, true);
    offset += 8;
    if (size % 4 || size > bytes.byteLength - offset) throw new VrmInspectionError("INVALID_GLB", "invalid GLB chunk length; download or export the complete file again");
    if (chunkCount === 0 && type === 0x4e4f534a) {
      try { json = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes, offset, size))); }
      catch { throw new VrmInspectionError("INVALID_GLB", "invalid GLB JSON; re-export the file with a VRM exporter"); }
    } else if (chunkCount === 1 && type === 0x004e4942) { binSize = size; binStart = offset; }
    else throw new VrmInspectionError("INVALID_GLB", "unexpected GLB chunk; export a self-contained VRM/VRMA file");
    offset += size; chunkCount++;
  }
  if (!json || typeof json !== "object" || Array.isArray(json) || json.asset?.version !== "2.0") throw new VrmInspectionError("UNSUPPORTED_FORMAT", "glTF 2.0 is required; use a VRM/VRMA exporter");
  const expected = kind === "vrm" ? (json.extensions?.VRM ?? json.extensions?.VRMC_vrm) : json.extensions?.VRMC_vrm_animation;
  if (!expected) throw new VrmInspectionError("UNSUPPORTED_FORMAT", `missing ${kind} extension; export ${kind === "vrm" ? "VRM 0.0 or 1.0" : "VRMA 1.0"}, not a plain GLB`);
  if (kind === "vrm" && json.extensions?.VRM && json.extensions.VRM.specVersion !== "0.0") throw new VrmInspectionError("UNSUPPORTED_VERSION", "unsupported VRM version; export VRM 0.0 or 1.0");
  if (kind === "vrm" && json.extensions?.VRMC_vrm && json.extensions.VRMC_vrm.specVersion !== "1.0") throw new VrmInspectionError("UNSUPPORTED_VERSION", "unsupported VRM version; export VRM 0.0 or 1.0");
  if (kind === "vrma" && expected.specVersion !== "1.0") throw new VrmInspectionError("UNSUPPORTED_VERSION", "VRMA 1.0 is required");
  const allowed = new Set(["VRM", "VRMC_vrm", "VRMC_vrm_animation", "VRMC_materials_mtoon", "VRMC_springBone", "VRMC_node_constraint", "VRMC_materials_hdr_emissiveMultiplier", "KHR_materials_unlit", "KHR_texture_transform", "KHR_materials_emissive_strength"]);
  if ((json.extensionsRequired ?? []).some((name: string) => !allowed.has(name))) throw new VrmInspectionError("UNSUPPORTED_EXTENSION", "unsupported required glTF extension; re-export without geometry or texture compression extensions");
  // No externally resolved buffers, images or extension URIs. The loader only
  // receives self-contained GLB; model import cannot access the network or disk.
  const visit = (value: unknown, depth = 0): void => {
    if (depth > 64) throw new VrmInspectionError("RESOURCE_LIMIT", "glTF nesting limit exceeded");
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (key === "uri") throw new VrmInspectionError("EXTERNAL_RESOURCE", "external glTF resources are not supported; embed all textures and buffers in one VRM/VRMA file");
      if (typeof child === "number" && !Number.isFinite(child)) throw new VrmInspectionError("INVALID_STRUCTURE", "non-finite glTF value");
      visit(child, depth + 1);
    }
  };
  visit(json);
  if ((json.buffers?.length ?? 0) > 1 || (json.buffers?.[0]?.byteLength ?? 0) > binSize) throw new VrmInspectionError("INVALID_STRUCTURE", "invalid GLB buffer");
  for (const buffer of json.bufferViews ?? []) {
    const start = buffer.byteOffset ?? 0, length = buffer.byteLength;
    if (buffer.buffer !== 0 || !Number.isSafeInteger(start) || !Number.isSafeInteger(length) || start < 0 || length < 0 || start + length > (json.buffers?.[0]?.byteLength ?? 0)) throw new VrmInspectionError("INVALID_STRUCTURE", "invalid glTF buffer view");
  }
  if ((json.nodes?.length ?? 0) > 4096 || (json.accessors?.length ?? 0) > 32768) throw new VrmInspectionError("RESOURCE_LIMIT", "glTF resource count exceeded");
  validateStructure(json, new DataView(bytes, binStart, binSize));
  return json;
}

export function embeddedAnimationCatalog(json: Json): { name: string; durationMs: number }[] {
  const animations = json.animations ?? [];
  if (!Array.isArray(animations) || animations.length > 64) throw new VrmInspectionError("INVALID_ANIMATION", "at most 64 embedded animations are supported");
  const names = new Set<string>();
  return animations.map((animation: Json, index: number) => {
    const name = animation.name ?? "Animation_" + (index + 1);
    if (typeof name !== "string" || !name.trim() || new TextEncoder().encode(name).length > 128 || /[\u0000-\u001f\u007f]/.test(name) || name === "StarLiteIdle" || names.has(name)) throw new VrmInspectionError("INVALID_ANIMATION", "invalid or duplicate embedded animation name; use unique names of at most 128 UTF-8 bytes, excluding StarLiteIdle");
    names.add(name);
    let duration = 0;
    for (const sampler of animation.samplers ?? []) {
      const accessor = json.accessors?.[sampler.input];
      if (!accessor || accessor.type !== "SCALAR" || accessor.componentType !== 5126 || !Number.isFinite(accessor.max?.[0])) throw new VrmInspectionError("INVALID_ANIMATION", "embedded animation has invalid animation times");
      duration = Math.max(duration, accessor.max[0]);
    }
    if (!(duration > 0) || duration > 600) throw new VrmInspectionError("INVALID_ANIMATION", "embedded animation duration must be between 0 and 600 seconds");
    return { name, durationMs: duration * 1000 };
  });
}

export function inspectVrm(bytes: ArrayBuffer): VrmInspection {
  const json = parseGlb(bytes, "vrm");
  const v0 = json.extensions.VRM;
  const extension = v0 ?? json.extensions.VRMC_vrm;
  if (Array.isArray(json.extensionsUsed) && !json.extensionsUsed.includes(v0 ? "VRM" : "VRMC_vrm")) throw new VrmInspectionError("UNSUPPORTED_FORMAT", "missing VRM extension declaration; re-export with the VRM exporter");
  const bones = inspectHumanBones(json, extension.humanoid?.humanBones, Boolean(v0));
  // Blink is an optional capability. Declared bindings must still be valid;
  // missing, empty or zero-weight presets simply provide no automatic blink.
  const blinkNames = v0 ? ["blink", "blink_l", "blink_r"] : ["blink", "blinkLeft", "blinkRight"];
  const groups = v0?.blendShapeMaster?.blendShapeGroups;
  if (groups !== undefined && !Array.isArray(groups)) throw new VrmInspectionError("INVALID_BLINK", "invalid VRM blink expressions; re-export the blink presets");
  const aliases: Record<string, string> = { a: "aa", e: "ee", i: "ih", o: "oh", u: "ou", joy: "happy", angry: "angry", sorrow: "sad", fun: "relaxed", neutral: "neutral", blink: "blink", blink_l: "blinkLeft", blink_r: "blinkRight", lookup: "lookUp", lookdown: "lookDown", lookleft: "lookLeft", lookright: "lookRight" };
  // VRM0 also allows custom expressions with a canonical preset name. Match
  // the loader's first-registration rule instead of inventing capabilities
  // from a later duplicate preset that will be ignored.
  const registeredName = (item: Json): string | undefined => aliases[item?.presetName] ?? item?.name;
  const expression = (name: string): Json | undefined => v0 ? (groups ?? []).find((item: Json) => registeredName(item) === (aliases[name] ?? name)) : extension.expressions?.preset?.[name];
  // Validate every declared preset, even a duplicate that the loader ignores.
  for (const preset of blinkNames) {
    const presets = v0 ? (groups ?? []).filter((item: Json) => registeredName(item) === aliases[preset]) : expression(preset) === undefined ? [] : [expression(preset)];
    for (const item of presets) inspectMorphExpression(json, item, Boolean(v0), "INVALID_BLINK", preset);
  }
  const [combined, left, right] = blinkNames.map(preset => inspectMorphExpression(json, expression(preset), Boolean(v0), "INVALID_BLINK", preset));
  const meta = extension.meta ?? {};
  const name = v0 ? meta.title : meta.name;
  return {
    version: v0 ? "0" : "1",
    ...(typeof name === "string" ? { name: safeLabel(name) } : {}),
    animations: embeddedAnimationCatalog(json),
    expressions: (v0 ? (groups ?? []).map((group: Json) => group?.name) : Object.keys({ ...extension.expressions?.preset, ...extension.expressions?.custom })).filter((value: unknown): value is string => typeof value === "string").map(safeLabel),
    capabilities: {
      humanoid: { requiredBones: [...requiredBones], optionalBones: optionalBones.filter(name => bones.has(name)) },
      blink: { automatic: Boolean(combined || (left && right)), combined: Boolean(combined), left: Boolean(left), right: Boolean(right) },
      lookAt: inspectLookAt(json, extension, Boolean(v0), bones, expression),
    },
    metrics: inspectMetrics(json, bytes.byteLength),
  };
}

function safeLabel(value: string): string { return value.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 128); }

function inspectHumanBones(json: Json, humanoid: unknown, v0: boolean): Map<string, number> {
  const known = new Set([...requiredBones, ...optionalBones]), result = new Map<string, number>();
  const invalid: string[] = [], duplicates: string[] = [], used = new Map<number, string>();
  const entries: [string, any][] = v0 ? (Array.isArray(humanoid) ? humanoid.filter(item => item && known.has(item.bone)).map(item => [item.bone, item]) : [])
    : humanoid && typeof humanoid === "object" && !Array.isArray(humanoid) ? Object.entries(humanoid).filter(([name]) => known.has(name)) : [];
  for (const [name, value] of entries) {
    const node = value?.node;
    if (result.has(name)) duplicates.push(name);
    if (!Number.isSafeInteger(node) || node < 0 || !json.nodes?.[node]) { invalid.push(name); continue; }
    const previous = used.get(node);
    if (previous && previous !== name) duplicates.push(previous, name);
    used.set(node, name); result.set(name, node);
  }
  const missing = requiredBones.filter(name => !result.has(name) && !invalid.includes(name));
  if (missing.length || invalid.length || duplicates.length) {
    const details = { missingBones: missing, invalidBones: [...new Set(invalid)], duplicateBones: [...new Set(duplicates)] };
    const summary = [missing.length ? `missing ${missing.join(", ")}` : "", invalid.length ? `invalid node for ${details.invalidBones.join(", ")}` : "", duplicates.length ? `duplicate mapping for ${details.duplicateBones.join(", ")}` : ""].filter(Boolean).join("; ");
    throw new VrmInspectionError("HUMANOID_BONES", `invalid required humanoid bone: ${summary}; assign separate human bones in the VRM exporter and export again`, details);
  }
  return result;
}

function inspectMorphExpression(json: Json, expression: Json | undefined, v0: boolean, code: "INVALID_BLINK" | "INVALID_LOOK_AT", preset: string): boolean {
  if (expression === undefined) return false;
  const label = code === "INVALID_BLINK" ? "blink" : "look-at";
  if (!expression || typeof expression !== "object" || Array.isArray(expression)) throw new VrmInspectionError(code, `invalid VRM ${label} expression; re-export the ${preset} preset`, { preset });
  const binds = v0 ? expression.binds : expression.morphTargetBinds;
  if (binds === undefined) return false;
  if (!Array.isArray(binds)) throw new VrmInspectionError(code, `invalid VRM ${label} bindings; re-export the ${preset} preset`, { preset });
  let usable = false;
  for (const bind of binds) {
    const mesh = v0 ? bind?.mesh : json.nodes?.[bind?.node]?.mesh;
    const primitives = json.meshes?.[mesh]?.primitives;
    if (!bind || !Number.isSafeInteger(mesh) || mesh < 0
      || (!v0 && (!Number.isSafeInteger(bind.node) || bind.node < 0))
      || !Number.isSafeInteger(bind.index) || bind.index < 0
      || !Number.isFinite(bind.weight) || bind.weight < 0 || bind.weight > (v0 ? 100 : 1)
      || !Array.isArray(primitives) || !primitives.length || !primitives.every((primitive: Json) => primitive?.targets?.[bind.index] !== undefined)) {
      throw new VrmInspectionError(code, `invalid VRM ${label} morph binding: ${preset}; check its mesh/node, morph target index and weight in the VRM exporter`, { preset });
    }
    // The loader drops a bind if any primitive lacks morph influences. A mesh
    // not referenced by a node also cannot provide a working eyelid.
    const instantiated = !v0 || (json.nodes ?? []).some((node: Json) => node?.mesh === mesh);
    const morphs = primitives.every((primitive: Json) => primitive.targets.some((target: Json) => ["POSITION", "NORMAL", "COLOR_0"].some(semantic => Number.isSafeInteger(target?.[semantic]) && json.accessors?.[target[semantic]])));
    usable ||= bind.weight > 0 && instantiated && morphs;
  }
  return usable;
}

function inspectLookAt(json: Json, extension: Json, v0: boolean, bones: Map<string, number>, expression: (name: string) => Json | undefined): VrmInspection["capabilities"]["lookAt"] {
  const lookAt = v0 ? extension.firstPerson : extension.lookAt;
  const empty = { mode: "none" as const, head: true, eyes: false, horizontal: false, vertical: false };
  if (lookAt === undefined) return empty;
  if (!lookAt || typeof lookAt !== "object" || Array.isArray(lookAt)) throw new VrmInspectionError("INVALID_LOOK_AT", "invalid VRM look-at configuration; re-export eye tracking");
  // three-vrm imports lookAt only when an expression manager exists, including
  // bone-driven lookAt. An absent expression section must not promise eye motion.
  const expressionManager = v0 ? extension.blendShapeMaster : extension.expressions;
  if (!expressionManager) return empty;
  const type = v0 ? lookAt.lookAtTypeName : lookAt.type;
  if (type !== undefined && !(v0 ? ["Bone", "BlendShape"] : ["bone", "expression"]).includes(type)) throw new VrmInspectionError("INVALID_LOOK_AT", "invalid VRM look-at type; use bone or expression eye tracking in the VRM exporter");
  const mode = type === (v0 ? "BlendShape" : "expression") ? "expression" : "bone";
  const scale = (name: string): number => {
    const range = lookAt[name], value = range?.[v0 ? "yRange" : "outputScale"] ?? (mode === "expression" ? 1 : 10);
    const input = range?.[v0 ? "xRange" : "inputMaxValue"] ?? 90;
    if ((range !== undefined && (!range || typeof range !== "object" || Array.isArray(range))) || !Number.isFinite(value) || value < 0 || !Number.isFinite(input) || input < 0) throw new VrmInspectionError("INVALID_LOOK_AT", "invalid VRM look-at range; use finite, non-negative input and output ranges");
    return value;
  };
  const horizontalRange = scale(v0 ? "lookAtHorizontalOuter" : "rangeMapHorizontalOuter");
  const innerRange = scale(v0 ? "lookAtHorizontalInner" : "rangeMapHorizontalInner");
  const upRange = scale(v0 ? "lookAtVerticalUp" : "rangeMapVerticalUp"), downRange = scale(v0 ? "lookAtVerticalDown" : "rangeMapVerticalDown");
  let horizontal: boolean, vertical: boolean;
  if (mode === "bone") {
    const eyes = bones.has("leftEye") || bones.has("rightEye");
    horizontal = eyes && (horizontalRange > 0 || innerRange > 0); vertical = eyes && (upRange > 0 || downRange > 0);
  } else {
    const usable = (name: string) => inspectMorphExpression(json, expression(name), v0, "INVALID_LOOK_AT", name);
    const left = usable(v0 ? "lookleft" : "lookLeft"), right = usable(v0 ? "lookright" : "lookRight"), up = usable(v0 ? "lookup" : "lookUp"), down = usable(v0 ? "lookdown" : "lookDown");
    horizontal = horizontalRange > 0 && left && right; vertical = upRange > 0 && downRange > 0 && up && down;
  }
  return { mode, head: true, eyes: horizontal || vertical, horizontal, vertical };
}

function inspectMetrics(json: Json, fileBytes: number): VrmInspection["metrics"] {
  const primitives: Json[] = (json.meshes ?? []).flatMap((mesh: Json) => Array.isArray(mesh?.primitives) ? mesh.primitives : []);
  let vertexCount = 0, triangleCount = 0, morphTargetCount = 0;
  for (const primitive of primitives) {
    const vertices = json.accessors?.[primitive?.attributes?.POSITION]?.count ?? 0;
    const indices = primitive?.indices === undefined ? vertices : json.accessors?.[primitive.indices]?.count ?? 0;
    vertexCount += vertices;
    if (primitive?.mode === undefined || primitive.mode === 4) triangleCount += Math.floor(indices / 3);
    else if (primitive.mode === 5 || primitive.mode === 6) triangleCount += Math.max(0, indices - 2);
    morphTargetCount += Array.isArray(primitive?.targets) ? primitive.targets.length : 0;
  }
  const widths: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }, components: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
  const decodedAccessorBytes = (json.accessors ?? []).reduce((sum: number, accessor: Json) => {
    const width = widths[accessor.componentType]!, dimension = accessor.type === "MAT2" ? 2 : accessor.type === "MAT3" ? 3 : accessor.type === "MAT4" ? 4 : 0;
    return sum + accessor.count * (dimension ? Math.ceil(dimension * width / 4) * 4 * dimension : width * components[accessor.type]!);
  }, 0);
  return { fileBytes, nodeCount: json.nodes?.length ?? 0, meshCount: json.meshes?.length ?? 0, primitiveCount: primitives.length, materialCount: json.materials?.length ?? 0, textureCount: json.textures?.length ?? 0, imageCount: json.images?.length ?? 0, vertexCount, triangleCount, morphTargetCount, decodedAccessorBytes };
}

export function inspectVrma(bytes: ArrayBuffer): { durationMs: number } {
  const json = parseGlb(bytes, "vrma");
  if (json.animations?.length !== 1) throw new VrmInspectionError("INVALID_STRUCTURE", "each VRMA file must contain exactly one animation");
  let duration = 0;
  for (const sampler of json.animations[0].samplers ?? []) {
    const accessor = json.accessors?.[sampler.input];
    if (!accessor || accessor.type !== "SCALAR" || accessor.componentType !== 5126 || !Number.isFinite(accessor.max?.[0])) throw new VrmInspectionError("INVALID_STRUCTURE", "VRMA has invalid animation times");
    duration = Math.max(duration, accessor.max[0]);
  }
  if (!(duration > 0) || duration > 600) throw new VrmInspectionError("INVALID_STRUCTURE", "VRMA duration must be between 0 and 600 seconds");
  return { durationMs: duration * 1000 };
}

function validateStructure(json: Json, binary: DataView): void {
  for (const key of ["nodes", "accessors", "bufferViews", "buffers", "meshes", "materials", "textures", "images", "animations", "skins", "scenes", "extensionsUsed", "extensionsRequired"]) {
    if (json[key] !== undefined && !Array.isArray(json[key])) throw new VrmInspectionError("INVALID_STRUCTURE", `invalid glTF ${key}`);
  }
  const views = json.bufferViews ?? [], nodes = json.nodes ?? [], accessors = json.accessors ?? [];
  const integer = (n: any, min: number, max: number) => Number.isSafeInteger(n) && n >= min && n <= max;
  const index = (n: any, array: any[]) => integer(n, 0, array.length - 1);
  const seen = new Set<number>(), active = new Set<number>(), parents = new Set<number>();
  const walk = (i: number, depth: number) => {
    if (!index(i, nodes) || active.has(i) || depth > 128) throw new VrmInspectionError("INVALID_STRUCTURE", "invalid glTF node hierarchy");
    if (seen.has(i)) return;
    const node = nodes[i]; if (!node || typeof node !== "object") throw new VrmInspectionError("INVALID_STRUCTURE", "invalid glTF node");
    seen.add(i); active.add(i);
    if (node.children !== undefined && !Array.isArray(node.children)) throw new VrmInspectionError("INVALID_STRUCTURE", "invalid node children");
    for (const child of node.children ?? []) { if (parents.has(child)) throw new VrmInspectionError("INVALID_STRUCTURE", "node has multiple parents"); parents.add(child); walk(child, depth + 1); }
    active.delete(i);
  };
  for (let i = 0; i < nodes.length; i++) walk(i, 0);
  const components: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
  const sizes: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
  let decoded = 0;
  const span = (viewIndex: number, offset: number, count: number, element: number, alignment: number, strided = false) => {
    if (!index(viewIndex, views)) throw new VrmInspectionError("INVALID_STRUCTURE", "invalid accessor buffer view");
    const v = views[viewIndex], stride = strided ? (v.byteStride ?? element) : element;
    if (!integer(offset, 0, v.byteLength) || offset % alignment || !integer(stride, element, 256) || stride % alignment || offset + (count - 1) * stride + element > v.byteLength) throw new VrmInspectionError("INVALID_STRUCTURE", "accessor exceeds buffer view");
    return (v.byteOffset ?? 0) + offset;
  };
  for (const a of accessors) {
    const width = sizes[a?.componentType], count = a?.count, componentsCount = components[a?.type];
    if (!width || !componentsCount || !integer(count, 1, 2000000)) throw new VrmInspectionError("INVALID_STRUCTURE", "invalid accessor allocation");
    const dimension = a.type === "MAT2" ? 2 : a.type === "MAT3" ? 3 : a.type === "MAT4" ? 4 : 0;
    const element = dimension ? Math.ceil(dimension * width / 4) * 4 * dimension : width * componentsCount;
    decoded += element * count;
    if (decoded > 256 * 1024 * 1024) throw new VrmInspectionError("RESOURCE_LIMIT", "decoded geometry exceeds 256 MiB");
    const checkFloats = (at:number,n:number,stride:number) => {
      if(a.componentType!==5126) return;
      for(let k=0;k<n;k++)for(let c=0;c<componentsCount;c++)if(!Number.isFinite(binary.getFloat32(at+k*stride+c*4,true)))throw new VrmInspectionError("INVALID_STRUCTURE", "non-finite accessor value");
    };
    if (a.bufferView !== undefined) {
      const at=span(a.bufferView,a.byteOffset??0,count,element,width,true);
      checkFloats(at,count,views[a.bufferView].byteStride??element);
    }
    if (a.sparse) {
      const sparse = a.sparse, n = sparse.count, iw = sizes[sparse.indices?.componentType];
      if (!integer(n, 1, count) || ![5121, 5123, 5125].includes(sparse.indices?.componentType)) throw new VrmInspectionError("INVALID_STRUCTURE", "invalid sparse accessor");
      const at = span(sparse.indices.bufferView, sparse.indices.byteOffset ?? 0, n, iw!, iw!);
      const valuesAt=span(sparse.values?.bufferView, sparse.values?.byteOffset ?? 0, n, element, width);
      checkFloats(valuesAt,n,element);
      let previous = -1;
      for (let k = 0; k < n; k++) {
        const offset = at + k * iw!; const next = iw === 1 ? binary.getUint8(offset) : iw === 2 ? binary.getUint16(offset, true) : binary.getUint32(offset, true);
        if (next <= previous || next >= count) throw new VrmInspectionError("INVALID_STRUCTURE", "invalid sparse index"); previous = next;
      }
    }
  }
  // Validate the references used by capability and size reporting as well as
  // the loader. Never infer a working morph from an arbitrary target object.
  let primitiveCount = 0;
  for (const mesh of json.meshes ?? []) {
    if (!mesh || !Array.isArray(mesh.primitives) || !mesh.primitives.length) throw new VrmInspectionError("INVALID_STRUCTURE", "invalid glTF mesh primitives");
    primitiveCount += mesh.primitives.length;
    if (primitiveCount > 32768) throw new VrmInspectionError("RESOURCE_LIMIT", "glTF primitive count exceeded");
    for (const primitive of mesh.primitives) {
      const position = accessors[primitive?.attributes?.POSITION];
      if (!primitive || !position || position.type !== "VEC3" || position.componentType !== 5126) throw new VrmInspectionError("INVALID_STRUCTURE", "invalid glTF primitive POSITION accessor");
      if (primitive.indices !== undefined) {
        const indices = accessors[primitive.indices];
        if (!index(primitive.indices, accessors) || indices.type !== "SCALAR" || ![5121, 5123, 5125].includes(indices.componentType)) throw new VrmInspectionError("INVALID_STRUCTURE", "invalid glTF primitive index accessor");
      }
      if (primitive.mode !== undefined && !integer(primitive.mode, 0, 6)) throw new VrmInspectionError("INVALID_STRUCTURE", "invalid glTF primitive mode");
      if (primitive.targets !== undefined && (!Array.isArray(primitive.targets) || primitive.targets.length > 1024)) throw new VrmInspectionError("INVALID_STRUCTURE", "invalid glTF morph target list");
      for (const target of primitive.targets ?? []) {
        if (!target || typeof target !== "object" || Array.isArray(target)) throw new VrmInspectionError("INVALID_STRUCTURE", "invalid glTF morph target");
        for (const semantic of ["POSITION", "NORMAL", "COLOR_0"]) {
          if (target[semantic] === undefined) continue;
          const accessor = accessors[target[semantic]];
          if (!index(target[semantic], accessors) || accessor.componentType !== 5126 || !(semantic === "COLOR_0" ? ["VEC3", "VEC4"] : ["VEC3"]).includes(accessor.type) || accessor.count !== position.count) throw new VrmInspectionError("INVALID_STRUCTURE", "invalid glTF morph target accessor");
        }
      }
    }
  }
  for (const node of nodes) if (node.mesh !== undefined && !index(node.mesh, json.meshes ?? [])) throw new VrmInspectionError("INVALID_STRUCTURE", "invalid glTF node mesh reference");
  for (const animation of json.animations ?? []) {
    if (!Array.isArray(animation.samplers) || !Array.isArray(animation.channels)) throw new VrmInspectionError("INVALID_STRUCTURE", "invalid animation");
    for (const channel of animation.channels) {
      if (!index(channel.sampler, animation.samplers) || !index(channel.target?.node, nodes) || !["translation", "rotation", "scale", "weights"].includes(channel.target?.path)) throw new VrmInspectionError("INVALID_STRUCTURE", "invalid animation channel");
    }
    for (const sampler of animation.samplers) {
      if (!index(sampler.input, accessors) || !index(sampler.output, accessors)) throw new VrmInspectionError("INVALID_STRUCTURE", "invalid animation accessor");
      const a = accessors[sampler.input];
      if (a.type !== "SCALAR" || a.componentType !== 5126 || a.sparse || a.bufferView === undefined) throw new VrmInspectionError("INVALID_STRUCTURE", "invalid animation timeline");
      const start = span(a.bufferView, a.byteOffset ?? 0, a.count, 4, 4); let previous = -1;
      for (let i = 0; i < a.count; i++) {
        const time = binary.getFloat32(start + i * 4, true);
        if (!Number.isFinite(time) || time <= previous || time < 0 || time > 600) throw new VrmInspectionError("INVALID_STRUCTURE", "invalid animation times"); previous = time;
      }
      if (!Array.isArray(a.max) || Math.abs(a.max[0] - previous) > .001) throw new VrmInspectionError("INVALID_STRUCTURE", "animation duration does not match timeline");
      if (sampler.interpolation !== undefined && !["LINEAR", "STEP", "CUBICSPLINE"].includes(sampler.interpolation)) throw new VrmInspectionError("INVALID_STRUCTURE", "unsupported animation interpolation");
    }
  }
}
