import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import {
  access,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const MAX_COMMAND_OUTPUT = 16 * 1024 * 1024;
const MODEL_BUDGET = 8 * 1024 * 1024;
const CONFIG_NAME = ".inochi2d.generated.yml";
const PERFORMANCE_SAMPLE_COUNT = 90;
const MINIMUM_RENDER_FPS = 29.5;
const MAX_P95_RENDER_DURATION_MS = 33;

export async function main(argv) {
  const options = parseArguments(argv);
  if (options.help) {
    printHelp();
    return;
  }
  const configPath = resolve(options.config ?? "inochi2d-blog.config.json");
  const config = await loadConfig(configPath);

  if (options.command === "inspect") {
    const context = await createInspectionContext(configPath, config);
    const inspection = inspectModel(context);
    console.log(JSON.stringify(inspection, null, 2));
    return;
  }

  validateOrchestrationConfig(config);
  const context = await createContext(configPath, config);
  let previousGeneratedConfig;
  let generatedConfigWritten = false;
  try {
    const prepared = await prepare(context);
    previousGeneratedConfig = await optionalRead(context.generatedConfigPath);
    await writeGeneratedConfig(context, prepared);
    generatedConfigWritten = true;
    console.log(`Prepared immutable bundle: ${prepared.bundleDirectory}`);

    if (options.command === "prepare") {
      return;
    }

    assertHexoPlugin(context.blogRoot);
    runHexo(context, "clean");
    runHexo(context, "generate");
    await runBrowserGates(context);
    console.log("Generation and browser gates passed.");

    if (options.command === "verify" || options.dryRun) {
      if (options.dryRun) {
        console.log("Dry run complete; Hexo deploy was not executed.");
      }
      return;
    }

    runHexo(context, "deploy");
    console.log("Hexo deploy completed after all fail-closed gates passed.");
  } catch (error) {
    if (generatedConfigWritten) {
      await restoreGeneratedConfig(context.generatedConfigPath, previousGeneratedConfig);
    }
    throw error;
  }
}

function parseArguments(argv) {
  const result = { command: "verify", config: undefined, dryRun: false, help: false };
  const remaining = [...argv];
  if (remaining[0] && !remaining[0].startsWith("-")) {
    result.command = remaining.shift();
  }
  if (!["inspect", "prepare", "verify", "deploy"].includes(result.command)) {
    throw new Error(`unknown command ${JSON.stringify(result.command)}`);
  }
  while (remaining.length > 0) {
    const argument = remaining.shift();
    if (argument === "--config") {
      result.config = remaining.shift();
      if (!result.config) throw new Error("--config requires a path");
    } else if (argument === "--dry-run") {
      result.dryRun = true;
    } else if (argument === "--help" || argument === "-h") {
      result.help = true;
    } else {
      throw new Error(`unknown option ${JSON.stringify(argument)}`);
    }
  }
  return result;
}

async function loadConfig(path) {
  let input;
  try {
    input = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(`cannot read valid JSON config ${path}`, { cause: error });
  }
  if (!isRecord(input) || input.schemaVersion !== 1) {
    throw new Error("config.schemaVersion must be 1");
  }
  return input;
}

function validateOrchestrationConfig(input) {
  for (const key of ["blogRoot", "model", "fallback"]) {
    if (typeof input[key] !== "string" || input[key].trim().length === 0) {
      throw new Error(`config.${key} must be a non-empty path`);
    }
  }
  if (!isRecord(input.publication)) {
    throw new Error("config.publication is required");
  }
  if (input.publication.confirm !== true) {
    throw new Error("publication.confirm must be true");
  }
  if (input.publication.allowRedistribution !== true) {
    throw new Error("publication.allowRedistribution must be true");
  }
  if (
    typeof input.publication.sourceSha256 !== "string" ||
    !/^[a-f0-9]{64}$/iu.test(input.publication.sourceSha256)
  ) {
      throw new Error("publication.sourceSha256 must be the reviewed source SHA-256");
  }
}

async function createInspectionContext(configPath, config) {
  if (typeof config.model !== "string" || config.model.trim().length === 0) {
    throw new Error("config.model must be a non-empty path");
  }
  const configDirectory = dirname(configPath);
  return {
    config,
    configPath,
    configDirectory,
    modelPath: resolveFrom(configDirectory, config.model),
    pipelineBinary: await resolvePipelineBinary(config, configDirectory),
  };
}

async function createContext(configPath, config) {
  const configDirectory = dirname(configPath);
  const blogRoot = await realpath(resolveFrom(configDirectory, config.blogRoot));
  const blogStats = await stat(blogRoot);
  if (!blogStats.isDirectory()) throw new Error("blogRoot is not a directory");
  const stateRoot = resolve(blogRoot, ".inochi2d");
  return {
    config,
    configPath,
    configDirectory,
    blogRoot,
    stateRoot,
    generatedConfigPath: resolve(stateRoot, CONFIG_NAME),
    modelPath: resolveFrom(configDirectory, config.model),
    fallbackPath: resolveFrom(configDirectory, config.fallback),
    pipelineBinary: await resolvePipelineBinary(config, configDirectory),
  };
}

function inspectModel(context) {
  return runJson(context.pipelineBinary, [
    "inspect",
    "--input",
    context.modelPath,
    "--compact",
  ]);
}

function validatePublication(context, inspection) {
  if (!inspection?.compatibility?.supported) {
    throw new Error("model is outside the supported browser compatibility profile");
  }
  const blockers = [
    ...(inspection.compatibility.issues ?? []),
    ...(inspection.publication?.issues ?? []),
  ].filter((issue) => issue?.severity === "error");
  if (blockers.length > 0) {
    throw new Error(
      `model has blocking issues: ${blockers.map((issue) => issue.code).join(", ")}`,
    );
  }
  const expected = context.config.publication.sourceSha256.toLowerCase();
  if (inspection.source?.sha256?.toLowerCase() !== expected) {
    throw new Error(
      `publication source hash mismatch: reviewed ${expected}, actual ${inspection.source?.sha256}`,
    );
  }
  const attributionRequired = (inspection.publication?.issues ?? []).some(
    (issue) => issue.code === "attribution_required",
  );
  if (
    attributionRequired &&
    (typeof context.config.publication.attribution !== "string" ||
      context.config.publication.attribution.trim().length === 0)
  ) {
    throw new Error("model metadata requires a non-empty publication.attribution");
  }
}

async function prepare(context) {
  await Promise.all([access(context.modelPath), access(context.fallbackPath)]);
  const inspection = inspectModel(context);
  validatePublication(context, inspection);

  const stagingRoot = resolve(context.stateRoot, "staging");
  await mkdir(stagingRoot, { recursive: true });
  const stagingDirectory = resolve(
    stagingRoot,
    `bundle-${Date.now()}-${process.pid}`,
  );
  assertInside(context.stateRoot, stagingDirectory);
  let stagingCommitted = false;
  try {
    run(
      context.pipelineBinary,
      [
        "build",
        "--input",
        context.modelPath,
        "--output-dir",
        stagingDirectory,
        "--fallback",
        context.fallbackPath,
        "--compact",
      ],
      undefined,
      "quiet",
    );

    const manifest = JSON.parse(
      await readFile(resolve(stagingDirectory, "manifest.json"), "utf8"),
    );
    validateBuiltManifest(context, inspection, manifest);
    const bundleRoot = resolve(context.stateRoot, "bundles");
    await mkdir(bundleRoot, { recursive: true });
    const bundleDirectory = resolve(
      bundleRoot,
      `${manifest.model.sourceSha256.slice(0, 12)}-${manifest.model.sha256.slice(0, 12)}`,
    );
    assertInside(context.stateRoot, bundleDirectory);
    try {
      await access(bundleDirectory);
      const existing = JSON.parse(
        await readFile(resolve(bundleDirectory, "manifest.json"), "utf8"),
      );
      if (
        existing.model?.sha256 !== manifest.model.sha256 ||
        existing.fallback?.sha256 !== manifest.fallback?.sha256
      ) {
        throw new Error(`existing immutable bundle conflicts with ${bundleDirectory}`);
      }
      await rm(stagingDirectory, { recursive: true });
    } catch (error) {
      if (error?.code === "ENOENT") {
        await rename(stagingDirectory, bundleDirectory);
      } else {
        throw error;
      }
    }
    stagingCommitted = true;
    return { bundleDirectory, manifest };
  } finally {
    if (!stagingCommitted) {
      await rm(stagingDirectory, { recursive: true, force: true }).catch(() => {});
    }
  }
}

function validateBuiltManifest(context, inspection, manifest) {
  if (!manifest?.compatibility?.supported) {
    throw new Error("pipeline generated an incompatible bundle");
  }
  if (manifest.model?.sourceSha256 !== inspection.source.sha256) {
    throw new Error("pipeline manifest source hash changed during preparation");
  }
  if (!Number.isSafeInteger(manifest.model?.bytes) || manifest.model.bytes > MODEL_BUDGET) {
    throw new Error(`prepared model exceeds the ${MODEL_BUDGET}-byte budget`);
  }
  if (!manifest.fallback) {
    throw new Error("pipeline did not emit the required fallback image");
  }
  const blockers = (manifest.publication?.issues ?? []).filter(
    (issue) => issue?.severity === "error",
  );
  if (blockers.length > 0) {
    throw new Error(`publication blocked: ${blockers.map((issue) => issue.code).join(", ")}`);
  }
  if (
    manifest.model.sourceSha256.toLowerCase() !==
    context.config.publication.sourceSha256.toLowerCase()
  ) {
    throw new Error("built bundle no longer matches the publication attestation");
  }
}

async function writeGeneratedConfig(context, prepared) {
  await mkdir(context.stateRoot, { recursive: true });
  const publication = {
    confirm: true,
    allowRedistribution: true,
    sourceSha256: prepared.manifest.model.sourceSha256,
    ...(context.config.publication.attribution
      ? { attribution: context.config.publication.attribution }
      : {}),
  };
  const relativeBundle = relative(context.blogRoot, prepared.bundleDirectory)
    .split(sep)
    .join("/");
  const widget = {
    ...(isRecord(context.config.widget) ? context.config.widget : {}),
    enable: true,
    bundle: relativeBundle,
    publication,
    mobile: {
      ...(isRecord(context.config.widget?.mobile)
        ? context.config.widget.mobile
        : {}),
      show: false,
    },
  };
  const contents = `${JSON.stringify({ inochi2d_widget: widget }, null, 2)}\n`;
  const temporary = `${context.generatedConfigPath}.tmp-${process.pid}`;
  await writeFile(temporary, contents, { flag: "wx" });
  await rename(temporary, context.generatedConfigPath);
}

async function restoreGeneratedConfig(path, previous) {
  if (previous) {
    const temporary = `${path}.rollback-${process.pid}`;
    await writeFile(temporary, previous, { flag: "wx" });
    await rename(temporary, path);
  } else {
    await rm(path, { force: true });
  }
}

function runHexo(context, command) {
  const hexoBin = resolveFromPackage(context.blogRoot, "hexo/bin/hexo");
  const configArgument = `${context.config.hexoConfig ?? "_config.yml"},${relative(
    context.blogRoot,
    context.generatedConfigPath,
  )
    .split(sep)
    .join("/")}`;
  run(process.execPath, [hexoBin, "--config", configArgument, command], context.blogRoot);
}

async function runBrowserGates(context) {
  const playwrightPath = resolveFromPackage(context.blogRoot, "playwright");
  const imported = await import(pathToFileURL(playwrightPath).href);
  const playwright = imported.chromium ? imported : imported.default;
  if (!playwright?.chromium) {
    throw new Error("the blog's playwright package does not export Chromium");
  }
  const port = context.config.previewPort ?? 4192;
  if (!Number.isInteger(port) || port < 1024 || port > 65_535) {
    throw new Error("previewPort must be an integer from 1024 through 65535");
  }
  const publicRoot = resolve(context.blogRoot, "public");
  if (!(await stat(publicRoot)).isDirectory()) {
    throw new Error("Hexo did not generate a public directory");
  }
  const server = createStaticServer(publicRoot);
  const baseUrl = `http://127.0.0.1:${port}${context.config.previewPath ?? "/"}`;
  try {
    await listen(server, port);
    const channels =
      process.platform === "win32"
        ? [
            { label: "Chrome", channel: "chrome" },
            { label: "Edge", channel: "msedge" },
          ]
        : [{ label: "Chromium", channel: undefined }];
    for (const browserTarget of channels) {
      await verifyBrowser(playwright.chromium, browserTarget, baseUrl);
    }
  } catch (error) {
    throw new Error(`browser gate failed: ${error.message}`, { cause: error });
  } finally {
    await closeServer(server);
  }
}

async function verifyBrowser(chromium, target, url) {
  const browser = await chromium.launch({
    headless: true,
    ...(target.channel ? { channel: target.channel } : {}),
  });
  try {
    const desktop = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1.25,
    });
    const page = await desktop.newPage();
    await installPerformanceProbe(page);
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page
      .locator('[data-inochi2d-status="running"]')
      .waitFor({ state: "visible", timeout: 30_000 });
    if ((await page.locator(".inochi2d-widget__canvas").count()) !== 1) {
      throw new Error(`${target.label}: expected one canvas`);
    }
    const performance = await measureFramePerformance(page);
    console.log(
      `${target.label}: ${performance.framesPerSecond.toFixed(2)} FPS, ` +
        `${performance.p95DurationMs.toFixed(2)} ms p95 render duration ` +
        `at DPR 1.25 (${performance.sampleCount} frames).`,
    );
    if (performance.framesPerSecond < MINIMUM_RENDER_FPS) {
      throw new Error(
        `${target.label}: measured ${performance.framesPerSecond.toFixed(2)} FPS; ` +
          `at least ${MINIMUM_RENDER_FPS.toFixed(1)} FPS is required ` +
          `(p95 render duration ${performance.p95DurationMs.toFixed(2)} ms)`,
      );
    }
    if (performance.p95DurationMs > MAX_P95_RENDER_DURATION_MS) {
      throw new Error(
        `${target.label}: p95 render duration was ` +
          `${performance.p95DurationMs.toFixed(2)} ms; no more than ` +
          `${MAX_P95_RENDER_DURATION_MS} ms is allowed`,
      );
    }
    await page.evaluate(() => {
      for (let index = 0; index < 20; index += 1) {
        document.dispatchEvent(new Event("pjax:complete"));
      }
    });
    if ((await page.locator(".inochi2d-widget__canvas").count()) !== 1) {
      throw new Error(`${target.label}: PJAX created duplicate canvases`);
    }
    const widget = page.locator(".inochi2d-widget");
    const canvas = page.locator(".inochi2d-widget__canvas");
    const originalBackground = await widget.evaluate((element) => element.style.background);
    await widget.evaluate((element) => {
      element.style.background = "rgb(1, 2, 3)";
    });
    try {
      const visible = await canvas.screenshot({ animations: "disabled" });
      const originalOpacity = await canvas.evaluate((element) => element.style.opacity);
      let hidden;
      try {
        await canvas.evaluate((element) => {
          element.style.opacity = "0";
        });
        hidden = await canvas.screenshot({ animations: "disabled" });
      } finally {
        await canvas.evaluate((element, opacity) => {
          element.style.opacity = opacity;
        }, originalOpacity);
      }
      const contribution = await compareScreenshots(page, visible, hidden);
      if (
        contribution.pixels === 0 ||
        contribution.changed / contribution.pixels < 0.001 ||
        contribution.meanDelta < 0.25
      ) {
        throw new Error(`${target.label}: canvas makes no visible contribution`);
      }

      const bounds = await widget.boundingBox();
      if (!bounds) throw new Error(`${target.label}: widget has no layout box`);
      const pointerY = bounds.y + bounds.height / 2;
      await page.mouse.move(10, pointerY);
      await page.waitForTimeout(400);
      const leftPose = await canvas.screenshot({ animations: "disabled" });
      await page.mouse.move(1430, pointerY);
      await page.waitForTimeout(400);
      const rightPose = await canvas.screenshot({ animations: "disabled" });
      const pointerChange = await compareScreenshots(page, leftPose, rightPose);
      if (pointerChange.changed === 0) {
        throw new Error(`${target.label}: pointer movement produced no visible pose change`);
      }

      await canvas.click({ position: { x: bounds.width / 2, y: bounds.height / 2 } });
      await page.waitForTimeout(140);
      const clickPose = await canvas.screenshot({ animations: "disabled" });
      const clickChange = await compareScreenshots(page, rightPose, clickPose);
      if (clickChange.changed === 0) {
        throw new Error(`${target.label}: click produced no visible pose change`);
      }

      const dragStart = await widget.boundingBox();
      if (!dragStart) throw new Error(`${target.label}: widget disappeared before drag`);
      await page.mouse.move(
        dragStart.x + dragStart.width / 2,
        dragStart.y + dragStart.height / 2,
      );
      await page.mouse.down();
      await page.mouse.move(dragStart.x - 180, dragStart.y - 100, { steps: 5 });
      await page.mouse.up();
      const dragged = await widget.boundingBox();
      if (
        !dragged ||
        dragged.x > dragStart.x - 150 ||
        dragged.y > dragStart.y - 70
      ) {
        throw new Error(`${target.label}: whole-page drag did not follow the pointer`);
      }
      await canvas.dblclick();
      await page.waitForTimeout(100);
      const reset = await widget.boundingBox();
      if (
        !reset ||
        Math.abs(reset.x - dragStart.x) > 2 ||
        Math.abs(reset.y - dragStart.y) > 2
      ) {
        throw new Error(`${target.label}: double-click did not reset the widget position`);
      }
    } finally {
      await widget.evaluate((element, background) => {
        element.style.background = background;
      }, originalBackground);
    }
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    if (overflow > 1) throw new Error(`${target.label}: page has horizontal overflow`);
    if (pageErrors.length > 0) {
      throw new Error(`${target.label}: page error: ${pageErrors.join("; ")}`);
    }
    await desktop.close();

    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const mobilePage = await mobile.newPage();
    const requests = [];
    mobilePage.on("request", (request) => requests.push(request.url()));
    await mobilePage.goto(url, { waitUntil: "domcontentloaded" });
    if ((await mobilePage.locator("[data-inochi2d-widget-host]").count()) !== 0) {
      throw new Error(`${target.label}: mobile widget host was not removed`);
    }
    const forbidden = requests.filter(
      (requestUrl) =>
        requestUrl.endsWith(".wasm") ||
        requestUrl.endsWith(".inp") ||
        /inochi2d-widget\/.*\.js(?:\?|$)/u.test(requestUrl),
    );
    if (forbidden.length > 0) {
      throw new Error(`${target.label}: mobile fetched runtime/model assets`);
    }
    await mobile.close();
  } finally {
    await browser.close();
  }
}

async function installPerformanceProbe(page) {
  await page.addInitScript(() => {
    const probe = {
      contexts: new Set(),
      drawCalls: 0,
      samples: [],
    };
    Object.defineProperty(window, "__inochi2dPerformanceProbe", {
      value: probe,
      configurable: false,
      enumerable: false,
      writable: false,
    });

    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function getContext(type, ...options) {
      const context = Reflect.apply(originalGetContext, this, [type, ...options]);
      if (
        type === "webgl2" &&
        context &&
        this.classList.contains("inochi2d-widget__canvas")
      ) {
        probe.contexts.add(context);
      }
      return context;
    };

    const wrapDrawCall = (name) => {
      const original = WebGL2RenderingContext.prototype[name];
      WebGL2RenderingContext.prototype[name] = function drawCall(...arguments_) {
        if (probe.contexts.has(this)) {
          probe.drawCalls += 1;
        }
        return Reflect.apply(original, this, arguments_);
      };
    };
    wrapDrawCall("drawArrays");
    wrapDrawCall("drawElements");

    const originalRequestAnimationFrame = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) =>
      originalRequestAnimationFrame((timestamp) => {
        const drawCallsBefore = probe.drawCalls;
        const startedAt = performance.now();
        try {
          return callback(timestamp);
        } finally {
          if (probe.drawCalls > drawCallsBefore) {
            for (const context of probe.contexts) {
              context.finish();
            }
            probe.samples.push({
              timestamp,
              durationMs: performance.now() - startedAt,
            });
            if (probe.samples.length > 240) {
              probe.samples.shift();
            }
          }
        }
      });
  });
}

async function measureFramePerformance(page) {
  await page.evaluate(() => {
    const probe = window.__inochi2dPerformanceProbe;
    if (!probe) {
      throw new Error("Inochi2D performance probe was not installed");
    }
    probe.samples.length = 0;
  });
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const count = await page.evaluate(
      () => window.__inochi2dPerformanceProbe?.samples.length ?? 0,
    );
    if (count >= PERFORMANCE_SAMPLE_COUNT) {
      break;
    }
    await page.waitForTimeout(100);
  }
  const samples = await page.evaluate((sampleCount) => {
    const values = window.__inochi2dPerformanceProbe?.samples ?? [];
    return values.slice(-sampleCount);
  }, PERFORMANCE_SAMPLE_COUNT);
  if (samples.length < PERFORMANCE_SAMPLE_COUNT) {
    throw new Error(
      `collected only ${samples.length}/${PERFORMANCE_SAMPLE_COUNT} rendered frames`,
    );
  }
  return summarizeFramePerformance(samples);
}

function summarizeFramePerformance(samples) {
  if (!Array.isArray(samples) || samples.length < 2) {
    throw new Error("at least two rendered-frame samples are required");
  }
  let previousTimestamp = -Infinity;
  const durations = [];
  for (const sample of samples) {
    if (
      !isRecord(sample) ||
      !Number.isFinite(sample.timestamp) ||
      !Number.isFinite(sample.durationMs) ||
      sample.timestamp <= previousTimestamp ||
      sample.durationMs < 0
    ) {
      throw new Error("rendered-frame samples are malformed or unordered");
    }
    previousTimestamp = sample.timestamp;
    durations.push(sample.durationMs);
  }
  durations.sort((left, right) => left - right);
  const elapsedMs = samples.at(-1).timestamp - samples[0].timestamp;
  if (elapsedMs <= 0) {
    throw new Error("rendered-frame sample window has no elapsed time");
  }
  const percentileIndex = Math.max(0, Math.ceil(durations.length * 0.95) - 1);
  return {
    framesPerSecond: ((samples.length - 1) * 1_000) / elapsedMs,
    p95DurationMs: durations[percentileIndex],
    sampleCount: samples.length,
  };
}

async function compareScreenshots(page, first, second) {
  return page.evaluate(
    async ({ firstPng, secondPng }) => {
      const decode = async (png) => {
        const binary = atob(png);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) {
          bytes[index] = binary.charCodeAt(index);
        }
        const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
        const scratch = document.createElement("canvas");
        scratch.width = bitmap.width;
        scratch.height = bitmap.height;
        const context = scratch.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("2D canvas is unavailable for visual verification");
        context.drawImage(bitmap, 0, 0);
        bitmap.close();
        return {
          width: scratch.width,
          height: scratch.height,
          pixels: context.getImageData(0, 0, scratch.width, scratch.height).data,
        };
      };
      const [firstImage, secondImage] = await Promise.all([
        decode(firstPng),
        decode(secondPng),
      ]);
      if (
        firstImage.width !== secondImage.width ||
        firstImage.height !== secondImage.height
      ) {
        throw new Error("visual verification screenshots have different dimensions");
      }
      let changed = 0;
      let totalDelta = 0;
      for (let index = 0; index < firstImage.pixels.length; index += 4) {
        const delta =
          Math.abs(firstImage.pixels[index] - secondImage.pixels[index]) +
          Math.abs(firstImage.pixels[index + 1] - secondImage.pixels[index + 1]) +
          Math.abs(firstImage.pixels[index + 2] - secondImage.pixels[index + 2]) +
          Math.abs(firstImage.pixels[index + 3] - secondImage.pixels[index + 3]);
        totalDelta += delta;
        if (delta > 16) changed += 1;
      }
      const pixels = firstImage.width * firstImage.height;
      return { changed, pixels, meanDelta: pixels > 0 ? totalDelta / pixels : 0 };
    },
    {
      firstPng: first.toString("base64"),
      secondPng: second.toString("base64"),
    },
  );
}

function createStaticServer(publicRoot) {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      let requestPath = decodeURIComponent(url.pathname).replace(/^\/+/u, "");
      if (requestPath.length === 0 || requestPath.endsWith("/")) {
        requestPath = `${requestPath}index.html`;
      }
      let filePath = resolve(publicRoot, requestPath);
      assertInside(publicRoot, filePath);
      const fileStats = await stat(filePath);
      if (fileStats.isDirectory()) {
        filePath = resolve(filePath, "index.html");
        assertInside(publicRoot, filePath);
      }
      const body = await readFile(filePath);
      response.writeHead(200, {
        "Content-Type": contentType(filePath),
        "Content-Length": body.byteLength,
        "Cache-Control": "no-store",
      });
      response.end(request.method === "HEAD" ? undefined : body);
    } catch (error) {
      const status = error?.code === "ENOENT" ? 404 : 400;
      const body = status === 404 ? "Not found" : "Bad request";
      response.writeHead(status, {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Length": Buffer.byteLength(body),
        "Cache-Control": "no-store",
      });
      response.end(request.method === "HEAD" ? undefined : body);
    }
  });
}

function contentType(path) {
  return (
    {
      ".css": "text/css; charset=utf-8",
      ".html": "text/html; charset=utf-8",
      ".inp": "application/octet-stream",
      ".inx": "application/octet-stream",
      ".js": "text/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".png": "image/png",
      ".svg": "image/svg+xml",
      ".wasm": "application/wasm",
    }[extname(path).toLowerCase()] ?? "application/octet-stream"
  );
}

function listen(server, port) {
  return new Promise((resolvePromise, reject) => {
    const onError = (error) => reject(error);
    server.once("error", onError);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", onError);
      resolvePromise();
    });
  });
}

function closeServer(server) {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolvePromise, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolvePromise();
    });
  });
}

async function resolvePipelineBinary(config, configDirectory) {
  if (typeof config.pipelineBinary === "string" && config.pipelineBinary.trim()) {
    const configured = resolveFrom(configDirectory, config.pipelineBinary);
    await access(configured);
    return configured;
  }
  if (process.env.INOCHI2D_PIPELINE_BIN) {
    const configured = resolve(process.env.INOCHI2D_PIPELINE_BIN);
    await access(configured);
    return configured;
  }
  const executable = process.platform === "win32" ? "inochi2d-pipeline.exe" : "inochi2d-pipeline";
  const packageRoot = dirname(import.meta.dirname);
  const packaged = resolve(
    packageRoot,
    "vendor",
    `${process.platform}-${process.arch}`,
    executable,
  );
  const workspace = resolve(import.meta.dirname, "../../../target/release", executable);
  try {
    await access(packaged);
    await verifyPackagedPipeline(packageRoot, packaged, executable);
    return packaged;
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
  try {
    await access(workspace);
    return workspace;
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
  throw new Error(
    `native pipeline binary for ${process.platform}-${process.arch} is not installed`,
  );
}

async function verifyPackagedPipeline(packageRoot, binaryPath, executable) {
  const manifestPath = resolve(packageRoot, "vendor", "manifest.json");
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    throw new Error("packaged native pipeline manifest is missing or invalid", {
      cause: error,
    });
  }
  const target = `${process.platform}-${process.arch}`;
  const file = `${target}/${executable}`;
  const artifact = manifest?.artifacts?.find(
    (candidate) => candidate?.target === target && candidate?.file === file,
  );
  if (
    manifest?.schemaVersion !== 1 ||
    !artifact ||
    !Number.isSafeInteger(artifact.bytes) ||
    artifact.bytes <= 0 ||
    typeof artifact.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/u.test(artifact.sha256)
  ) {
    throw new Error(`packaged native pipeline manifest has no valid ${target} artifact`);
  }
  const bytes = await readFile(binaryPath);
  const actualHash = createHash("sha256").update(bytes).digest("hex");
  if (bytes.byteLength !== artifact.bytes || actualHash !== artifact.sha256) {
    throw new Error(`packaged native pipeline integrity check failed for ${target}`);
  }
}

function assertHexoPlugin(blogRoot) {
  resolveFromPackage(blogRoot, "hexo-inox2d-widget");
}

function resolveFromPackage(root, request) {
  try {
    return require.resolve(request, { paths: [root] });
  } catch (error) {
    throw new Error(`required blog package ${request} is not installed in ${root}`, {
      cause: error,
    });
  }
}

function runJson(command, args, cwd) {
  const output = run(command, args, cwd, "capture");
  try {
    return JSON.parse(output);
  } catch (error) {
    throw new Error(`${basename(command)} returned invalid JSON`, { cause: error });
  }
}

function run(command, args, cwd, output = "inherit") {
  const captured = output === "capture" || output === "quiet";
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: process.env,
    maxBuffer: MAX_COMMAND_OUTPUT,
    shell: false,
    stdio:
      output === "capture"
        ? ["ignore", "pipe", "pipe"]
        : output === "quiet"
          ? ["ignore", "ignore", "pipe"]
          : "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${basename(command)} exited with status ${result.status}${
        captured && result.stderr ? `: ${result.stderr.trim()}` : ""
      }`,
    );
  }
  return output === "capture" ? result.stdout : "";
}

function resolveFrom(base, path) {
  return isAbsolute(path) ? resolve(path) : resolve(base, path);
}

function assertInside(parent, child) {
  const path = relative(resolve(parent), resolve(child));
  if (!path || path.startsWith("..") || isAbsolute(path)) {
    throw new Error(`unsafe generated path outside ${parent}: ${child}`);
  }
}

async function optionalRead(path) {
  try {
    return await readFile(path);
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

function isRecord(input) {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function printHelp() {
  console.log(`Usage: inochi2d-blog <inspect|prepare|verify|deploy> [options]

Options:
  --config <path>  JSON configuration (default: inochi2d-blog.config.json)
  --dry-run        Run preparation, Hexo generation, and browser gates without deploy
  --help           Show this help

The deploy command is fail-closed: authorization, hashes, preparation, Hexo
generation, and desktop/mobile browser gates must all pass before Hexo deploy.`);
}

export const testing = Object.freeze({
  parseArguments,
  validateOrchestrationConfig,
  validatePublication,
  validateBuiltManifest,
  assertInside,
  createStaticServer,
  listen,
  closeServer,
  verifyBrowser,
  summarizeFramePerformance,
});
