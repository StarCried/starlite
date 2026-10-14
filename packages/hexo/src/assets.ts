import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import type { ModelAssetBundle, RuntimeAsset, RuntimeAssetBundle } from "./types";
import type {
  AnimationClip,
  ParameterIds,
  ParameterTarget,
  WidgetConfig,
} from "@starcried/starlite-inochi2d" with { "resolution-mode": "import" };

const PUBLISHABLE_EXTENSIONS = new Set([".css", ".js", ".wasm"]);
const MAX_MANIFEST_BYTES = 32 * 1024 * 1024;
const MAX_MODEL_BYTES = 8 * 1024 * 1024;
const MAX_FALLBACK_BYTES = 8 * 1024 * 1024;
const MAX_PARAMETERS = 4_096;
const MAX_ANIMATIONS = 64;

export function collectRuntimeAssets(runtimeDist = resolveRuntimeDist(), backend: "inochi2d" | "vrm" = "inochi2d"): RuntimeAssetBundle {
  const assets = walk(runtimeDist)
    .filter((path) => backend === "vrm" ? ["index.js","widget.css"].includes(relative(runtimeDist,path)) : PUBLISHABLE_EXTENSIONS.has(extension(path)))
    .map((path) => ({
      relativePath: relative(runtimeDist, path).split(sep).join("/"),
      contents: readFileSync(path),
    }))
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));

  if (!assets.some((asset) => asset.relativePath === "index.js")) {
    throw new Error("@starcried/starlite-inochi2d dist is missing index.js; run the runtime build first");
  }
  if (backend === "inochi2d" && !assets.some((asset) => asset.relativePath === "generated/inochi2d.wasm")) {
    throw new Error("@starcried/starlite-inochi2d dist is missing generated WASM; run the WASM build first");
  }

  const digest = createHash("sha256");
  for (const asset of assets) {
    digest.update(asset.relativePath);
    digest.update("\0");
    digest.update(asset.contents);
  }
  const hash = digest.digest("hex").slice(0, 12);
  return {
    hash,
    routePrefix: `${backend === "vrm" ? "vrm" : "inochi2d"}-widget/${hash}`,
    assets,
  };
}

interface PipelineArtifact {
  file: string;
  sha256: string;
  bytes: number;
}

interface PipelineModelArtifact extends PipelineArtifact {
  sourceSha256: string;
}

interface PipelineManifest {
  schemaVersion: number;
  tool: string;
  model: PipelineModelArtifact;
  fallback?: PipelineArtifact;
  compatibility: {
    supported: boolean;
  };
  publication: {
    requiresConfirmation: boolean;
    issues: PipelineIssue[];
  };
  parameters?: PipelineParameter[];
  animations?: AnimationClip[];
}

interface PipelineIssue {
  code: string;
  severity: "error" | "warning";
}

interface PipelineParameter {
  name: string;
  isVector: boolean;
}

/** Read and verify an immutable bundle produced by inochi2d-pipeline. */
export function collectModelAssets(
  bundleLocation: string,
  baseDirectory = process.cwd(),
  options: { localPreview?: boolean } = {},
): ModelAssetBundle {
  const bundleDirectory = isAbsolute(bundleLocation)
    ? bundleLocation
    : resolve(baseDirectory, bundleLocation);
  const manifestPath = join(bundleDirectory, "manifest.json");
  const manifestContents = readBoundedRegularFile(
    manifestPath,
    MAX_MANIFEST_BYTES,
    "manifest",
  );
  const manifest = parsePipelineManifest(manifestContents, manifestPath);
  if (!manifest.compatibility.supported) {
    throw new Error(`Inochi2D bundle is not browser-compatible: ${manifestPath}`);
  }
  const publicationBlocker = manifest.publication.issues.find(
    (issue) => issue.severity === "error",
  );
  if (publicationBlocker && !options.localPreview) {
    throw new Error(
      `Inochi2D bundle is not publishable (${publicationBlocker.code}): ${manifestPath}`,
    );
  }

  const model = readVerifiedArtifact(
    bundleDirectory,
    manifest.model,
    "model",
    MAX_MODEL_BYTES,
  );
  const fallback = manifest.fallback
    ? readVerifiedArtifact(
        bundleDirectory,
        manifest.fallback,
        "fallback",
        MAX_FALLBACK_BYTES,
      )
    : undefined;
  const assets: RuntimeAsset[] = [
    { relativePath: manifest.model.file, contents: model },
    ...(fallback && manifest.fallback
      ? [{ relativePath: manifest.fallback.file, contents: fallback }]
      : []),
    { relativePath: "manifest.json", contents: manifestContents },
  ];

  const digest = createHash("sha256");
  for (const asset of assets) {
    digest.update(asset.relativePath);
    digest.update("\0");
    digest.update(asset.contents);
  }
  const hash = digest.digest("hex").slice(0, 12);
  const suggestedAmbient = manifest.parameters
    ? inferAmbientConfig(manifest.parameters)
    : undefined;
  return {
    hash,
    routePrefix: `inochi2d-model/${hash}`,
    modelFile: manifest.model.file,
    sourceSha256: manifest.model.sourceSha256,
    ...(manifest.fallback ? { fallbackFile: manifest.fallback.file } : {}),
    ...(manifest.parameters
      ? { suggestedParameters: inferParameterBindings(manifest.parameters) }
      : {}),
    ...(suggestedAmbient ? { suggestedAmbient } : {}),
    animations: manifest.animations ?? [],
    ...(options.localPreview ? { localPreview: true } : {}),
    assets,
  };
}

function parsePipelineManifest(contents: Buffer, path: string): PipelineManifest {
  let input: unknown;
  try {
    input = JSON.parse(contents.toString("utf8"));
  } catch (error) {
    throw new Error(`Invalid Inochi2D pipeline manifest JSON: ${path}`, { cause: error });
  }
  if (
    !isRecord(input) ||
    input.schemaVersion !== 1 ||
    input.tool !== "inochi2d-pipeline"
  ) {
    throw new Error(`Unsupported Inochi2D pipeline manifest schema: ${path}`);
  }
  if (!isModelArtifact(input.model)) {
    throw new Error(`Inochi2D pipeline manifest has an invalid model artifact: ${path}`);
  }
  if (input.fallback !== undefined && !isArtifact(input.fallback)) {
    throw new Error(`Inochi2D pipeline manifest has an invalid fallback artifact: ${path}`);
  }
  if (!isRecord(input.compatibility) || typeof input.compatibility.supported !== "boolean") {
    throw new Error(`Inochi2D pipeline manifest has no compatibility result: ${path}`);
  }
  if (
    !isRecord(input.publication) ||
    typeof input.publication.requiresConfirmation !== "boolean" ||
    !Array.isArray(input.publication.issues) ||
    !input.publication.issues.every(isPipelineIssue)
  ) {
    throw new Error(`Inochi2D pipeline manifest has no publication gate: ${path}`);
  }
  if (
    input.parameters !== undefined &&
    (!Array.isArray(input.parameters) ||
      input.parameters.length > MAX_PARAMETERS ||
      !input.parameters.every(isPipelineParameter))
  ) {
    throw new Error(`Inochi2D pipeline manifest has invalid parameters: ${path}`);
  }
  if (input.parameters !== undefined) {
    const names = new Set(
      (input.parameters as PipelineParameter[]).map((parameter) => parameter.name),
    );
    if (names.size !== input.parameters.length) {
      throw new Error(`Inochi2D pipeline manifest has duplicate parameters: ${path}`);
    }
  }
  if (
    input.animations !== undefined &&
    (!Array.isArray(input.animations) ||
      input.animations.length > MAX_ANIMATIONS ||
      !input.animations.every(isAnimationClip))
  ) {
    throw new Error(`Inochi2D pipeline manifest has invalid animations: ${path}`);
  }
  if (input.animations !== undefined) {
    const animationNames = new Set(
      (input.animations as AnimationClip[]).map((animation) => animation.name),
    );
    if (animationNames.size !== input.animations.length) {
      throw new Error(`Inochi2D pipeline manifest has duplicate animations: ${path}`);
    }
  }
  return input as unknown as PipelineManifest;
}

function isModelArtifact(input: unknown): input is PipelineModelArtifact {
  if (!isArtifact(input)) {
    return false;
  }
  const sourceSha256 = (input as PipelineArtifact & { sourceSha256?: unknown })
    .sourceSha256;
  return typeof sourceSha256 === "string" && /^[a-f0-9]{64}$/u.test(sourceSha256);
}

function isPipelineIssue(input: unknown): input is PipelineIssue {
  return (
    isRecord(input) &&
    typeof input.code === "string" &&
    (input.severity === "error" || input.severity === "warning")
  );
}

/** Infer conventional live-widget channels without requiring model-specific blog code. */
function inferParameterBindings(parameters: readonly PipelineParameter[]): Partial<ParameterIds> {
  const find = (...names: string[]): PipelineParameter | undefined =>
    parameters.find((parameter) =>
      names.some((name) => normalizedParameterName(parameter.name) === normalizedParameterName(name)),
    );
  const vectorTarget = (
    parameter: PipelineParameter,
    axis: "x" | "y",
    scale = 1,
  ): ParameterTarget => ({ id: parameter.name, axis, scale });

  const breath = find("Breath");
  const mannequinBreath = find("Body - Up/Down");
  const headYawPitch = find("Head:: Yaw-Pitch", "HeadYawPitch");
  const mannequinHeadPitchYaw = find("Head - Pitch/Yaw");
  const bodyYawPitch = find("Body:: Yaw-Pitch", "BodyYawPitch");
  const mannequinBodyYaw = find("Body - Yaw");
  const bodyRoll = find("Body:: Roll", "BodyRoll", "BodyX", "Body:: X:: Move");
  const leftBlink = find(
    "Eye:: Left:: Blink",
    "EyeBlinkL",
    "EyeOpenL",
    "Left Eye - Blink",
  );
  const rightBlink = find(
    "Eye:: Right:: Blink",
    "EyeBlinkR",
    "EyeOpenR",
    "Right Eye - Blink",
  );
  const leftEyeMove = find("Eye:: Left:: Move", "EyeXLeft");
  const rightEyeMove = find("Eye:: Right:: Move", "EyeXRight");
  const leftEyeGaze = find("Left Eye - Gaze");
  const rightEyeGaze = find("Right Eye - Gaze");
  const result: Partial<ParameterIds> = {};

  if (breath) {
    result.breath = breath.name;
  } else if (mannequinBreath) {
    result.breath = { id: mannequinBreath.name, scale: 0.08 };
  }
  if (leftBlink) {
    result.eyeOpenLeft = { id: leftBlink.name, scale: -1, offset: 1 };
  }
  if (rightBlink) {
    result.eyeOpenRight = { id: rightBlink.name, scale: -1, offset: 1 };
  }
  const eyeMoves = [leftEyeMove, rightEyeMove]
    .filter((parameter): parameter is PipelineParameter => parameter !== undefined)
    .map((parameter) => parameter.name);
  if (eyeMoves.length > 0) {
    result.eyeX = eyeMoves;
    result.eyeY = null;
  } else {
    const eyeGazes = [leftEyeGaze, rightEyeGaze].filter(
      (parameter): parameter is PipelineParameter =>
        parameter?.isVector === true,
    );
    if (eyeGazes.length > 0) {
      // Mannequin exports standard horizontal/vertical vector axes despite
      // naming its related head parameter "Pitch/Yaw". Its gaze Y direction
      // is opposite to the widget's normalized vertical pointer channel.
      // Horizontal gaze is intentionally lower than the vertical scale:
      // generated Mannequin rigs often bind both irises strongly on X.
      result.eyeX = eyeGazes.map((parameter) =>
        vectorTarget(parameter, "x", 0.4),
      );
      result.eyeY = eyeGazes.map((parameter) =>
        vectorTarget(parameter, "y", -0.55),
      );
    }
  }
  if (headYawPitch?.isVector) {
    result.headX = [
      vectorTarget(headYawPitch, "x"),
      ...(bodyYawPitch?.isVector ? [vectorTarget(bodyYawPitch, "x", 0.35)] : []),
    ];
    result.headY = [
      vectorTarget(headYawPitch, "y"),
      ...(bodyYawPitch?.isVector ? [vectorTarget(bodyYawPitch, "y", 0.2)] : []),
    ];
  } else if (mannequinHeadPitchYaw?.isVector) {
    // Parameter names are descriptive labels, not storage-order declarations:
    // the exported binding grid still stores horizontal X before vertical Y.
    // Keep the generated rig's strongly bound horizontal face motion below
    // its vertical response; explicit per-model configuration still wins.
    result.headX = [
      vectorTarget(mannequinHeadPitchYaw, "x", 0.35),
      ...(mannequinBodyYaw
        ? [{ id: mannequinBodyYaw.name, scale: 0.12 }]
        : []),
    ];
    result.headY = [vectorTarget(mannequinHeadPitchYaw, "y", 0.5)];
  }
  if (bodyRoll) result.bodyX = bodyRoll.name;
  return result;
}

function inferAmbientConfig(
  parameters: readonly PipelineParameter[],
): NonNullable<WidgetConfig["ambient"]> | undefined {
  const find = (name: string): PipelineParameter | undefined =>
    parameters.find(
      (parameter) =>
        normalizedParameterName(parameter.name) === normalizedParameterName(name),
    );
  const tail = find("Tail - Left/Right Swing");
  const tailTip = find("Tail - Left/Right Tip Swing");
  if (!tail || tail.isVector) {
    return undefined;
  }
  return {
    parameters: [
      {
        id: tail.name,
        minimum: -0.55,
        maximum: 0.55,
        periodMs: 4_200,
      },
      ...(tailTip && !tailTip.isVector
        ? [
            {
              id: tailTip.name,
              minimum: -0.35,
              maximum: 0.35,
              periodMs: 4_200,
              phase: 1 / 6,
            },
          ]
        : []),
    ],
  };
}

function isAnimationClip(input: unknown): input is AnimationClip {
  if (
    !isRecord(input) ||
    typeof input.name !== "string" ||
    input.name.trim().length === 0 ||
    Buffer.byteLength(input.name, "utf8") > 128 ||
    !finite(input.timestepMs) ||
    Number(input.timestepMs) <= 0 ||
    Number(input.timestepMs) > 1_000 ||
    !safeIntegerInRange(input.length, 1, 18_000) ||
    !safeIntegerInRange(input.leadIn, -1, Number(input.length)) ||
    !safeIntegerInRange(input.leadOut, -1, Number(input.length)) ||
    input.weight !== 1 ||
    !Array.isArray(input.lanes) ||
    input.lanes.length < 1 ||
    input.lanes.length > 128
  ) {
    return false;
  }
  const targets = new Set<string>();
  let keyframeCount = 0;
  return input.lanes.every((lane) => {
    if (
      !isRecord(lane) ||
      typeof lane.parameter !== "string" ||
      lane.parameter.trim().length === 0 ||
      (lane.axis !== undefined && lane.axis !== "x" && lane.axis !== "y") ||
      !Array.isArray(lane.defaultValues) ||
      lane.defaultValues.length !== 2 ||
      !lane.defaultValues.every(finite) ||
      !["nearest", "stepped", "linear", "cubic"].includes(
        String(lane.interpolation),
      ) ||
      !Array.isArray(lane.keyframes) ||
      lane.keyframes.length < 2
    ) {
      return false;
    }
    const target = `${lane.parameter}\0${lane.axis ?? ""}`;
    if (targets.has(target)) {
      return false;
    }
    targets.add(target);
    keyframeCount += lane.keyframes.length;
    if (keyframeCount > 4_096) {
      return false;
    }
    let previousFrame = -1;
    return lane.keyframes.every((keyframe) => {
      if (
        !isRecord(keyframe) ||
        !safeIntegerInRange(keyframe.frame, 0, Number(input.length)) ||
        Number(keyframe.frame) <= previousFrame ||
        !finite(keyframe.value) ||
        !finite(keyframe.tension)
      ) {
        return false;
      }
      previousFrame = Number(keyframe.frame);
      return true;
    });
  });
}

function safeIntegerInRange(
  input: unknown,
  minimum: number,
  maximum: number,
): boolean {
  return (
    typeof input === "number" &&
    Number.isSafeInteger(input) &&
    input >= minimum &&
    input <= maximum
  );
}

function finite(input: unknown): input is number {
  return typeof input === "number" && Number.isFinite(input);
}

function isPipelineParameter(input: unknown): input is PipelineParameter {
  return (
    isRecord(input) &&
    typeof input.name === "string" &&
    input.name.trim().length > 0 &&
    Buffer.byteLength(input.name, "utf8") <= 256 &&
    typeof input.isVector === "boolean"
  );
}

function normalizedParameterName(value: string): string {
  return value.toLocaleLowerCase("en-US").replaceAll(/[^a-z0-9]/gu, "");
}

function readVerifiedArtifact(
  directory: string,
  artifact: PipelineArtifact,
  label: "fallback" | "model",
  maximumBytes: number,
): Buffer {
  if (!validArtifactFile(artifact.file, artifact.sha256, label)) {
    throw new Error(`Inochi2D ${label} artifact has a non-canonical file name`);
  }
  if (artifact.bytes > maximumBytes) {
    throw new Error(
      `Inochi2D ${label} exceeds the ${maximumBytes}-byte publication limit`,
    );
  }
  const contents = readBoundedRegularFile(
    join(directory, artifact.file),
    maximumBytes,
    label,
  );
  if (contents.byteLength !== artifact.bytes) {
    throw new Error(
      `Inochi2D ${label} size mismatch: expected ${artifact.bytes}, got ${contents.byteLength}`,
    );
  }
  const actualHash = createHash("sha256").update(contents).digest("hex");
  if (actualHash !== artifact.sha256) {
    throw new Error(`Inochi2D ${label} SHA-256 mismatch`);
  }
  return contents;
}

function isArtifact(input: unknown): input is PipelineArtifact {
  return (
    isRecord(input) &&
    typeof input.file === "string" &&
    typeof input.sha256 === "string" &&
    /^[a-f0-9]{64}$/u.test(input.sha256) &&
    Number.isSafeInteger(input.bytes) &&
    Number(input.bytes) > 0
  );
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function validArtifactFile(
  file: string,
  sha256: string,
  label: "fallback" | "model",
): boolean {
  if (basename(file) !== file) {
    return false;
  }
  const expression =
    label === "model"
      ? /^model\.([a-f0-9]{12})\.inp$/u
      : /^fallback\.([a-f0-9]{12})\.png$/u;
  return expression.exec(file)?.[1] === sha256.slice(0, 12);
}

function readBoundedRegularFile(
  path: string,
  maximumBytes: number,
  label: string,
): Buffer {
  const metadata = lstatSync(path);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`Inochi2D ${label} must be a regular non-symlink file`);
  }
  if (metadata.size > maximumBytes) {
    throw new Error(`Inochi2D ${label} exceeds the ${maximumBytes}-byte limit`);
  }
  return readFileSync(path);
}

export function resolveRuntimeDist(backend: "inochi2d" | "vrm" = "inochi2d"): string {
  return backend === "vrm" ? dirname(require.resolve("@starcried/starlite-vrm/config")) : dirname(require.resolve("@starcried/starlite-inochi2d"));
}

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function extension(path: string): string {
  const index = path.lastIndexOf(".");
  return index === -1 ? "" : path.slice(index);
}

export function collectVrmModelAssets(location:string, baseDirectory=process.cwd(), options:{localPreview?:boolean}={}): ModelAssetBundle {
 const directory=resolve(baseDirectory,location);
 const {manifest,files}=(require("@starcried/starlite-vrm/prepare") as typeof import("@starcried/starlite-vrm/prepare", {with:{"resolution-mode":"import"}})).readPreparedBundleSync(directory);
 if (!options.localPreview && !manifest.publication.allowRedistribution) throw new Error("VRM bundle redistribution is not allowed");
 if (!options.localPreview && manifest.model.bytes > MAX_MODEL_BYTES) throw new Error("VRM exceeds the 8 MiB blog publication limit");
 const {inspectVrm} = require("@starcried/starlite-vrm/inspect") as typeof import("@starcried/starlite-vrm/inspect", {with:{"resolution-mode":"import"}});
 const embeddedAnimations = inspectVrm(Uint8Array.from(files.get(manifest.model.file)!).buffer).animations.map(a=>a.name);
 const assets=[...files].map(([relativePath,contents])=>({relativePath,contents}));
 assets.push({relativePath:"manifest.json",contents:Buffer.from(JSON.stringify(manifest))});
 const digest=createHash("sha256");
 for(const asset of assets) digest.update(asset.relativePath).update("\0").update(asset.contents);
 const hash=digest.digest("hex").slice(0,12);
 return {backend:"vrm",hash,routePrefix:`vrm-model/${hash}`,modelFile:manifest.model.file,sourceSha256:manifest.model.sourceSha256,animations:[],
   vrm:{animations:manifest.animations.map(a=>({name:a.name,url:a.file,durationMs:a.durationMs})),embeddedAnimations,...(manifest.profile ? {profile:manifest.profile.file} : {})},
   ...(options.localPreview ? {localPreview:true} : {}), assets};
}

/** Explicit ./ and ../ paths are local files; absolute web URLs remain URLs. */
export function isLocalVrmFile(location: unknown, baseDirectory = process.cwd()): location is string {
 if (typeof location !== "string" || /^(?:[a-z]+:)?\/\//iu.test(location)) return false;
 return location.startsWith("./") || location.startsWith("../") || /^[a-z]:[\\/]/iu.test(location)
   || (isAbsolute(location) && existsSync(resolve(baseDirectory, location)));
}

/** Standard VRM onboarding: inspect exact bytes and publish one content-addressed file. */
export function collectVrmFileAssets(location: string, baseDirectory = process.cwd(), options: {localPreview?: boolean} = {}): ModelAssetBundle {
 if (extension(location).toLowerCase() !== ".vrm") throw new Error("local VRM model must use the .vrm extension");
 const contents = readBoundedRegularFile(resolve(baseDirectory, location), options.localPreview ? 64 * 1024 * 1024 : MAX_MODEL_BYTES, "VRM model");
 const {inspectVrm} = require("@starcried/starlite-vrm/inspect") as typeof import("@starcried/starlite-vrm/inspect", {with:{"resolution-mode":"import"}});
 const inspected = inspectVrm(Uint8Array.from(contents).buffer);
 const sourceSha256 = createHash("sha256").update(contents).digest("hex");
 const fallback = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="260" height="360" viewBox="0 0 260 360"><rect width="260" height="360" rx="24" fill="#dfe5f0"/><text x="130" y="180" text-anchor="middle" fill="#46536a" font-family="system-ui,sans-serif">StarLite</text></svg>');
 const hash = createHash("sha256").update(contents).update(fallback).digest("hex").slice(0,12);
 const embeddedAnimations = inspected.animations.map(animation=>animation.name);
 return {
   backend:"vrm", hash, routePrefix:`vrm-model/${hash}`,
   modelFile:"model.vrm", fallbackFile:"fallback.svg", sourceSha256, animations:[],
   vrm:{animations:[],embeddedAnimations}, assets:[{relativePath:"model.vrm",contents},{relativePath:"fallback.svg",contents:fallback}],
   ...(options.localPreview ? {localPreview:true} : {}),
 };
}
