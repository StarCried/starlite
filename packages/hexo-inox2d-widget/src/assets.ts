import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import type { ModelAssetBundle, RuntimeAsset, RuntimeAssetBundle } from "./types";
import type {
  AnimationClip,
  ParameterIds,
  ParameterTarget,
} from "inochi2d-web" with { "resolution-mode": "import" };

const PUBLISHABLE_EXTENSIONS = new Set([".css", ".js", ".wasm"]);

export function collectRuntimeAssets(runtimeDist = resolveRuntimeDist()): RuntimeAssetBundle {
  const assets = walk(runtimeDist)
    .filter((path) => PUBLISHABLE_EXTENSIONS.has(extension(path)))
    .map((path) => ({
      relativePath: relative(runtimeDist, path).split(sep).join("/"),
      contents: readFileSync(path),
    }))
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));

  if (!assets.some((asset) => asset.relativePath === "index.js")) {
    throw new Error("inochi2d-web dist is missing index.js; run the runtime build first");
  }
  if (!assets.some((asset) => asset.relativePath === "generated/inochi2d.wasm")) {
    throw new Error("inochi2d-web dist is missing generated WASM; run the WASM build first");
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
    routePrefix: `inochi2d-widget/${hash}`,
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
): ModelAssetBundle {
  const bundleDirectory = isAbsolute(bundleLocation)
    ? bundleLocation
    : resolve(baseDirectory, bundleLocation);
  const manifestPath = join(bundleDirectory, "manifest.json");
  const manifestContents = readFileSync(manifestPath);
  const manifest = parsePipelineManifest(manifestContents, manifestPath);
  if (!manifest.compatibility.supported) {
    throw new Error(`Inochi2D bundle is not browser-compatible: ${manifestPath}`);
  }
  const publicationBlocker = manifest.publication.issues.find(
    (issue) => issue.severity === "error",
  );
  if (publicationBlocker) {
    throw new Error(
      `Inochi2D bundle is not publishable (${publicationBlocker.code}): ${manifestPath}`,
    );
  }

  const model = readVerifiedArtifact(bundleDirectory, manifest.model, "model");
  const fallback = manifest.fallback
    ? readVerifiedArtifact(bundleDirectory, manifest.fallback, "fallback")
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
  return {
    hash,
    routePrefix: `inochi2d-model/${hash}`,
    modelFile: manifest.model.file,
    sourceSha256: manifest.model.sourceSha256,
    ...(manifest.fallback ? { fallbackFile: manifest.fallback.file } : {}),
    ...(manifest.parameters
      ? { suggestedParameters: inferParameterBindings(manifest.parameters) }
      : {}),
    animations: manifest.animations ?? [],
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
  if (!isRecord(input) || input.schemaVersion !== 1) {
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
    (!Array.isArray(input.parameters) || !input.parameters.every(isPipelineParameter))
  ) {
    throw new Error(`Inochi2D pipeline manifest has invalid parameters: ${path}`);
  }
  if (
    input.animations !== undefined &&
    (!Array.isArray(input.animations) || !input.animations.every(isAnimationClip))
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
  const headYawPitch = find("Head:: Yaw-Pitch", "HeadYawPitch");
  const bodyYawPitch = find("Body:: Yaw-Pitch", "BodyYawPitch");
  const bodyRoll = find("Body:: Roll", "BodyRoll", "BodyX", "Body:: X:: Move");
  const leftBlink = find("Eye:: Left:: Blink", "EyeBlinkL", "EyeOpenL");
  const rightBlink = find("Eye:: Right:: Blink", "EyeBlinkR", "EyeOpenR");
  const leftEyeMove = find("Eye:: Left:: Move", "EyeXLeft");
  const rightEyeMove = find("Eye:: Right:: Move", "EyeXRight");
  const result: Partial<ParameterIds> = {};

  if (breath) result.breath = breath.name;
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
  }
  if (bodyRoll) result.bodyX = bodyRoll.name;
  return result;
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
): Buffer {
  if (!safeFileName(artifact.file)) {
    throw new Error(`Inochi2D ${label} artifact must use a plain file name`);
  }
  const contents = readFileSync(join(directory, artifact.file));
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
    Number(input.bytes) >= 0
  );
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function safeFileName(file: string): boolean {
  return file.length > 0 && file !== "." && file !== ".." && basename(file) === file;
}

function resolveRuntimeDist(): string {
  return dirname(require.resolve("inochi2d-web"));
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
