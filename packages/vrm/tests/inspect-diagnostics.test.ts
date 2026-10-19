import { describe, expect, it } from "vitest";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import { CharacterBehavior } from "../src/character.js";
import { inspectVrm, parseGlb, VrmInspectionError } from "../src/inspect.js";
// @ts-expect-error Synthetic artwork-free fixture generator is plain JavaScript.
import { model, glb, motion } from "../../../tests/fixtures/vrm.mjs";

function variant(version: string, edit: (json: any) => void): ArrayBuffer {
  const bytes = Uint8Array.from(model(version)).buffer;
  const json = parseGlb(bytes, "vrm"), binary = Buffer.from(bytes.slice(28 + new DataView(bytes).getUint32(12, true)));
  edit(json);
  return Uint8Array.from(glb(json, binary)).buffer;
}
function errorFor(bytes: ArrayBuffer): VrmInspectionError {
  try { inspectVrm(bytes); } catch (error) { expect(error).toBeInstanceOf(VrmInspectionError); return error as VrmInspectionError; }
  throw new Error("Expected inspection to reject fixture");
}
function ext(json: any, version: string): any { return version === "0" ? json.extensions.VRM : json.extensions.VRMC_vrm; }
function preset(json: any, version: string): any { const e = ext(json, version); return version === "0" ? e.blendShapeMaster.blendShapeGroups[0] : e.expressions.preset.blink; }
function addEyeBones(json: any, version: string): void {
  for (const name of ["leftEye", "rightEye"]) {
    const node = json.nodes.length;
    json.nodes.push({ name, translation: [0, 0, .05] }); json.nodes[2].children.push(node);
    if (version === "0") ext(json, version).humanoid.humanBones.push({ bone: name, node });
    else ext(json, version).humanoid.humanBones[name] = { node };
  }
}
async function load(bytes: ArrayBuffer): Promise<any> {
  const loader = new GLTFLoader(); loader.register(parser => new VRMLoaderPlugin(parser));
  return (await loader.parseAsync(bytes, "")).userData.vrm;
}

describe.each(["0", "1"])("VRM%s actionable inspection", version => {
  const required = ["hips", "spine", "head", ...["left", "right"].flatMap(side => ["UpperLeg", "LowerLeg", "Foot", "UpperArm", "LowerArm", "Hand"].map(part => side + part))];
  it.each(required)("identifies missing %s with a controlled bone list", name => {
    const bytes = variant(version, json => {
      const humanoid = ext(json, version).humanoid;
      if (version === "0") humanoid.humanBones = humanoid.humanBones.filter((bone: any) => bone.bone !== name);
      else delete humanoid.humanBones[name];
    });
    const error = errorFor(bytes);
    expect(error.code).toBe("HUMANOID_BONES"); expect(error.details.missingBones).toEqual([name]);
    expect(error.message).toContain(name); expect(error.message).toContain("VRM exporter");
  });
  it("reports invalid node and reused node mappings without model-authored node names", () => {
    const invalid = errorFor(variant(version, json => {
      const e = ext(json, version), bones = version === "0" ? Object.fromEntries(e.humanoid.humanBones.map((b: any) => [b.bone, b])) : e.humanoid.humanBones;
      bones.hips.node = 999;
      bones.leftHand.node = bones.rightHand.node;
      json.nodes[2].name = "file:///private/token=secret";
    }));
    expect(invalid.details.invalidBones).toEqual(["hips"]);
    expect(invalid.details.duplicateBones).toEqual(["leftHand", "rightHand"]);
    expect(invalid.message).not.toMatch(/private|secret|file:/);
  });
  it("preserves a useful no-animation model catalog and bounded logical metrics", () => {
    const bytes = variant(version, () => {}), info = inspectVrm(bytes);
    expect(info.animations).toEqual([]); expect(info.capabilities.humanoid.requiredBones).toEqual(required);
    expect(info.metrics).toEqual({ fileBytes: bytes.byteLength, nodeCount: 15, meshCount: 1, primitiveCount: 1, materialCount: 1, imageCount: 0, textureCount: 0, vertexCount: 3, triangleCount: 1, morphTargetCount: 1, decodedAccessorBytes: 72 });
    expect(info.capabilities.blink).toEqual({ automatic: true, combined: true, left: false, right: false });
    expect(info.capabilities.lookAt).toEqual({ mode: "none", head: true, eyes: false, horizontal: false, vertical: false });
  });
  for (const kind of ["missing", "empty", "zero", "left", "paired"] as const) it(`matches the runtime for ${kind} blink presets`, async () => {
    const bytes = variant(version, json => {
      const e = ext(json, version), blink = preset(json, version), binds = version === "0" ? "binds" : "morphTargetBinds";
      if (kind === "missing") { if (version === "0") delete e.blendShapeMaster; else delete e.expressions; }
      else if (kind === "empty") blink[binds] = [];
      else if (kind === "zero") blink[binds][0].weight = 0;
      else if (version === "0") e.blendShapeMaster.blendShapeGroups = (kind === "left" ? ["blink_l"] : ["blink_l", "blink_r"]).map(presetName => ({ ...blink, name: presetName, presetName }));
      else e.expressions.preset = Object.fromEntries((kind === "left" ? ["blinkLeft"] : ["blinkLeft", "blinkRight"]).map(name => [name, { ...blink }]));
    });
    const capability = inspectVrm(bytes).capabilities.blink, vrm = await load(bytes), behavior = new CharacterBehavior(vrm);
    expect(capability.automatic).toBe(kind === "paired"); expect(capability.left).toBe(kind === "left" || kind === "paired");
    behavior.beforeExpressions(3.5); vrm.expressionManager?.update(); behavior.afterExpressions();
    const closed = (vrm.expressionManager?.expressions ?? []).filter((expression: any) => expression.weight > 0).length > 0;
    expect(closed).toBe(capability.automatic); VRMUtils.deepDispose(vrm.scene);
  });
  it("rejects a malformed secondary blink bind with a specific preset diagnostic", () => {
    const bytes = variant(version, json => {
      const p = preset(json, version), binds = version === "0" ? p.binds : p.morphTargetBinds;
      binds.push({ ...binds[0], index: 999 });
    });
    expect(errorFor(bytes)).toMatchObject({ code: "INVALID_BLINK", details: { preset: "blink" } });
  });
  it("does not claim blink merely because an empty morph target slot exists", async () => {
    const bytes = variant(version, json => { json.meshes[0].primitives[0].targets = [{}]; });
    expect(inspectVrm(bytes).capabilities.blink.automatic).toBe(false);
    const vrm = await load(bytes), behavior = new CharacterBehavior(vrm); behavior.beforeExpressions(3.5);
    expect(vrm.expressionManager?.getValue("blink") ?? 0).toBe(0); VRMUtils.deepDispose(vrm.scene);
  });
  it("reports real bone-driven eye tracking and zero-range degradation", async () => {
    for (const enabled of [true, false]) {
      const bytes = variant(version, json => {
        addEyeBones(json, version); const e = ext(json, version), range = version === "0" ? { yRange: enabled ? 10 : 0 } : { outputScale: enabled ? 10 : 0 };
        if (version === "0") e.firstPerson = { lookAtTypeName: "Bone", lookAtHorizontalOuter: range, lookAtHorizontalInner: range, lookAtVerticalUp: range, lookAtVerticalDown: range };
        else e.lookAt = { type: "bone", rangeMapHorizontalOuter: range, rangeMapHorizontalInner: range, rangeMapVerticalUp: range, rangeMapVerticalDown: range };
      });
      const capability = inspectVrm(bytes).capabilities.lookAt, vrm = await load(bytes);
      expect(capability).toEqual({ mode: "bone", head: true, eyes: enabled, horizontal: enabled, vertical: enabled });
      const eye = vrm.humanoid.getRawBoneNode("leftEye"), before = eye.quaternion.clone();
      vrm.lookAt.applier.applyYawPitch(20, 10); expect(eye.quaternion.angleTo(before) > .001).toBe(enabled);
      VRMUtils.deepDispose(vrm.scene);
    }
  });
  it("requires actual eye bones and the expression manager used by three-vrm", async () => {
    for (const withBones of [true, false]) {
      const bytes = variant(version, json => {
        const e = ext(json, version); if (withBones) { addEyeBones(json, version); if (version === "0") delete e.blendShapeMaster; else delete e.expressions; }
        if (version === "0") e.firstPerson = { lookAtTypeName: "Bone" }; else e.lookAt = { type: "bone" };
      });
      expect(inspectVrm(bytes).capabilities.lookAt.eyes).toBe(false);
      const vrm = await load(bytes);
      if (withBones) expect(vrm.lookAt).toBeFalsy(); VRMUtils.deepDispose(vrm.scene);
    }
  });
  it("recognizes the correct VRM0/1 look expression preset names and useful ranges", async () => {
    for (const complete of [true, false]) {
      const bytes = variant(version, json => {
        const e = ext(json, version), blink = preset(json, version), names = complete ? ["lookUp", "lookDown", "lookLeft", "lookRight"] : ["lookUp", "lookLeft", "lookRight"];
        if (version === "0") { e.firstPerson = { lookAtTypeName: "BlendShape" }; e.blendShapeMaster.blendShapeGroups.push(...names.map(name => ({ ...blink, name, presetName: name.toLowerCase() }))); }
        else { e.lookAt = { type: "expression" }; Object.assign(e.expressions.preset, Object.fromEntries(names.map(name => [name, { ...blink }]))); }
      });
      const capability = inspectVrm(bytes).capabilities.lookAt;
      expect(capability).toEqual({ mode: "expression", head: true, eyes: true, horizontal: true, vertical: complete });
      const vrm = await load(bytes); vrm.lookAt.applier.applyYawPitch(20, 10);
      expect(vrm.expressionManager.getValue("lookLeft")).toBeGreaterThan(0);
      expect(vrm.expressionManager.getValue("lookDown") ?? 0).toBe(complete ? 10 / 90 : 0); VRMUtils.deepDispose(vrm.scene);
    }
  });
  it("rejects invalid look ranges and declared look morphs", () => {
    expect(errorFor(variant(version, json => {
      const e = ext(json, version); if (version === "0") e.firstPerson = { lookAtTypeName: "Bone", lookAtHorizontalInner: { yRange: -1 } }; else e.lookAt = { type: "bone", rangeMapHorizontalInner: { outputScale: -1 } };
    })).code).toBe("INVALID_LOOK_AT");
    expect(errorFor(variant(version, json => {
      const e = ext(json, version), blink = preset(json, version);
      if (version === "0") { e.firstPerson = { lookAtTypeName: "BlendShape" }; e.blendShapeMaster.blendShapeGroups.push({ ...blink, presetName: "lookleft", binds: [{ ...blink.binds[0], index: 999 }] }); }
      else { e.lookAt = { type: "expression" }; e.expressions.preset.lookLeft = { morphTargetBinds: [{ ...blink.morphTargetBinds[0], index: 999 }] }; }
    })).code).toBe("INVALID_LOOK_AT");
  });
});

it("identifies duplicate VRM0 preset bone mappings before Object.fromEntries can hide them", () => {
  const error = errorFor(variant("0", json => { const bones = json.extensions.VRM.humanoid.humanBones; bones.push({ ...bones[0] }); }));
  expect(error).toMatchObject({ code: "HUMANOID_BONES", details: { duplicateBones: ["hips"] } });
});
it("reports unsupported formats, incomplete GLB and external resources without exposing input", () => {
  expect(errorFor(new TextEncoder().encode("FBX unofficial private text contents").buffer).code).toBe("INVALID_GLB");
  expect(errorFor(Uint8Array.from(glb({ asset: { version: "2.0" } })).buffer).code).toBe("UNSUPPORTED_FORMAT");
  const external = errorFor(variant("1", json => { json.images = [{ uri: "https://user:password@example.invalid/private/model.png?token=secret" }]; }));
  expect(external.code).toBe("EXTERNAL_RESOURCE"); expect(external.message).toContain("embed all textures"); expect(external.message).not.toMatch(/password|secret|example|private/);
  const malformed = variant("1", () => {}); new Uint8Array(malformed)[20] = 0xff;
  const error = errorFor(malformed); expect(error.code).toBe("INVALID_GLB"); expect(error.message).toContain("re-export");
});
it("preserves embedded animation names and durations in the inspection catalog", () => {
  const bytes = Uint8Array.from(motion()).buffer, json = parseGlb(bytes, "vrma");
  json.extensions = { VRMC_vrm: { specVersion: "1.0", humanoid: { humanBones: Object.fromEntries(["hips", "spine", "head", ...["left", "right"].flatMap(side => ["UpperLeg", "LowerLeg", "Foot", "UpperArm", "LowerArm", "Hand"].map(part => side + part))].map((name, node) => [name, { node }])) } } };
  json.extensionsUsed = ["VRMC_vrm"]; json.nodes = Array.from({ length: 15 }, () => ({})); json.animations[0].name = "Wave";
  const binary = Buffer.from(bytes.slice(28 + new DataView(bytes).getUint32(12, true)));
  expect(inspectVrm(Uint8Array.from(glb(json, binary)).buffer).animations).toEqual([{ name: "Wave", durationMs: 1000 }]);
});
