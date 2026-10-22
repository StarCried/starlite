import { resolveDialogueSentences, validatePerformanceConfig } from "@starcried/starlite-core";
import type { CharacterProfile, ModelAdjustments, VrmWidgetConfig } from "./types.js";

function finite(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}
export function validateModelAdjustments(input: unknown): asserts input is ModelAdjustments {
  const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
  if (!object(input) || Object.keys(input).some(key => key !== "idle" && key !== "gaze")) throw new Error("invalid model adjustments");
  const groups = {
    idle: { armLiftDegrees: [-30, 45], palmTwistDegrees: [-45, 45], wristLiftDegrees: [-45, 45], handCurl: [0, 1], elbowBendDegrees: [-20, 45] },
    gaze: { headStrength: [0, 2], eyeStrength: [0, 2], smoothingMs: [20, 1000] },
  } as const;
  for (const [group, limits] of Object.entries(groups)) {
    const values = input[group];
    if (values === undefined) continue;
    if (!object(values)) throw new Error(`invalid model adjustments.${group}`);
    for (const [key, value] of Object.entries(values)) {
      const range = Object.hasOwn(limits, key) ? (limits as Record<string, readonly [number, number]>)[key] : undefined;
      if (!range || (value !== undefined && !finite(value, range[0], range[1]))) throw new Error(`invalid model adjustments.${group}.${key}`);
    }
  }
}
export function validateVrmWidgetConfig(config: VrmWidgetConfig): void {
  if (!config || (config.backend !== undefined && config.backend !== "vrm")) throw new Error("invalid VRM backend");
  if (config.adjustments !== undefined) validateModelAdjustments(config.adjustments);
  validatePerformanceConfig(config.performance);
  if (config.interactions?.passThrough !== undefined && typeof config.interactions.passThrough !== "boolean") throw new Error("interactions.passThrough must be boolean");
  if (config.interactions?.passThrough && config.interactions.drag) throw new Error("passThrough and drag cannot both be enabled");
  for (const key of ["model", "fallback"] as const) if (typeof config[key] !== "string" || !config[key].trim()) throw new Error(`${key} is required`);
  if (config.render?.fps !== undefined && config.render.fps !== 30 && config.render.fps !== 60 && config.render.fps !== "display") throw new Error("frame rate must be 30, 60 or display");
  const checks: [unknown, number, number][] = [
    [config.render?.maxDevicePixelRatio ?? 1.5, 1, 1.5], [config.render?.initialScale ?? 1, .25, 3],
    [config.render?.fitPadding ?? .9, .1, 1], [config.display?.width ?? 320, 1, 4096], [config.display?.height ?? 480, 1, 4096],
    [config.camera?.yawDegrees ?? 0, -45, 45], [config.camera?.pitchDegrees ?? 0, -20, 20],
    [config.camera?.fovDegrees ?? 30, 15, 50], [config.camera?.targetHeight ?? .5, .35, .65],
    [config.gaze?.maxYawDegrees ?? 25, 0, 45], [config.gaze?.maxPitchDegrees ?? 15, 0, 30],
    [config.gaze?.smoothingMs ?? 100, 20, 1000],
    [config.mobile?.breakpoint ?? 768, 1, 4096], [config.network?.requestTimeoutMs ?? 30000, 100, 120000],
    [config.network?.modelMaxBytes ?? 64 * 1024 * 1024, 1, 64 * 1024 * 1024],
  ];
  if (checks.some(([value, min, max]) => !finite(value, min, max))) throw new Error("invalid VRM display or network limits");
  const padding = config.render?.viewportPadding;
  if (padding !== undefined) {
    if (!padding || typeof padding !== "object" || Array.isArray(padding)
      || [padding.left, padding.top, padding.right, padding.bottom].some(value => !finite(value, 0, 1024))
      || (config.display?.width ?? 320) + padding.left + padding.right > 4096
      || (config.display?.height ?? 480) + padding.top + padding.bottom > 4096) throw new Error("invalid fixed viewport padding");
  }
  const animations = config.animations ?? [];
  if (!Array.isArray(animations) || animations.length > 64) throw new Error("at most 64 animations are supported");
  const names = new Set<string>();
  if (config.embeddedAnimations !== undefined && (!Array.isArray(config.embeddedAnimations) || config.embeddedAnimations.length > 64)) throw new Error("invalid embedded animation catalog");
  for (const name of config.embeddedAnimations ?? []) {
    if (typeof name !== "string" || !name.trim() || name.length > 128 || names.has(name)) throw new Error("invalid or duplicate embedded animation");
    names.add(name);
  }
  for (const animation of animations) {
    if (!animation || typeof animation.name !== "string" || !animation.name.trim() || animation.name.length > 128 || names.has(animation.name) || typeof animation.url !== "string" || !animation.url.trim()) throw new Error("invalid or duplicate animation");
    if (animation.durationMs !== undefined && !finite(animation.durationMs, 1, 600000)) throw new Error("invalid animation duration");
    names.add(animation.name);
  }
  names.add("StarLiteIdle");
  for (const name of config.ambient?.animations ?? []) if (!names.has(name)) throw new Error(`unknown ambient animation: ${name}`);
  if ((config.ambient?.animations?.length ?? 0) > 1) throw new Error("VRM supports one explicitly configured ambient clip");
  if (config.neutralAnimation !== undefined && !names.has(config.neutralAnimation)) throw new Error("unknown neutral animation");
  const click = config.interactions?.click;
  const pool = (value: unknown): boolean => Array.isArray(value) && value.length > 0 && value.length <= 20 && new Set(value).size === value.length && value.every(name => typeof name === "string" && names.has(name));
  if (click && (click.animations !== undefined ? !pool(click.animations) : !click.animation || !names.has(click.animation))) throw new Error("Click must name available animations");
  for (const [name, scene] of Object.entries(config.dialogue ?? {})) {
    if (!scene) continue;
    if (scene.animations !== undefined && !pool(scene.animations)) throw new Error("invalid dialogue animation pool");
    if (scene.animation !== undefined && !names.has(scene.animation)) throw new Error("invalid dialogue scene");
    resolveDialogueSentences(scene, scene.animations ?? (scene.animation ? [scene.animation] : []), `dialogue.${name}`);
  }
  if (config.profile && typeof config.profile !== "string") validateCharacterProfile(config.profile);
}

export function validateCharacterProfile(input: unknown): asserts input is CharacterProfile {
  if (!input || typeof input !== "object") throw new Error("invalid character profile");
  const profile = input as CharacterProfile;
  if (profile.schemaVersion !== 1 || profile.type !== "weiguang") throw new Error("unsupported character profile");
  const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
  const pose = (value: unknown): boolean => {
    if (!record(value) || Object.keys(value).length > 256) return false;
    return Object.values(value).every((item: any) => Array.isArray(item?.rotation) && item.rotation.length === 4 && item.rotation.every((v: unknown) => finite(v, -1, 1)) && Math.abs(Math.hypot(...item.rotation) - 1) < .01 && (item.position === undefined || (Array.isArray(item.position) && item.position.length === 3 && item.position.every((v: unknown) => finite(v, -10, 10)))));
  };
  if (!pose(profile.neutralPose) || !record(profile.earPoses) || !Object.values(profile.earPoses).every(pose)) throw new Error("invalid character bone poses");
  if (!Array.isArray(profile.earBones) || profile.earBones.length > 32 || profile.earBones.some((name) => typeof name !== "string" || !name)) throw new Error("invalid ear bones");
  if (!record(profile.expressions) || Object.keys(profile.expressions).length > 64 || !Object.values(profile.expressions).every((v: any) => typeof v?.expression === "string" && (v.blink === undefined || typeof v.blink === "string"))) throw new Error("invalid expressions");
  if (profile.neutralAnimation !== undefined && (typeof profile.neutralAnimation !== "string" || !profile.neutralAnimation.trim() || profile.neutralAnimation.length > 128)) throw new Error("invalid neutral animation");
  for (const emotion of ["Neutral", ...Object.keys(profile.expressions)]) if (!profile.earPoses[emotion] || profile.earBones.some(name => !profile.earPoses[emotion]?.[name])) throw new Error("incomplete ear poses");
  const a = profile.accessories;
  if (!a || typeof a.collar !== "string" || typeof a.cone !== "string" || typeof a.collarVisible !== "boolean" || typeof a.coneVisible !== "boolean") throw new Error("invalid accessories");
  const blink = profile.blink;
  if (!blink || !finite(blink.period, 1, 60) || !Array.isArray(blink.curve) || blink.curve.length < 2 || blink.curve.length > 64) throw new Error("invalid blink timing");
  let previous = -1;
  for (const point of blink.curve) {
    if (!Array.isArray(point) || point.length !== 2 || !finite(point[0], 0, blink.period) || point[0] <= previous || !finite(point[1], 0, 1)) throw new Error("invalid blink curve");
    previous = point[0];
  }
}
