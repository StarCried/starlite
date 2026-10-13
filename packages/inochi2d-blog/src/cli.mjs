import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import {
  access,
  mkdir,
  lstat,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { hostname } from "node:os";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  posix,
  relative,
  resolve,
  sep,
} from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const MAX_COMMAND_OUTPUT = 16 * 1024 * 1024;
const MODEL_BUDGET = 8 * 1024 * 1024;
const FALLBACK_BUDGET = 8 * 1024 * 1024;
const CONFIG_NAME = ".inochi2d.generated.yml";
const PERFORMANCE_SAMPLE_COUNT = 90;
const MINIMUM_RENDER_FPS = 29.5;
const MAX_P95_RENDER_DURATION_MS = 33;
const LOCAL_PREVIEW_ENV = "STARLITE_LOCAL_PREVIEW_TOKEN";
const PREVIEW_LOCK_NAME = "run.json";

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

  if (options.command === "preview") {
    validatePreviewConfig(config);
    const context = await createPreviewContext(configPath, config);
    try {
      const prepared = await preparePreview(context);
      await writePreviewConfig(context, prepared);
      console.log(`Prepared temporary local bundle: ${prepared.bundleDirectory}`);
      reportPreviewPublicationWarnings(prepared.inspection);
      assertHexoPlugin(context.blogRoot);
      runHexo(context, "generate", {
        outputDirectory: context.hexoOutputRoot,
        environment: { [LOCAL_PREVIEW_ENV]: context.localPreviewToken },
      });
      await runBrowserGates(context);
      console.log("Generation and browser gates passed.");
      await servePreview(context);
    } finally {
      await rm(context.runRoot, { recursive: true, force: true });
    }
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
  if (!["inspect", "preview", "prepare", "verify", "deploy"].includes(result.command)) {
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
  if (result.command === "preview" && result.dryRun) {
    throw new Error("--dry-run is not valid for the local-only preview command");
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
  validateBaseConfig(input);
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

function validatePreviewConfig(input) {
  validateBaseConfig(input);
}

function validateBaseConfig(input) {
  for (const key of ["blogRoot", "model", "fallback"]) {
    if (typeof input[key] !== "string" || input[key].trim().length === 0) {
      throw new Error(`config.${key} must be a non-empty path`);
    }
  }
  validatePipelineSelection(input);
  requiredAnimationNames(input);
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
    pipelineRunner: await resolvePipelineRunner(config, configDirectory),
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
    pipelineRunner: await resolvePipelineRunner(config, configDirectory),
  };
}

async function createPreviewContext(configPath, config) {
  const base = await createContext(configPath, config);
  const previewRoot = resolve(base.blogRoot, ".inochi2d", "preview");
  await mkdir(previewRoot, { recursive: true });
  await cleanupStalePreviewRuns(previewRoot);
  const runRoot = await mkdtemp(resolve(previewRoot, "run-"));
  assertInside(previewRoot, runRoot);
  const context = {
    ...base,
    stateRoot: runRoot,
    previewRoot,
    runRoot,
    bundleDirectory: resolve(runRoot, "bundle"),
    generatedConfigPath: resolve(runRoot, "preview.generated.yml"),
    hexoOutputRoot: resolve(runRoot, "hexo-state"),
    publicRoot: resolve(runRoot, "public"),
    localPreviewToken: randomBytes(32).toString("hex"),
  };
  try {
    for (const path of [
      context.bundleDirectory,
      context.generatedConfigPath,
      context.hexoOutputRoot,
      context.publicRoot,
    ]) {
      assertInside(runRoot, path);
    }
    await writeFile(
      resolve(runRoot, PREVIEW_LOCK_NAME),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          pid: process.pid,
          platform: process.platform,
          hostname: hostname(),
          startedAt: new Date().toISOString(),
          configPath,
        },
        null,
        2,
      )}\n`,
      { flag: "wx" },
    );
    return context;
  } catch (error) {
    await rm(runRoot, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

async function cleanupStalePreviewRuns(previewRoot) {
  const entries = await readdir(previewRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith("run-")) {
      continue;
    }
    const directory = resolve(previewRoot, entry.name);
    assertInside(previewRoot, directory);
    let lock;
    try {
      lock = JSON.parse(
        await readFile(resolve(directory, PREVIEW_LOCK_NAME), "utf8"),
      );
    } catch {
      const directoryStats = await stat(directory);
      if (Date.now() - directoryStats.mtimeMs > 5 * 60_000) {
        await rm(directory, { recursive: true, force: true });
      }
      continue;
    }
    if (
      lock?.schemaVersion !== 1 ||
      lock.platform !== process.platform ||
      lock.hostname !== hostname() ||
      !Number.isSafeInteger(lock.pid) ||
      lock.pid <= 0
    ) {
      continue;
    }
    if (!isProcessAlive(lock.pid)) {
      await rm(directory, { recursive: true, force: true });
    }
  }
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function inspectModel(context) {
  return runPipelineJson(context.pipelineRunner, [
    "inspect",
    "--input",
    pipelinePath(context.modelPath),
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
  requireAnimations(
    inspection.animations,
    requiredAnimationNames(context.config),
    "source model",
  );
  validateAmbientParameterTargets(
    inspection.parameters,
    inspection.animations,
    configuredAmbientParameters(context.config),
    "source model",
    context.config.widget?.ambient?.animations ?? [],
  );
}

function validatePreviewInspection(context, inspection) {
  if (!inspection?.compatibility?.supported) {
    throw new Error("model is outside the supported browser compatibility profile");
  }
  const blockers = (inspection.compatibility.issues ?? []).filter(
    (issue) => issue?.severity === "error",
  );
  if (blockers.length > 0) {
    throw new Error(
      `model has blocking compatibility issues: ${blockers
        .map((issue) => issue.code)
        .join(", ")}`,
    );
  }
  requireAnimations(
    inspection.animations,
    requiredAnimationNames(context.config),
    "source model",
  );
  validateAmbientParameterTargets(
    inspection.parameters,
    inspection.animations,
    configuredAmbientParameters(context.config),
    "source model",
    context.config.widget?.ambient?.animations ?? [],
  );
}

function reportPreviewPublicationWarnings(inspection) {
  const issues = inspection.publication?.issues ?? [];
  console.warn(
    "LOCAL PREVIEW ONLY: publication and redistribution attestations were not evaluated. This command cannot deploy.",
  );
  if (issues.length > 0) {
    console.warn(
      `Publication metadata warnings (ignored only for local preview): ${issues
        .map((issue) => issue?.code ?? "unknown")
        .join(", ")}`,
    );
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
  let newlyCreatedBundle;
  try {
    runPipeline(
      context.pipelineRunner,
      [
        "build",
        "--input",
        pipelinePath(context.modelPath),
        "--output-dir",
        pipelinePath(stagingDirectory),
        "--fallback",
        pipelinePath(context.fallbackPath),
        "--compact",
      ],
      undefined,
      "quiet",
    );

    const manifestContents = await readFile(
      resolve(stagingDirectory, "manifest.json"),
    );
    const manifest = JSON.parse(manifestContents.toString("utf8"));
    validateBuiltManifest(context, inspection, manifest);
    const bundleRoot = resolve(context.stateRoot, "bundles");
    await mkdir(bundleRoot, { recursive: true });
    const bundleDirectory = resolve(
      bundleRoot,
      immutableBundleName(manifest, manifestContents),
    );
    assertInside(context.stateRoot, bundleDirectory);
    try {
      await access(bundleDirectory);
      const existingManifestContents = await readFile(
        resolve(bundleDirectory, "manifest.json"),
      );
      assertManifestContentsEqual(
        existingManifestContents,
        manifestContents,
        bundleDirectory,
      );
      await rm(stagingDirectory, { recursive: true });
    } catch (error) {
      if (error?.code === "ENOENT") {
        await rename(stagingDirectory, bundleDirectory);
        newlyCreatedBundle = bundleDirectory;
      } else {
        throw error;
      }
    }
    await verifyBundleArtifacts(bundleDirectory, manifest);
    stagingCommitted = true;
    return { bundleDirectory, manifest };
  } finally {
    if (!stagingCommitted) {
      await rm(stagingDirectory, { recursive: true, force: true }).catch(() => {});
      if (newlyCreatedBundle) {
        await rm(newlyCreatedBundle, { recursive: true, force: true }).catch(
          () => {},
        );
      }
    }
  }
}

async function preparePreview(context) {
  await Promise.all([access(context.modelPath), access(context.fallbackPath)]);
  const inspection = inspectModel(context);
  validatePreviewInspection(context, inspection);

  const stagingDirectory = resolve(context.runRoot, "bundle-staging");
  assertInside(context.runRoot, stagingDirectory);
  let committed = false;
  try {
    runPipeline(
      context.pipelineRunner,
      [
        "build",
        "--input",
        pipelinePath(context.modelPath),
        "--output-dir",
        pipelinePath(stagingDirectory),
        "--fallback",
        pipelinePath(context.fallbackPath),
        "--compact",
      ],
      undefined,
      "quiet",
    );
    const manifestContents = await readFile(
      resolve(stagingDirectory, "manifest.json"),
    );
    const manifest = JSON.parse(manifestContents.toString("utf8"));
    validatePreviewBuiltManifest(context, inspection, manifest);
    await rename(stagingDirectory, context.bundleDirectory);
    committed = true;
    return {
      bundleDirectory: context.bundleDirectory,
      inspection,
      manifest,
    };
  } finally {
    if (!committed) {
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
  requireAnimations(
    manifest.animations,
    requiredAnimationNames(context.config),
    "built bundle",
  );
  validateAmbientParameterTargets(
    manifest.parameters,
    manifest.animations,
    configuredAmbientParameters(context.config),
    "built bundle",
    context.config.widget?.ambient?.animations ?? [],
  );
}

function validatePreviewBuiltManifest(context, inspection, manifest) {
  if (!manifest?.compatibility?.supported) {
    throw new Error("pipeline generated an incompatible bundle");
  }
  if (manifest.model?.sourceSha256 !== inspection.source?.sha256) {
    throw new Error("pipeline manifest source hash changed during preparation");
  }
  if (
    !Number.isSafeInteger(manifest.model?.bytes) ||
    manifest.model.bytes > MODEL_BUDGET
  ) {
    throw new Error(`prepared model exceeds the ${MODEL_BUDGET}-byte budget`);
  }
  if (!manifest.fallback) {
    throw new Error("pipeline did not emit the required fallback image");
  }
  requireAnimations(
    manifest.animations,
    requiredAnimationNames(context.config),
    "built bundle",
  );
  validateAmbientParameterTargets(
    manifest.parameters,
    manifest.animations,
    configuredAmbientParameters(context.config),
    "built bundle",
    context.config.widget?.ambient?.animations ?? [],
  );
}

function immutableBundleName(manifest, manifestContents) {
  if (
    !/^[a-f0-9]{64}$/iu.test(manifest?.model?.sourceSha256 ?? "") ||
    !/^[a-f0-9]{64}$/iu.test(manifest?.model?.sha256 ?? "")
  ) {
    throw new Error("pipeline manifest has invalid model identities");
  }
  const manifestSha256 = createHash("sha256")
    .update(manifestContents)
    .digest("hex");
  return [
    manifest.model.sourceSha256.slice(0, 12),
    manifest.model.sha256.slice(0, 12),
    manifestSha256.slice(0, 12),
  ].join("-");
}

function assertManifestContentsEqual(existing, expected, bundleDirectory) {
  if (!Buffer.from(existing).equals(Buffer.from(expected))) {
    throw new Error(`existing immutable bundle conflicts with ${bundleDirectory}`);
  }
}

async function verifyBundleArtifacts(bundleDirectory, manifest) {
  await Promise.all([
    verifyBundleArtifact(
      bundleDirectory,
      manifest.model,
      "model",
      MODEL_BUDGET,
      /^model\.([a-f0-9]{12})\.inp$/u,
    ),
    verifyBundleArtifact(
      bundleDirectory,
      manifest.fallback,
      "fallback",
      FALLBACK_BUDGET,
      /^fallback\.([a-f0-9]{12})\.png$/u,
    ),
  ]);
}

async function verifyBundleArtifact(
  bundleDirectory,
  artifact,
  label,
  maximumBytes,
  filePattern,
) {
  const prefix =
    typeof artifact?.file === "string"
      ? filePattern.exec(artifact.file)?.[1]
      : undefined;
  if (
    !prefix ||
    typeof artifact.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/u.test(artifact.sha256) ||
    prefix !== artifact.sha256.slice(0, 12) ||
    !Number.isSafeInteger(artifact.bytes) ||
    artifact.bytes <= 0 ||
    artifact.bytes > maximumBytes
  ) {
    throw new Error(`pipeline emitted an invalid ${label} artifact record`);
  }
  const artifactPath = resolve(bundleDirectory, artifact.file);
  assertInside(bundleDirectory, artifactPath);
  const metadata = await lstat(artifactPath);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`${label} artifact must be a regular non-symlink file`);
  }
  if (metadata.size !== artifact.bytes) {
    throw new Error(`${label} artifact size does not match its manifest`);
  }
  const contents = await readFile(artifactPath);
  if (createHash("sha256").update(contents).digest("hex") !== artifact.sha256) {
    throw new Error(`${label} artifact SHA-256 does not match its manifest`);
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
  const clickAnimation = requiredClickAnimation(context.config);
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
    interactions: {
      ...(isRecord(context.config.widget?.interactions)
        ? context.config.widget.interactions
        : {}),
      click: clickAnimation ? { animation: clickAnimation } : false,
    },
  };
  const contents = `${JSON.stringify({ starlite: widget }, null, 2)}\n`;
  const temporary = `${context.generatedConfigPath}.tmp-${process.pid}`;
  await writeFile(temporary, contents, { flag: "wx" });
  await rename(temporary, context.generatedConfigPath);
}

async function writePreviewConfig(context, prepared) {
  await mkdir(context.stateRoot, { recursive: true });
  const relativeBundle = relative(context.blogRoot, prepared.bundleDirectory)
    .split(sep)
    .join("/");
  const relativePublic = relative(context.blogRoot, context.publicRoot)
    .split(sep)
    .join("/");
  const clickAnimation = requiredClickAnimation(context.config);
  const suppliedWidget = isRecord(context.config.widget)
    ? context.config.widget
    : {};
  const {
    bundle: _bundle,
    enable: _enable,
    fallback: _fallback,
    localPreview: _localPreview,
    model: _model,
    publication: _publication,
    ...userWidget
  } = suppliedWidget;
  const widget = {
    ...userWidget,
    enable: true,
    bundle: relativeBundle,
    localPreview: { token: context.localPreviewToken },
    mobile: {
      ...(isRecord(context.config.widget?.mobile)
        ? context.config.widget.mobile
        : {}),
      show: false,
    },
    interactions: {
      ...(isRecord(context.config.widget?.interactions)
        ? context.config.widget.interactions
        : {}),
      click: clickAnimation ? { animation: clickAnimation } : false,
    },
  };
  const contents = `${JSON.stringify(
    {
      public_dir: relativePublic,
      starlite: widget,
    },
    null,
    2,
  )}\n`;
  await writeFile(context.generatedConfigPath, contents, { flag: "wx" });
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

function runHexo(context, command, options = {}) {
  const hexoBin = resolveFromPackage(context.blogRoot, "hexo/bin/hexo");
  const configArgument = `${context.config.hexoConfig ?? "_config.yml"},${relative(
    context.blogRoot,
    context.generatedConfigPath,
  )
    .split(sep)
    .join("/")}`;
  const arguments_ = [hexoBin, "--config", configArgument];
  if (options.outputDirectory) {
    arguments_.push("--output", options.outputDirectory);
  }
  arguments_.push(command);
  run(
    process.execPath,
    arguments_,
    context.blogRoot,
    "inherit",
    options.environment,
  );
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
  const publicRoot = context.publicRoot ?? resolve(context.blogRoot, "public");
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

async function servePreview(context) {
  const port = context.config.previewPort ?? 4192;
  if (!Number.isInteger(port) || port < 1024 || port > 65_535) {
    throw new Error("previewPort must be an integer from 1024 through 65535");
  }
  const server = createStaticServer(context.publicRoot);
  const url = `http://127.0.0.1:${port}${context.config.previewPath ?? "/"}`;
  try {
    await listen(server, port);
    console.log(`Local preview ready: ${url}`);
    console.log(
      "This output is temporary, local-only, and cannot deploy. Press Ctrl+C to stop and remove it.",
    );
    await waitForShutdownSignal();
  } finally {
    await closeServer(server);
  }
}

function waitForShutdownSignal() {
  return new Promise((resolvePromise) => {
    const finish = () => {
      process.off("SIGINT", finish);
      process.off("SIGTERM", finish);
      resolvePromise();
    };
    process.once("SIGINT", finish);
    process.once("SIGTERM", finish);
  });
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

      const clickBounds = await canvas.boundingBox();
      if (!clickBounds) throw new Error(`${target.label}: canvas disappeared before click`);
      const clickX = clickBounds.x + clickBounds.width / 2;
      const clickY = clickBounds.y + clickBounds.height / 2;
      await page.mouse.move(clickX, clickY);
      await page.waitForTimeout(400);
      const clickBaseline = await canvas.screenshot({ animations: "disabled" });
      await page.mouse.down();
      await page.mouse.up();
      await page.waitForTimeout(300);
      const clickPose = await canvas.screenshot({ animations: "disabled" });
      const clickChange = await compareScreenshots(page, clickBaseline, clickPose);
      if (clickChange.changed === 0) {
        throw new Error(`${target.label}: click produced no visible pose change`);
      }
      const stationaryStyle = await widget.evaluate((element) => ({
        left: element.style.left,
        top: element.style.top,
      }));
      if (stationaryStyle.left || stationaryStyle.top) {
        throw new Error(`${target.label}: stationary click detached the widget anchor`);
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
    if ((await mobilePage.locator("[data-starlite-widget-host]").count()) !== 0) {
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

    // Exercise the persistent PJAX listener across responsive transitions.
    // This catches detached controllers and stale async mounts that an
    // initial-load-only mobile check cannot expose.
    await mobilePage.setViewportSize({ width: 1_440, height: 900 });
    await mobilePage.evaluate(() => {
      document.dispatchEvent(new Event("pjax:complete"));
    });
    await mobilePage
      .locator('[data-inochi2d-status="running"]')
      .waitFor({ state: "visible", timeout: 30_000 });
    await mobilePage.setViewportSize({ width: 390, height: 844 });
    await mobilePage.evaluate(() => {
      document.dispatchEvent(new Event("pjax:complete"));
    });
    if ((await mobilePage.locator("[data-starlite-widget-host]").count()) !== 0) {
      throw new Error(`${target.label}: PJAX did not remove the widget after entering mobile`);
    }
    await mobilePage.setViewportSize({ width: 1_440, height: 900 });
    await mobilePage.evaluate(() => {
      document.dispatchEvent(new Event("pjax:complete"));
    });
    await mobilePage
      .locator('[data-inochi2d-status="running"]')
      .waitFor({ state: "visible", timeout: 30_000 });
    if ((await mobilePage.locator(".inochi2d-widget__canvas").count()) !== 1) {
      throw new Error(`${target.label}: responsive PJAX remount created duplicate canvases`);
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
      const canonicalRoot = await realpath(publicRoot);
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      let requestPath = decodeURIComponent(url.pathname).replace(/^\/+/u, "");
      if (requestPath.length === 0 || requestPath.endsWith("/")) {
        requestPath = `${requestPath}index.html`;
      }
      let filePath = resolve(publicRoot, requestPath);
      assertInside(publicRoot, filePath);
      filePath = await realpath(filePath);
      assertInside(canonicalRoot, filePath);
      const fileStats = await stat(filePath);
      if (fileStats.isDirectory()) {
        filePath = resolve(filePath, "index.html");
        filePath = await realpath(filePath);
        assertInside(canonicalRoot, filePath);
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

function validatePipelineSelection(config) {
  if (config.pipeline === undefined) return;
  if (config.pipelineBinary !== undefined) {
    throw new Error("config.pipeline and config.pipelineBinary cannot be combined");
  }
  if (!isRecord(config.pipeline)) {
    throw new Error("config.pipeline must be an object");
  }
  if (config.pipeline.backend !== "wsl") {
    throw new Error('config.pipeline.backend must be exactly "wsl"');
  }
  validateWslDistribution(config.pipeline.distribution);
  validateWslBinary(config.pipeline.binary);
}

function validateWslDistribution(distribution) {
  if (
    typeof distribution !== "string" ||
    distribution.length === 0 ||
    distribution.length > 128 ||
    distribution !== distribution.trim() ||
    /[\u0000-\u001f\u007f]/u.test(distribution)
  ) {
    throw new Error(
      "config.pipeline.distribution must be a non-empty WSL distribution name without control characters",
    );
  }
  return distribution;
}

function validateWslBinary(binary) {
  if (
    typeof binary !== "string" ||
    binary.length === 0 ||
    binary !== binary.trim() ||
    binary.includes("\\") ||
    /[\u0000-\u001f\u007f]/u.test(binary) ||
    !posix.isAbsolute(binary) ||
    posix.normalize(binary) !== binary ||
    binary === "/"
  ) {
    throw new Error(
      "config.pipeline.binary must be a normalized absolute WSL path without control characters",
    );
  }
  return binary;
}

async function resolvePipelineRunner(config, configDirectory) {
  validatePipelineSelection(config);
  if (config.pipeline !== undefined) {
    if (process.platform !== "win32") {
      throw new Error(
        "config.pipeline.backend wsl is supported only when inochi2d-blog runs on Windows",
      );
    }
    const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
    if (!systemRoot) {
      throw new Error("cannot resolve wsl.exe because SystemRoot is unavailable");
    }
    const command = resolve(systemRoot, "System32", "wsl.exe");
    await access(command);
    return {
      backend: "wsl",
      command,
      distribution: config.pipeline.distribution,
      binary: config.pipeline.binary,
      translatedPaths: new Map(),
    };
  }
  return {
    backend: "native",
    command: await resolvePipelineBinary(config, configDirectory),
  };
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
  resolveFromPackage(blogRoot, "hexo-starlite");
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

const PIPELINE_PATH = Symbol("inochi2dPipelinePath");

function pipelinePath(value) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("pipeline path arguments must be non-empty strings");
  }
  return Object.freeze({ [PIPELINE_PATH]: true, value });
}

function isPipelinePath(value) {
  return isRecord(value) && value[PIPELINE_PATH] === true;
}

function validateTranslatedWslPath(output) {
  if (typeof output !== "string" || output.length === 0) {
    throw new Error("wslpath returned an empty path");
  }
  const value = output.replace(/\r?\n$/u, "");
  if (
    value.length === 0 ||
    /[\r\n\u0000]/u.test(value) ||
    value.includes("\\") ||
    !posix.isAbsolute(value) ||
    posix.normalize(value) !== value
  ) {
    throw new Error(`wslpath returned an unsafe path: ${JSON.stringify(output)}`);
  }
  return value;
}

function translateWslPath(runner, hostPath) {
  if (
    typeof hostPath !== "string" ||
    !isAbsolute(hostPath) ||
    /[\r\n\u0000]/u.test(hostPath)
  ) {
    throw new Error(`WSL pipeline requires an absolute safe Windows path: ${hostPath}`);
  }
  const cached = runner.translatedPaths?.get(hostPath);
  if (cached) return cached;
  const translated = validateTranslatedWslPath(
    run(
      runner.command,
      [
        "--distribution",
        runner.distribution,
        "--exec",
        "wslpath",
        "-a",
        "-u",
        hostPath,
      ],
      undefined,
      "capture",
    ),
  );
  runner.translatedPaths?.set(hostPath, translated);
  return translated;
}

function materializePipelineInvocation(
  runner,
  args,
  translate = translateWslPath,
) {
  if (!isRecord(runner) || !["native", "wsl"].includes(runner.backend)) {
    throw new Error("invalid pipeline runner");
  }
  const materializedArgs = args.map((argument) => {
    if (isPipelinePath(argument)) {
      return runner.backend === "wsl"
        ? translate(runner, argument.value)
        : argument.value;
    }
    if (typeof argument !== "string") {
      throw new Error("pipeline arguments must be strings or path markers");
    }
    return argument;
  });
  if (runner.backend === "native") {
    return { command: runner.command, args: materializedArgs };
  }
  return {
    command: runner.command,
    args: [
      "--distribution",
      runner.distribution,
      "--exec",
      runner.binary,
      ...materializedArgs,
    ],
  };
}

function runPipeline(runner, args, cwd, output = "inherit", environment = {}) {
  try {
    const invocation = materializePipelineInvocation(runner, args);
    return run(
      invocation.command,
      invocation.args,
      cwd,
      output,
      environment,
    );
  } catch (error) {
    if (runner?.backend !== "wsl") throw error;
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `WSL pipeline backend failed for distribution ${JSON.stringify(
        runner.distribution,
      )}: ${detail}. No subsequent Hexo generation or deploy step was run.`,
      { cause: error },
    );
  }
}

function runPipelineJson(runner, args, cwd) {
  const output = runPipeline(runner, args, cwd, "capture");
  try {
    return JSON.parse(output);
  } catch (error) {
    throw new Error("inochi2d pipeline returned invalid JSON", { cause: error });
  }
}

function run(command, args, cwd, output = "inherit", environment = {}) {
  const captured = output === "capture" || output === "quiet";
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...environment },
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
  if (result.error) {
    throw commandStartError(command, result.error);
  }
  if (result.status !== 0) {
    const outcome =
      result.status === null
        ? `was terminated by signal ${result.signal ?? "unknown"}`
        : `exited with status ${result.status}`;
    throw new Error(
      `${basename(command)} ${outcome}${
        captured && result.stderr ? `: ${result.stderr.trim()}` : ""
      }`,
    );
  }
  return output === "capture" ? result.stdout : "";
}

function commandStartError(command, error) {
  const executable = basename(command.replaceAll("\\", "/"));
  const detail = error instanceof Error ? error.message : String(error);
  const nativeHint = /^inochi2d-pipeline(?:\.exe)?$/iu.test(executable)
    ? " The bundled native pipeline is an unsigned experimental alpha and may " +
      "have been blocked by the operating system or endpoint security. Keep the " +
      "block in place and set pipelineBinary to a trusted self-built executable, " +
      "or stop; no subsequent Hexo generation or deploy step was run."
    : "";
  return new Error(`failed to start ${executable}: ${detail}${nativeHint}`, {
    cause: error,
  });
}

function resolveFrom(base, path) {
  return isAbsolute(path) ? resolve(path) : resolve(base, path);
}

function assertInside(parent, child) {
  const path = relative(resolve(parent), resolve(child));
  if (
    !path ||
    path === ".." ||
    path.startsWith(`..${sep}`) ||
    isAbsolute(path)
  ) {
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

function requiredClickAnimation(config) {
  const dialogueClick = configuredDialogueScene(config, "click");
  const click = config.widget?.interactions?.click;
  if (click === false) return undefined;
  if (click === undefined) return dialogueClick ? undefined : "Click";
  if (
    !isRecord(click) ||
    typeof click.animation !== "string" ||
    click.animation.trim().length === 0
  ) {
    throw new Error(
      "config.widget.interactions.click must be false or contain a non-empty animation name",
    );
  }
  return click.animation.trim();
}

function requiredAnimationNames(config) {
  if (config.widget !== undefined && !isRecord(config.widget)) {
    throw new Error("config.widget must be an object");
  }
  const names = new Set();
  const ambient = config.widget?.ambient;
  if (ambient !== undefined) {
    if (
      !isRecord(ambient) ||
      (ambient.animations !== undefined && !Array.isArray(ambient.animations))
    ) {
      throw new Error("config.widget.ambient.animations must be an array");
    }
    const ambientAnimations = ambient.animations ?? [];
    if (ambientAnimations.length > 8) {
      throw new Error(
        "config.widget.ambient.animations must contain at most 8 names",
      );
    }
    for (const [index, value] of ambientAnimations.entries()) {
      const name = nonEmptyAnimationName(
        value,
        `config.widget.ambient.animations[${index}]`,
      );
      if (names.has(name)) {
        throw new Error(
          `config.widget.ambient.animations[${index}] duplicates ${JSON.stringify(name)}`,
        );
      }
      names.add(name);
    }
    configuredAmbientParameters(config);
  }

  const dialogue = config.widget?.dialogue;
  if (dialogue !== undefined && !isRecord(dialogue)) {
    throw new Error("config.widget.dialogue must be an object");
  }
  if (
    config.widget?.interactions !== undefined &&
    !isRecord(config.widget.interactions)
  ) {
    throw new Error("config.widget.interactions must be an object");
  }
  for (const scene of ["enter", "idle", "click"]) {
    const configured = configuredDialogueScene(config, scene);
    if (configured) {
      names.add(configured.animation);
    }
  }

  const click = requiredClickAnimation(config);
  if (click) {
    const dialogueClick = configuredDialogueScene(config, "click");
    if (dialogueClick && dialogueClick.animation !== click) {
      throw new Error(
        "config.widget.interactions.click.animation and widget.dialogue.click.animation must match when both are enabled",
      );
    }
    names.add(click);
  }
  return [...names];
}

function configuredAmbientParameters(config) {
  const parameters = config.widget?.ambient?.parameters;
  if (parameters === undefined) {
    return [];
  }
  if (!Array.isArray(parameters) || parameters.length > 16) {
    throw new Error(
      "config.widget.ambient.parameters must contain at most 16 oscillators",
    );
  }
  const targets = [];
  for (const [index, value] of parameters.entries()) {
    const field = `config.widget.ambient.parameters[${index}]`;
    if (!isRecord(value)) {
      throw new Error(`${field} must be an object`);
    }
    const id = typeof value.id === "string" ? value.id.trim() : "";
    if (id.length === 0 || new TextEncoder().encode(id).byteLength > 256) {
      throw new Error(`${field}.id must contain 1..=256 UTF-8 bytes`);
    }
    if (value.axis !== undefined && value.axis !== "x" && value.axis !== "y") {
      throw new Error(`${field}.axis must be x or y`);
    }
    const minimum = requiredNumberInRange(
      value.minimum,
      -1_000,
      1_000,
      `${field}.minimum`,
    );
    const maximum = requiredNumberInRange(
      value.maximum,
      -1_000,
      1_000,
      `${field}.maximum`,
    );
    if (maximum <= minimum) {
      throw new Error(`${field}.maximum must be greater than minimum`);
    }
    const periodMs = requiredNumberInRange(
      value.periodMs,
      500,
      120_000,
      `${field}.periodMs`,
    );
    const phase = requiredNumberInRange(
      value.phase ?? 0,
      0,
      1,
      `${field}.phase`,
    );
    const target = {
      id,
      ...(value.axis ? { axis: value.axis } : {}),
      minimum,
      maximum,
      periodMs,
      phase,
    };
    if (targets.some((existing) => parameterTargetsOverlap(existing, target))) {
      throw new Error(`${field} overlaps another procedural ambient target`);
    }
    targets.push(target);
  }
  return targets;
}

function validateAmbientParameterTargets(
  parameters,
  animations,
  configured,
  label,
  ambientAnimationNames,
) {
  if (configured.length === 0) {
    return;
  }
  if (!Array.isArray(parameters)) {
    throw new Error(`${label} does not expose validated model parameters`);
  }
  const byName = new Map(
    parameters
      .filter(
        (parameter) =>
          isRecord(parameter) &&
          typeof parameter.name === "string" &&
          typeof parameter.isVector === "boolean",
      )
      .map((parameter) => [parameter.name, parameter]),
  );
  const ambientNames = new Set(
    ambientAnimationNames.map((name) => name.trim()),
  );
  const animationTargets = [];
  for (const animation of Array.isArray(animations) ? animations : []) {
    if (!ambientNames.has(animation?.name) || !Array.isArray(animation?.lanes)) {
      continue;
    }
    for (const lane of animation.lanes) {
      if (isRecord(lane) && typeof lane.parameter === "string") {
        animationTargets.push({
          id: lane.parameter,
          ...(lane.axis === "x" || lane.axis === "y" ? { axis: lane.axis } : {}),
        });
      }
    }
  }
  for (const target of configured) {
    const parameter = byName.get(target.id);
    if (!parameter) {
      throw new Error(
        `${label} does not contain ambient parameter ${JSON.stringify(target.id)}`,
      );
    }
    if (target.axis && parameter.isVector !== true) {
      throw new Error(
        `${label} ambient parameter ${JSON.stringify(target.id)} is scalar and cannot target axis ${target.axis}`,
      );
    }
    if (
      animationTargets.some((existing) =>
        parameterTargetsOverlap(existing, target),
      )
    ) {
      throw new Error(
        `${label} ambient parameter ${JSON.stringify(target.id)} overlaps an ambient animation lane`,
      );
    }
  }
}

function parameterTargetsOverlap(left, right) {
  return (
    left.id === right.id &&
    (left.axis === undefined ||
      right.axis === undefined ||
      left.axis === right.axis)
  );
}

function requiredNumberInRange(value, minimum, maximum, field) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(`${field} must be between ${minimum} and ${maximum}`);
  }
  return value;
}

function configuredDialogueScene(config, scene) {
  const value = config.widget?.dialogue?.[scene];
  if (value === undefined || value === false) {
    return undefined;
  }
  const field = `config.widget.dialogue.${scene}`;
  if (!isRecord(value)) {
    throw new Error(`${field} must be false or an object`);
  }
  const animation = nonEmptyAnimationName(value.animation, `${field}.animation`);
  if (
    !Array.isArray(value.lines) ||
    value.lines.length < 1 ||
    value.lines.length > 128
  ) {
    throw new Error(`${field}.lines must contain 1..=128 sentences`);
  }
  for (const [index, line] of value.lines.entries()) {
    if (
      typeof line !== "string" ||
      Buffer.byteLength(line.trim(), "utf8") < 1 ||
      Buffer.byteLength(line.trim(), "utf8") > 1_024
    ) {
      throw new Error(
        `${field}.lines[${index}] must contain 1..=1024 UTF-8 bytes`,
      );
    }
  }
  optionalNumberInRange(
    value.durationMs,
    500,
    60_000,
    `${field}.durationMs`,
  );
  if (scene === "enter") {
    optionalNumberInRange(value.delayMs, 0, 120_000, `${field}.delayMs`);
  }
  if (scene === "idle") {
    const minimum = optionalNumberInRange(
      value.intervalMinMs,
      5_000,
      3_600_000,
      `${field}.intervalMinMs`,
    );
    const maximum = optionalNumberInRange(
      value.intervalMaxMs,
      5_000,
      3_600_000,
      `${field}.intervalMaxMs`,
    );
    if ((maximum ?? 60_000) < (minimum ?? 30_000)) {
      throw new Error(
        `${field}.intervalMaxMs must be greater than or equal to intervalMinMs`,
      );
    }
  }
  return { animation };
}

function nonEmptyAnimationName(value, field) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty animation name`);
  }
  return value.trim();
}

function optionalNumberInRange(value, minimum, maximum, field) {
  if (value === undefined) return undefined;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(`${field} must be between ${minimum} and ${maximum}`);
  }
  return value;
}

function requireAnimation(animations, name, label) {
  if (!name) return;
  if (
    !Array.isArray(animations) ||
    !animations.some(
      (animation) =>
        isRecord(animation) &&
        animation.name === name &&
        Array.isArray(animation.lanes) &&
        animation.lanes.length > 0,
    )
  ) {
    throw new Error(
      `${label} does not contain the required animation ${JSON.stringify(name)}`,
    );
  }
}

function requireAnimations(animations, names, label) {
  for (const name of names) {
    requireAnimation(animations, name, label);
  }
}

function printHelp() {
  console.log(`Usage: inochi2d-blog <inspect|preview|prepare|verify|deploy> [options]

Options:
  --config <path>  JSON configuration (default: inochi2d-blog.config.json)
  --dry-run        Run preparation, Hexo generation, and browser gates without deploy
  --help           Show this help

The preview command creates a temporary bundle and Hexo output below
.inochi2d/preview, runs the same compatibility and browser gates, and then
serves only on 127.0.0.1 until Ctrl+C. It does not require a redistribution
attestation and has no deploy path.

The deploy command is fail-closed: authorization, hashes, preparation, Hexo
generation, and desktop/mobile browser gates must all pass before Hexo deploy.

The bundled native pipeline is an unsigned experimental alpha. npm installation
does not execute it; only an explicit command does. A system block or start
failure stops the command before subsequent Hexo generation or deployment.
On Windows, config.pipeline.backend="wsl" explicitly runs only model inspection
and compression inside the selected WSL distribution; Hexo and Chrome/Edge
remain Windows processes. WSL errors stop the command and never fall back.`);
}

export const testing = Object.freeze({
  parseArguments,
  validatePreviewConfig,
  validateOrchestrationConfig,
  validatePreviewInspection,
  validatePublication,
  validatePreviewBuiltManifest,
  validateBuiltManifest,
  immutableBundleName,
  assertManifestContentsEqual,
  verifyBundleArtifacts,
  requiredClickAnimation,
  requiredAnimationNames,
  requireAnimation,
  requireAnimations,
  assertInside,
  createStaticServer,
  listen,
  closeServer,
  verifyBrowser,
  summarizeFramePerformance,
  commandStartError,
  validatePipelineSelection,
  validateWslDistribution,
  validateWslBinary,
  validateTranslatedWslPath,
  pipelinePath,
  materializePipelineInvocation,
  cleanupStalePreviewRuns,
  isProcessAlive,
});
