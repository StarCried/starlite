import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { verifyPerformance, verifyLongRun } from "./verify-performance-report.mjs";
const budget = JSON.parse(await readFile(new URL("./performance-budget.json", import.meta.url))).measurement;
const sample = () => ({ schemaVersion: 1, context: { environmentId: "fixed-test-machine", gpuMode: "physical", renderer: "Test GPU", browser: "Chromium 140", modelSha256: "a".repeat(64), viewport: { width: 320, height: 480, dpr: 1 }, targetFps: 30 }, durationMs: 15000, renderedFrames: 440, metrics: { fps: 29.3, frameP95Ms: 34, renderP95Ms: 3, loadMs: 1000, heapBytes: 20000000, geometries: 4, textures: 4 } });
test("physical target accepts measured fixed scene and rejects software masquerading as hardware", () => {
  assert.equal(verifyPerformance(sample(), budget, { profile: "physical30" }).passed, true);
  const software = sample(); software.context.gpuMode = "software";
  assert.throws(() => verifyPerformance(software, budget, { profile: "physical30" }), /physical30/);
  const slow = sample(); slow.metrics.frameP95Ms = 100;
  assert.throws(() => verifyPerformance(slow, budget, { profile: "physical30" }), /exceeded/);
  const otherScene = sample(); otherScene.context.viewport.width = 64;
  assert.throws(() => verifyPerformance(otherScene, budget, { profile: "physical30" }), /fixed/);
  const fakeHardware = sample(); fakeHardware.context.renderer = "ANGLE SwiftShader";
  assert.throws(() => verifyPerformance(fakeHardware, budget, { profile: "physical30" }), /Software GL_RENDERER/);
  const faster = sample(); faster.context.targetFps = 60; faster.renderedFrames = 900;
  faster.metrics.fps = 60; faster.metrics.frameP95Ms = 20;
  assert.equal(verifyPerformance(faster, budget, { profile: "physical60" }).passed, true);
});
test("relative gate requires identical model and environment, enough frames and finite real metrics", () => {
  const baseline = sample(); const current = sample(); current.context.gpuMode = baseline.context.gpuMode = "software";
  assert.match(verifyPerformance(current, budget, { baseline }).scope, /software/);
  current.context.modelSha256 = "b".repeat(64); assert.throws(() => verifyPerformance(current, budget, { baseline }), /differs/);
  current.context.modelSha256 = baseline.context.modelSha256; current.metrics.renderP95Ms = 10; assert.throws(() => verifyPerformance(current, budget, { baseline }), /regression/);
  current.metrics.renderP95Ms = 3; current.renderedFrames = 1; assert.throws(() => verifyPerformance(current, budget, { baseline }), /short/);
  current.renderedFrames = 440; current.metrics.fps = null; assert.throws(() => verifyPerformance(current, budget, { baseline }), /Invalid metric/);
});
test("optional unavailable heap stays explicit; repeated resource leak rejects even if FPS passes", () => {
  const current = sample(); current.metrics.heapBytes = null;
  current.resourceCycles = { cycles: 20, before: { geometries: 0, textures: 0 }, after: { geometries: 0, textures: 0 } };
  assert.equal(verifyPerformance(current, budget, { profile: "physical30" }).passed, true);
  current.resourceCycles.after.textures = 1; assert.throws(() => verifyPerformance(current, budget, { profile: "physical30" }), /resource leak/);
});

function longSample() {
  const performance = sample(); performance.context.renderer = "ANGLE NVIDIA GeForce RTX 5080 D3D11";
  performance.context.browser = "155.0.8059.80"; performance.context.modelSha256 = budget.ownedBrowserWeiguang.modelSha256;
  performance.durationMs = 900000; performance.renderedFrames = 27000; performance.metrics.fps = 30;
  performance.initialPostGcHeapBytes = performance.metrics.heapBytes;
  performance.resourceCycles = { cycles: 20, before: { geometries: 6, textures: 8 }, after: { geometries: 6, textures: 8 } };
  return { performance, cycles: Array.from({ length: 20 }, (_, i) => ({ cycle: i + 1,
    postGcHeap: 5000000, after: { live: 0, domCanvases: 0, lost: i + 1, contexts: i + 1 } })),
  finalWebgl: { live: 0, domCanvases: 0, lost: 21, contexts: 21 },
  samples: Array.from({ length: 30 }, (_, i) => ({ elapsedMs: (i + 1) * 30000,
    process: { processes: 8, privateBytes: 650 * 1024 ** 2, gpuDedicatedBytes: 150 * 1024 ** 2, gpuSharedBytes: 5 * 1024 ** 2, cpuMs: (i + 1) * 300 } })),
  loadProcessSamples: Array.from({ length: 40 }, () => ({ privateBytes: 700 * 1024 ** 2 })) };
}
test("whole-process long-run gate requires actual CPU/RAM/GPU counters and enforces resident growth separately from JS heap", () => {
  assert.equal(verifyLongRun(longSample(), budget).passed, true);
  const absent = longSample(); delete absent.samples[10].process.gpuDedicatedBytes;
  assert.throws(() => verifyLongRun(absent, budget), /Missing measured/);
  const leakedContext = longSample(); leakedContext.cycles[19].after.live = 1;
  assert.throws(() => verifyLongRun(leakedContext, budget), /20 measured/);
  const growth = longSample(); growth.samples.at(-1).process.privateBytes += 65 * 1024 ** 2;
  assert.throws(() => verifyLongRun(growth, budget), /growth/);
  const peak = longSample(); peak.loadProcessSamples[0].privateBytes = 2 * 1024 ** 3;
  assert.throws(() => verifyLongRun(peak, budget), /ceiling/);
  const cpu = longSample(); cpu.samples.at(-1).process.cpuMs += 300000;
  assert.throws(() => verifyLongRun(cpu, budget), /CPU budget/);
});
