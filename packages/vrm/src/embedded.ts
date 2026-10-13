import { AnimationClip, InterpolateDiscrete, InterpolateLinear, Interpolant, Matrix3, Matrix4, NumberKeyframeTrack, Object3D, PropertyBinding, Quaternion, Vector3, type BufferAttribute, type KeyframeTrack, type Mesh } from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import type { VRM } from "@pixiv/three-vrm";
import { embeddedAnimationCatalog } from "./inspect.js";

type Json = Record<string, any>;
type MorphProxy = { node: Object3D & { weights: number[] }; mesh: Mesh; registered: Set<number> };
type InterpolantFactory = ((this: KeyframeTrack, result?: Float32Array) => Interpolant) & { isInterpolantFactoryMethodGLTFCubicSpline?: boolean };
type InterpolatedTrack = KeyframeTrack & { createInterpolant: InterpolantFactory };

/** Capture model-local to normalized rig calibration before rotateVRM0 or applying a pose. */
export async function prepareEmbeddedAnimations(gltf: GLTF, vrm: VRM, json: Json, signal?: AbortSignal): Promise<{ clips: AnimationClip[]; eyeClips: ReadonlySet<string>; applyMorphs(): void }> {
  const catalog = embeddedAnimationCatalog(json);
  const rawBones = new Map<Object3D, { normalized: Object3D; rest: Quaternion; parent: Quaternion; translation: Matrix4; hips: boolean; eye: boolean }>();
  for (const [name, raw] of Object.entries(vrm.humanoid.rawHumanBones ?? {})) {
    if (!raw) continue;
    const normalized = vrm.humanoid.normalizedHumanBones[name as keyof typeof vrm.humanoid.normalizedHumanBones]?.node;
    if (!normalized) continue;
    raw.node.updateWorldMatrix(true, false); normalized.updateWorldMatrix(true, false);
    const parentMatrix = raw.node.parent?.matrixWorld ?? new Matrix4();
    const normalizedParent = normalized.parent?.matrixWorld ?? new Matrix4();
    const parent = new Quaternion(); parentMatrix.decompose(new Vector3(), parent, new Vector3());
    rawBones.set(raw.node, { normalized, rest: raw.node.quaternion.clone(), parent, translation: normalizedParent.clone().invert().multiply(parentMatrix), hips: name === "hips", eye: name === "leftEye" || name === "rightEye" });
  }
  const proxies = new Map<Mesh, MorphProxy>();
  const registered = new Map<Mesh, Set<number>>();
  for (const expression of vrm.expressionManager?.expressions ?? []) {
    for (const bind of expression.binds) {
      const morph = bind as { primitives?: Mesh[]; index?: number };
      if (!morph.primitives || morph.index === undefined) continue;
      for (const mesh of morph.primitives) {
        const indices = registered.get(mesh) ?? new Set<number>(); indices.add(morph.index); registered.set(mesh, indices);
      }
    }
  }
  const clips: AnimationClip[] = [];
  const eyeClips = new Set<string>();
  for (const [clipIndex, entry] of catalog.entries()) {
    if (clipIndex > 0) await new Promise<void>(resolve => setTimeout(resolve, 0));
    signal?.throwIfAborted();
    const source = gltf.animations[clipIndex];
    if (!source) throw new Error("embedded animation did not load");
    const animation = json.animations[clipIndex] as Json;
    const expressions = animation.extras?.starlite?.expressions;
    if (expressions !== undefined && (!expressions || typeof expressions !== "object" || Array.isArray(expressions) || Object.keys(expressions).length > 64)) throw new Error("invalid embedded expression tracks");
    const tracks: KeyframeTrack[] = [];
    for (const sourceTrack of source.tracks) {
      const parsed = PropertyBinding.parseTrackName(sourceTrack.name);
      const node = PropertyBinding.findNode(gltf.scene, parsed.nodeName) as Object3D | null;
      if (!node) throw new Error("embedded animation targets a missing node");
      const raw = rawBones.get(node);
      if (raw && parsed.propertyName === "quaternion") {
        if (raw.eye) eyeClips.add(entry.name);
        const track = sourceTrack.clone(); track.name = raw.normalized.uuid + ".quaternion";
        const before = raw.parent, after = raw.rest.clone().invert().multiply(raw.parent.clone().invert());
        const q = new Quaternion();
        for (let offset = 0; offset < track.values.length; offset += 4) q.fromArray(track.values, offset).premultiply(before).multiply(after).toArray(track.values, offset);
        tracks.push(track);
      } else if (raw?.hips && parsed.propertyName === "position") {
        const track = sourceTrack.clone(); track.name = raw.normalized.uuid + ".position";
        const cubic = isCubic(track), derivative = new Matrix3().setFromMatrix4(raw.translation), vector = new Vector3();
        for (let offset = 0; offset < track.values.length; offset += 3) {
          vector.fromArray(track.values, offset);
          if (cubic && Math.floor(offset / 3) % 3 !== 1) vector.applyMatrix3(derivative);
          else vector.applyMatrix4(raw.translation);
          vector.toArray(track.values, offset);
        }
        tracks.push(track);
      } else if (parsed.propertyName === "morphTargetInfluences") {
        // Named samplers preserve expression-driven blink/ear recipes; standard
        // mesh weights remain in authored files for other glTF viewers.
        if (expressions !== undefined) continue;
        const mesh = node as Mesh;
        if (!mesh.morphTargetInfluences) throw new Error("embedded animation has invalid morph targets");
        let proxy = proxies.get(mesh);
        if (!proxy) {
          const proxyNode = new Object3D() as MorphProxy["node"];
          const indices = registered.get(mesh) ?? new Set<number>();
          proxyNode.weights = mesh.morphTargetInfluences.map((value, index) => indices.has(index) ? 0 : value);
          gltf.scene.add(proxyNode); proxy = { node: proxyNode, mesh, registered: indices }; proxies.set(mesh, proxy);
        }
        const cubic = isCubic(sourceTrack), width = sourceTrack.getValueSize() / (cubic ? 3 : 1);
        if (width !== mesh.morphTargetInfluences.length) throw new Error("embedded morph track size does not match mesh");
        for (let index = 0; index < width; index++) {
          const track = new NumberKeyframeTrack(proxy.node.uuid + ".weights[" + index + "]", sourceTrack.times.slice(), sourceTrack.values.filter((_, offset) => offset % width === index));
          (track as InterpolatedTrack).createInterpolant = (sourceTrack as InterpolatedTrack).createInterpolant;
          tracks.push(track);
        }
      } else {
        const track = sourceTrack.clone(); track.name = node.uuid + "." + parsed.propertyName + (parsed.propertyIndex !== undefined ? "[" + parsed.propertyIndex + "]" : "");
        tracks.push(track);
      }
    }
    if (expressions !== undefined) {
      for (const [name, samplerIndex] of Object.entries(expressions)) {
        const expression = vrm.expressionManager?.getExpression(name);
        const sampler = Number.isSafeInteger(samplerIndex) ? animation.samplers[samplerIndex as number] as Json | undefined : undefined;
        if (!expression || !sampler || json.accessors[sampler.output]?.type !== "SCALAR" || json.accessors[sampler.output]?.componentType !== 5126) throw new Error("invalid embedded expression sampler");
        const times = await gltf.parser.getDependency("accessor", sampler.input) as BufferAttribute;
        const values = await gltf.parser.getDependency("accessor", sampler.output) as BufferAttribute;
        const cubic = sampler.interpolation === "CUBICSPLINE";
        if (times.itemSize !== 1 || values.itemSize !== 1 || values.count !== times.count * (cubic ? 3 : 1)) throw new Error("invalid embedded expression sampler size");
        signal?.throwIfAborted();
        const target = /^VRMExpression_blink(?:Left|Right)?$/.test(expression.name) ? expression.name : expression.uuid;
        const track = new NumberKeyframeTrack(target + ".weight", Array.from({ length: times.count }, (_, index) => times.getX(index)), Array.from({ length: values.count }, (_, index) => values.getX(index)), sampler.interpolation === "STEP" ? InterpolateDiscrete : InterpolateLinear);
        if (cubic) (track as InterpolatedTrack).createInterpolant = scalarCubicFactory;
        tracks.push(track);
      }
    }
    if (!tracks.length || tracks.some(track => Array.from(track.values).some(value => !Number.isFinite(value)))) throw new Error("embedded animation has invalid tracks");
    clips.push(new AnimationClip(entry.name, entry.durationMs / 1000, tracks));
  }
  return {
    clips, eyeClips,
    applyMorphs() {
      for (const { node, mesh, registered: indices } of proxies.values()) for (const [index, value] of node.weights.entries()) mesh.morphTargetInfluences![index] = indices.has(index) ? Math.min(1, mesh.morphTargetInfluences![index]! + value) : value;
    },
  };
}

function isCubic(track: KeyframeTrack): boolean { return Boolean((track as InterpolatedTrack).createInterpolant.isInterpolantFactoryMethodGLTFCubicSpline); }

class ScalarCubicInterpolant extends Interpolant {
  copySampleValue_(index: number): Float32Array { this.resultBuffer[0] = this.sampleValues[index * 3 + 1]; return this.resultBuffer; }
  interpolate_(index: number, start: number, time: number, end: number): Float32Array {
    const duration = end - start, t = (time - start) / duration, t2 = t * t, t3 = t2 * t;
    const left = (index - 1) * 3, right = index * 3, values = this.sampleValues;
    this.resultBuffer[0] = (2 * t3 - 3 * t2 + 1) * values[left + 1] + (t3 - 2 * t2 + t) * duration * values[left + 2] + (-2 * t3 + 3 * t2) * values[right + 1] + (t3 - t2) * duration * values[right];
    return this.resultBuffer;
  }
}
const scalarCubicFactory = Object.assign(function (this: KeyframeTrack, result?: Float32Array) { return new ScalarCubicInterpolant(this.times, this.values, 1, result); }, { isInterpolantFactoryMethodGLTFCubicSpline: true });
