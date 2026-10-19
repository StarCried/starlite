import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const contextKeys = ["environmentId", "gpuMode", "renderer", "browser", "modelSha256", "viewport", "targetFps"];
const metricKeys = ["fps", "frameP95Ms", "renderP95Ms", "loadMs", "geometries", "textures"];

/** Validate a measurement made by a real renderer; numbers alone without a scene identity are not evidence. */
export function validateReport(report, budget) {
  if (report.schemaVersion !== 1) throw new Error("Unsupported performance report schema");
  for (const key of contextKeys) if (report.context?.[key] === undefined) throw new Error(`Missing measurement context: ${key}`);
  for (const key of ["environmentId", "renderer", "browser"]) if (typeof report.context[key] !== "string" || !report.context[key].trim()) throw new Error(`Invalid context: ${key}`);
  if (!["physical", "software"].includes(report.context.gpuMode)) throw new Error("gpuMode must identify physical or software rendering");
  if (report.context.gpuMode === "physical" && /swiftshader|llvmpipe|softpipe|software/i.test(report.context.renderer)) throw new Error("Software GL_RENDERER cannot qualify as physical GPU evidence");
  if (!/^[a-f0-9]{64}$/.test(report.context.modelSha256)) throw new Error("A SHA-256 of the tested model is required");
  for (const key of ["width", "height", "dpr"]) if (!Number.isFinite(report.context.viewport?.[key]) || !(report.context.viewport[key] > 0)) throw new Error(`Invalid viewport ${key}`);
  if (!Number.isFinite(report.context.targetFps) || !(report.context.targetFps > 0)) throw new Error("targetFps must be positive");
  if (!Number.isFinite(report.durationMs) || !Number.isSafeInteger(report.renderedFrames) || !(report.durationMs >= budget.minimumSampleMs) || !(report.renderedFrames >= budget.minimumFrames)) throw new Error("Measurement is too short for the budget");
  for (const key of metricKeys) if (!Number.isFinite(report.metrics?.[key]) || report.metrics[key] < 0) throw new Error(`Invalid metric: ${key}`);
  if (report.metrics.heapBytes !== null && (!Number.isFinite(report.metrics.heapBytes) || report.metrics.heapBytes < 0)) throw new Error("heapBytes must be measured or explicitly null when unavailable");
  if (report.metrics.fps === 0 || report.metrics.frameP95Ms === 0) throw new Error("No running-frame evidence");
  if (Math.abs(report.metrics.fps - report.renderedFrames * 1000 / report.durationMs) > .25) throw new Error("FPS disagrees with measured rendered frames and sample duration");
  for (const key of ["geometries", "textures"]) if (!Number.isSafeInteger(report.metrics[key])) throw new Error(`Invalid resource count: ${key}`);
}

export function verifyPerformance(report, budget, { baseline, profile } = {}) {
  validateReport(report, budget);
  if (!baseline && !profile) throw new Error("Select --profile physical30/physical60 or supply --baseline for a same-machine regression comparison");
  if (profile) {
    const targetFps = profile === "physical30" ? 30 : profile === "physical60" ? 60 : undefined;
    if (!targetFps || report.context.gpuMode !== "physical" || report.context.targetFps !== targetFps) throw new Error(`${profile} requires measured physical GPU rendering at its FPS cap`);
    const p = budget[profile], m = report.metrics;
    if (["width", "height", "dpr"].some(key => report.context.viewport[key] !== p.scene[key])) throw new Error(`${profile} requires its fixed 320×480 DPR 1 scene`);
    if (m.fps < p.fpsMin || m.frameP95Ms > p.frameP95MsMax || m.renderP95Ms > p.renderP95MsMax || m.loadMs > p.localLoadMsMax) throw new Error(`Physical ${targetFps} FPS fixed-scene target exceeded`);
  }
  if (baseline) {
    validateReport(baseline, budget);
    for (const key of contextKeys) if (JSON.stringify(report.context[key]) !== JSON.stringify(baseline.context[key])) throw new Error(`Baseline environment/scene differs: ${key}`);
    const p = budget.relative, m = report.metrics, b = baseline.metrics;
    if (m.fps < b.fps * p.fpsRatioMin || m.frameP95Ms > b.frameP95Ms * p.frameP95RatioMax || m.renderP95Ms > Math.max(b.renderP95Ms * p.renderP95RatioMax, b.renderP95Ms + p.renderNoiseMs) || m.loadMs > Math.max(b.loadMs * p.loadRatioMax, b.loadMs + p.loadNoiseMs)) throw new Error("Same-machine performance regression budget exceeded");
    if (m.geometries > b.geometries + p.geometryGrowthMax || m.textures > b.textures + p.textureGrowthMax) throw new Error("Renderer resource count grew for the same scene");
    if (m.heapBytes !== null && b.heapBytes !== null && m.heapBytes > b.heapBytes + p.heapGrowthBytesMax) throw new Error("Measured JavaScript heap growth exceeded budget");
  }
  if (report.resourceCycles) {
    const { cycles, before, after } = report.resourceCycles;
    if (!Number.isInteger(cycles) || cycles < 20 || !before || !after) throw new Error("Repeated mount/destroy evidence needs at least 20 measured cycles");
    for (const key of ["geometries", "textures"]) {
      if (![before[key], after[key]].every((value) => Number.isFinite(value) && value >= 0)) throw new Error(`Invalid resource-cycle metric: ${key}`);
      if (after[key] > before[key]) throw new Error(`Renderer resource leak after mount/destroy: ${key}`);
    }
  }
  return { passed: true, scope: report.context.gpuMode === "software" ? "same-machine software regression only" : "recorded physical-GPU fixed scene", heapScope: "JavaScript heap only; excludes browser process tree and GPU allocations" };
}

/** Whole-process/GPU counters must actually exist; JavaScript heap is never a substitute. */
export function verifyLongRun(report, budget) {
  const p = budget.ownedBrowserWeiguang, performance = report.performance;
  verifyPerformance(performance, budget, { profile: "physical30" });
  if (performance.context.modelSha256 !== p.modelSha256 || !performance.context.renderer.includes(p.rendererIncludes)
    || !performance.context.browser.startsWith(p.browserPrefix)) throw new Error("Long-run budget requires its qualified model/browser/GPU profile");
  if (!(performance.durationMs >= p.minimumDurationMs) || !Array.isArray(report.samples) || report.samples.length < p.minimumSamples) throw new Error("Long-run process measurement is incomplete");
  if (!Array.isArray(report.cycles) || report.cycles.length < 20 || !performance.resourceCycles
    || report.cycles.some((cycle, index) => !Number.isSafeInteger(cycle.cycle) || cycle.cycle !== index + 1
      || !cycle.after || cycle.after.live !== 0 || cycle.after.domCanvases !== 0
      || !Number.isSafeInteger(cycle.after.lost) || !Number.isSafeInteger(cycle.after.contexts)
      || cycle.after.lost !== cycle.after.contexts || cycle.after.lost < cycle.cycle
      || !Number.isFinite(cycle.postGcHeap) || cycle.postGcHeap <= 0)
    || report.finalWebgl?.live !== 0 || report.finalWebgl?.domCanvases !== 0
    || !Number.isSafeInteger(report.finalWebgl?.lost) || !Number.isSafeInteger(report.finalWebgl?.contexts)
    || report.finalWebgl.lost <= report.cycles.length
    || report.finalWebgl.lost !== report.finalWebgl.contexts) throw new Error("Long-run requires 20 measured mount/destroy cycles and released final WebGL context");
  if (report.cycles.at(-1).postGcHeap - report.cycles[0].postGcHeap > p.postGcHeapGrowthBytesMax) throw new Error("Post-destroy heap growth exceeded budget across model cycles");
  const samples = report.samples;
  if (!(samples[0].elapsedMs >= 30000) || samples[0].elapsedMs > p.maximumSampleGapMs
    || samples.at(-1).elapsedMs < p.minimumDurationMs) throw new Error("Long-run needs a 30-second idle baseline through at least 15 minutes");
  for (let i = 0; i < samples.length; i++) {
    if (!Number.isFinite(samples[i].elapsedMs) || (i && (samples[i].elapsedMs <= samples[i - 1].elapsedMs
      || samples[i].elapsedMs - samples[i - 1].elapsedMs > p.maximumSampleGapMs))) throw new Error("Invalid or sparse long-run sample timeline");
  }
  const processes = samples.map(sample => sample.process);
  const absoluteProcesses = [...processes, report.emptyProcess, report.afterDestroyedProcess, report.finalProcess];
  for (const process of absoluteProcesses) {
    if (!process || process.error || !Number.isSafeInteger(process.processes) || process.processes < 1
      || !Number.isFinite(process.privateBytes) || process.privateBytes <= 0
      || !Number.isFinite(process.gpuDedicatedBytes) || process.gpuDedicatedBytes <= 0
      || !Number.isFinite(process.gpuSharedBytes) || process.gpuSharedBytes < 0
      || !Number.isFinite(process.cpuMs) || process.cpuMs < 0) throw new Error("Missing measured browser process/GPU/CPU counters");
  }
  if (!Array.isArray(report.loadProcessSamples) || report.loadProcessSamples.length < 20
    || report.loadProcessSamples.some(sample => !Number.isFinite(sample.privateBytes) || sample.privateBytes <= 0)) throw new Error("Missing sampled process memory during model load/cycles");
  const sampledPrivatePeak = Math.max(...absoluteProcesses.map(sample => sample.privateBytes), ...report.loadProcessSamples.map(sample => sample.privateBytes));
  const dedicatedPeak = Math.max(...absoluteProcesses.map(sample => sample.gpuDedicatedBytes));
  const sharedPeak = Math.max(...absoluteProcesses.map(sample => sample.gpuSharedBytes));
  if (sampledPrivatePeak > p.privateBytesMax || dedicatedPeak > p.gpuDedicatedBytesMax || sharedPeak > p.gpuSharedBytesMax) throw new Error("Measured owned-browser memory ceiling exceeded");
  const first = processes[0], last = processes.at(-1);
  const privateGrowth = Math.max(...processes.map(sample => sample.privateBytes)) - first.privateBytes;
  const gpuGrowth = Math.max(...processes.map(sample => sample.gpuDedicatedBytes)) - first.gpuDedicatedBytes;
  if (privateGrowth > p.idlePrivateGrowthBytesMax || gpuGrowth > p.idleGpuGrowthBytesMax) throw new Error("Long-run resident/GPU growth budget exceeded");
  if (!Number.isFinite(performance.initialPostGcHeapBytes) || performance.initialPostGcHeapBytes <= 0
    || !Number.isFinite(performance.metrics.heapBytes) || performance.metrics.heapBytes <= 0) throw new Error("Missing comparable post-GC heap measurements");
  const heapGrowth = performance.metrics.heapBytes - performance.initialPostGcHeapBytes;
  if (heapGrowth > p.postGcHeapGrowthBytesMax) throw new Error("Long-run post-GC heap growth budget exceeded");
  const cpuCorePercent = (last.cpuMs - first.cpuMs) / (samples.at(-1).elapsedMs - samples[0].elapsedMs) * 100;
  if (!Number.isFinite(cpuCorePercent) || cpuCorePercent < 0 || cpuCorePercent > p.averageCpuCorePercentMax) throw new Error("Owned-browser average CPU budget exceeded or counters reset");
  return { passed: true, scope: p.scope, sampledPrivatePeak, dedicatedPeak, sharedPeak, privateGrowth, gpuGrowth, heapGrowth, cpuCorePercent };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), input = args[0];
  if (!input) throw new Error("Usage: node tools/verify-performance-report.mjs report.json [--baseline baseline.json] [--profile physical30|physical60|ownedBrowserWeiguang]");
  const budget = JSON.parse(await readFile(new URL("./performance-budget.json", import.meta.url), "utf8")).measurement;
  const value = (flag) => args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined;
  const report = JSON.parse(await readFile(input, "utf8"));
  const baselinePath = value("--baseline");
  const baseline = baselinePath ? JSON.parse(await readFile(baselinePath, "utf8")) : undefined;
  console.log(JSON.stringify(value("--profile") === "ownedBrowserWeiguang" ? verifyLongRun(report, budget)
    : verifyPerformance(report, budget, { baseline, profile: value("--profile") }), null, 2));
}
