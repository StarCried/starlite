import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  access,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { main, testing } from "../src/cli.mjs";

const SOURCE_HASH = "a".repeat(64);
const CLICK_ANIMATION = {
  name: "Click",
  lanes: [{ parameter: "Arm:: Right:: Move" }],
};
const animation = (name) => ({
  name,
  lanes: [{ parameter: `${name}:: Parameter` }],
});

function context(overrides = {}) {
  return {
    config: {
      publication: {
        confirm: true,
        allowRedistribution: true,
        sourceSha256: SOURCE_HASH,
      },
    },
    ...overrides,
  };
}

function inspection(overrides = {}) {
  return {
    source: { sha256: SOURCE_HASH },
    compatibility: { supported: true, issues: [] },
    publication: { issues: [] },
    animations: [CLICK_ANIMATION],
    ...overrides,
  };
}

function manifest(overrides = {}) {
  return {
    model: {
      bytes: 1024,
      sha256: "b".repeat(64),
      sourceSha256: SOURCE_HASH,
    },
    fallback: { sha256: "c".repeat(64) },
    compatibility: { supported: true },
    publication: { issues: [] },
    animations: [CLICK_ANIMATION],
    ...overrides,
  };
}

test("deploy is never implied by verify or dry-run", () => {
  assert.deepEqual(testing.parseArguments([]), {
    command: "verify",
    config: undefined,
    dryRun: false,
    help: false,
  });
  assert.equal(testing.parseArguments(["deploy", "--dry-run"]).dryRun, true);
  assert.equal(testing.parseArguments(["preview"]).command, "preview");
  assert.throws(
    () => testing.parseArguments(["preview", "--dry-run"]),
    /not valid.*preview/u,
  );
});

test("a blocked unsigned native executable produces a fail-closed action message", () => {
  const error = testing.commandStartError(
    "C:\\package\\inochi2d-pipeline.exe",
    Object.assign(new Error("operation was blocked"), { code: "EPERM" }),
  );
  assert.match(error.message, /unsigned experimental alpha/u);
  assert.match(error.message, /pipelineBinary/u);
  assert.match(error.message, /no subsequent Hexo generation or deploy step was run/u);
});

test("preview accepts an explicit WSL pipeline without publication metadata", () => {
  assert.doesNotThrow(() =>
    testing.validatePreviewConfig({
      blogRoot: "E:\\blog",
      model: "E:\\models\\character.inx",
      fallback: "E:\\models\\fallback.png",
      pipeline: {
        backend: "wsl",
        distribution: "Ubuntu",
        binary: "/home/pc/inochi2d-pipeline",
      },
    }),
  );
});

test("WSL pipeline selection is explicit and mutually exclusive with native binary", () => {
  const pipeline = {
    backend: "wsl",
    distribution: "Ubuntu",
    binary: "/home/pc/inochi2d-pipeline",
  };
  assert.doesNotThrow(() => testing.validatePipelineSelection({ pipeline }));
  assert.throws(
    () =>
      testing.validatePipelineSelection({
        pipeline,
        pipelineBinary: "inochi2d-pipeline.exe",
      }),
    /cannot be combined/u,
  );
  assert.throws(
    () =>
      testing.validatePipelineSelection({
        pipeline: { ...pipeline, backend: "automatic" },
      }),
    /exactly "wsl"/u,
  );
});

test("WSL pipeline rejects unsafe distribution and binary values", () => {
  for (const distribution of ["", " Ubuntu", "Ubuntu\nOther"]) {
    assert.throws(
      () => testing.validateWslDistribution(distribution),
      /distribution/u,
    );
  }
  for (const binary of [
    "",
    "home/pc/pipeline",
    "/home/pc/../pipeline",
    "/home/pc\\pipeline",
    "/home/pc/pipeline\nother",
  ]) {
    assert.throws(() => testing.validateWslBinary(binary), /binary/u);
  }
});

test("pipeline invocation translates only marked paths and preserves argument boundaries", () => {
  const hostPath = "E:\\Star Cried\\model.inx";
  const native = testing.materializePipelineInvocation(
    { backend: "native", command: "pipeline.exe" },
    ["inspect", "--input", testing.pipelinePath(hostPath), "--compact"],
  );
  assert.deepEqual(native, {
    command: "pipeline.exe",
    args: ["inspect", "--input", hostPath, "--compact"],
  });

  const translated = [];
  const wsl = testing.materializePipelineInvocation(
    {
      backend: "wsl",
      command: "C:\\Windows\\System32\\wsl.exe",
      distribution: "Ubuntu Test",
      binary: "/home/pc/inochi2d-pipeline",
    },
    ["inspect", "--input", testing.pipelinePath(hostPath), "--compact"],
    (_runner, value) => {
      translated.push(value);
      return "/mnt/e/Star Cried/model.inx";
    },
  );
  assert.deepEqual(translated, [hostPath]);
  assert.deepEqual(wsl, {
    command: "C:\\Windows\\System32\\wsl.exe",
    args: [
      "--distribution",
      "Ubuntu Test",
      "--exec",
      "/home/pc/inochi2d-pipeline",
      "inspect",
      "--input",
      "/mnt/e/Star Cried/model.inx",
      "--compact",
    ],
  });
});

test("translated WSL paths must be one normalized absolute POSIX path", () => {
  assert.equal(
    testing.validateTranslatedWslPath("/mnt/e/Star Cried/model.inx\r\n"),
    "/mnt/e/Star Cried/model.inx",
  );
  for (const output of [
    "",
    "mnt/e/model.inx\n",
    "/mnt/e/model.inx\n/mnt/e/other.inx\n",
    "/mnt/e/../e/model.inx\n",
    "/mnt/e\\model.inx\n",
  ]) {
    assert.throws(
      () => testing.validateTranslatedWslPath(output),
      /wslpath/u,
    );
  }
});

test("a blocked native executable writes no generated Hexo configuration", async () => {
  const root = await mkdtemp(join(tmpdir(), "inochi2d-blog-blocked-native-"));
  const blogRoot = join(root, "blog");
  const modelPath = join(root, "model.inp");
  const fallbackPath = join(root, "fallback.png");
  const pipelinePath = join(root, "inochi2d-pipeline.exe");
  const configPath = join(root, "inochi2d-blog.config.json");
  try {
    await mkdir(blogRoot);
    await Promise.all([
      writeFile(modelPath, "model"),
      writeFile(fallbackPath, "fallback"),
      writeFile(pipelinePath, "", { mode: 0o644 }),
    ]);
    await writeFile(
      configPath,
      JSON.stringify({
        schemaVersion: 1,
        blogRoot,
        model: modelPath,
        fallback: fallbackPath,
        pipelineBinary: pipelinePath,
        publication: {
          confirm: true,
          allowRedistribution: true,
          sourceSha256: SOURCE_HASH,
        },
      }),
    );

    await assert.rejects(
      main(["prepare", "--config", configPath]),
      /unsigned experimental alpha/u,
    );
    await assert.rejects(
      access(join(blogRoot, ".inochi2d", ".inochi2d.generated.yml")),
      { code: "ENOENT" },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("deployment configuration is mandatory only after read-only inspection", () => {
  assert.throws(
    () => testing.validateOrchestrationConfig({ schemaVersion: 1, model: "puppet.inp" }),
    /blogRoot/u,
  );
  assert.doesNotThrow(() =>
    testing.validateOrchestrationConfig({
      schemaVersion: 1,
      blogRoot: "blog",
      model: "puppet.inp",
      fallback: "fallback.png",
      publication: {
        confirm: true,
        allowRedistribution: true,
        sourceSha256: SOURCE_HASH,
      },
    }),
  );
  assert.throws(
    () =>
      testing.validateOrchestrationConfig({
        schemaVersion: 1,
        blogRoot: "blog",
        model: "puppet.inp",
        fallback: "fallback.png",
        publication: {
          confirm: true,
          allowRedistribution: true,
          sourceSha256: SOURCE_HASH,
        },
        widget: { interactions: { click: true } },
      }),
    /must be false or contain/u,
  );
  assert.throws(
    () =>
      testing.validateOrchestrationConfig({
        schemaVersion: 1,
        blogRoot: "blog",
        model: "puppet.inp",
        fallback: "fallback.png",
        publication: {
          confirm: true,
          allowRedistribution: true,
          sourceSha256: SOURCE_HASH,
        },
        widget: {
          dialogue: {
            click: { animation: "Click", lines: [] },
          },
        },
      }),
    /lines.*1\.\.=128/u,
  );
});

test("local preview requires model inputs but no publication attestation", () => {
  assert.doesNotThrow(() =>
    testing.validatePreviewConfig({
      schemaVersion: 1,
      blogRoot: "blog",
      model: "puppet.inp",
      fallback: "fallback.png",
    }),
  );
  assert.throws(
    () =>
      testing.validateOrchestrationConfig({
        schemaVersion: 1,
        blogRoot: "blog",
        model: "puppet.inp",
        fallback: "fallback.png",
      }),
    /publication is required/u,
  );
});

test("local preview ignores rights blockers but not compatibility or model features", () => {
  const localContext = context({
    config: {
      widget: { interactions: { click: { animation: "Click" } } },
    },
  });
  assert.doesNotThrow(() =>
    testing.validatePreviewInspection(
      localContext,
      inspection({
        publication: {
          issues: [{ code: "rights_unknown", severity: "error" }],
        },
      }),
    ),
  );
  assert.throws(
    () =>
      testing.validatePreviewInspection(
        localContext,
        inspection({ compatibility: { supported: false, issues: [] } }),
      ),
    /supported browser compatibility profile/u,
  );
  assert.throws(
    () =>
      testing.validatePreviewInspection(
        localContext,
        inspection({ animations: [] }),
      ),
    /source model.*Click/u,
  );
});

test("local preview validates the built artifact without a publication hash", () => {
  const localContext = context({
    config: {
      widget: { interactions: { click: { animation: "Click" } } },
    },
  });
  assert.doesNotThrow(() =>
    testing.validatePreviewBuiltManifest(
      localContext,
      inspection(),
      manifest({
        publication: {
          issues: [{ code: "rights_unknown", severity: "error" }],
        },
      }),
    ),
  );
});

test("publication validation rejects an unreviewed source hash", () => {
  assert.throws(
    () =>
      testing.validatePublication(
        context(),
        inspection({ source: { sha256: "d".repeat(64) } }),
      ),
    /source hash mismatch/u,
  );
});

test("publication validation rejects runtime and rights blockers", () => {
  assert.throws(
    () =>
      testing.validatePublication(
        context(),
        inspection({ compatibility: { supported: false, issues: [] } }),
      ),
    /supported browser compatibility profile/u,
  );
  assert.throws(
    () =>
      testing.validatePublication(
        context(),
        inspection({
          publication: {
            issues: [{ code: "redistribution_declared_prohibited", severity: "error" }],
          },
        }),
      ),
    /redistribution_declared_prohibited/u,
  );
});

test("publication validation requires the configured model animation", () => {
  assert.throws(
    () =>
      testing.validatePublication(
        context(),
        inspection({ animations: [] }),
      ),
    /source model.*Click/u,
  );
  assert.doesNotThrow(() =>
    testing.validatePublication(
      context({
        config: {
          publication: {
            confirm: true,
            allowRedistribution: true,
            sourceSha256: SOURCE_HASH,
          },
          widget: { interactions: { click: { animation: "Wave" } } },
        },
      }),
      inspection({
        animations: [{ name: "Wave", lanes: [{ parameter: "Arm" }] }],
      }),
    ),
  );
});

test("all ambient and dialogue animations are fail-closed gates", () => {
  const configured = context({
    config: {
      publication: {
        confirm: true,
        allowRedistribution: true,
        sourceSha256: SOURCE_HASH,
      },
      widget: {
        ambient: { animations: ["TailIdle"] },
        dialogue: {
          enter: { animation: "Greeting", lines: ["Welcome"] },
          idle: {
            animation: "Idle",
            lines: ["Still here"],
            intervalMinMs: 5_000,
            intervalMaxMs: 5_000,
          },
          click: { animation: "Click", lines: ["Hello"] },
        },
      },
    },
  });
  assert.deepEqual(testing.requiredAnimationNames(configured.config), [
    "TailIdle",
    "Greeting",
    "Idle",
    "Click",
  ]);
  assert.equal(testing.requiredClickAnimation(configured.config), undefined);
  assert.doesNotThrow(() =>
    testing.validatePublication(
      configured,
      inspection({
        animations: [
          animation("TailIdle"),
          animation("Greeting"),
          animation("Idle"),
          CLICK_ANIMATION,
        ],
      }),
    ),
  );
  assert.throws(
    () =>
      testing.validatePublication(
        configured,
        inspection({
          animations: [
            animation("Greeting"),
            animation("Idle"),
            CLICK_ANIMATION,
          ],
        }),
      ),
    /source model.*TailIdle/u,
  );
});

test("procedural ambient parameters are validated against the exact model rig", () => {
  const configured = context({
    config: {
      publication: {
        confirm: true,
        allowRedistribution: true,
        sourceSha256: SOURCE_HASH,
      },
      widget: {
        interactions: { click: false },
        ambient: {
          parameters: [
            {
              id: "Tail",
              minimum: -0.5,
              maximum: 0.5,
              periodMs: 4_000,
            },
          ],
        },
      },
    },
  });
  assert.doesNotThrow(() =>
    testing.validatePublication(
      configured,
      inspection({
        animations: [],
        parameters: [{ name: "Tail", isVector: false }],
      }),
    ),
  );
  assert.throws(
    () =>
      testing.validatePublication(
        configured,
        inspection({ animations: [], parameters: [] }),
      ),
    /does not contain ambient parameter "Tail"/u,
  );

  const overlapping = context({
    config: {
      publication: {
        confirm: true,
        allowRedistribution: true,
        sourceSha256: SOURCE_HASH,
      },
      widget: {
        interactions: { click: false },
        ambient: {
          animations: ["TailIdle"],
          parameters: [
            {
              id: "Tail",
              minimum: -0.5,
              maximum: 0.5,
              periodMs: 4_000,
            },
          ],
        },
      },
    },
  });
  assert.throws(
    () =>
      testing.validatePublication(
        overlapping,
        inspection({
          animations: [animation("TailIdle")].map((clip) => ({
            ...clip,
            lanes: [{ parameter: "Tail" }],
          })),
          parameters: [{ name: "Tail", isVector: false }],
        }),
      ),
    /overlaps an ambient animation lane/u,
  );
});

test("legacy and dialogue click names must not conflict", () => {
  assert.throws(
    () =>
      testing.requiredAnimationNames({
        widget: {
          interactions: { click: { animation: "Click" } },
          dialogue: {
            click: { animation: "Wave", lines: ["Hello"] },
          },
        },
      }),
    /must match/u,
  );
});

test("built manifest must retain the reviewed source and model budget", () => {
  assert.throws(
    () =>
      testing.validateBuiltManifest(
        context(),
        inspection(),
        manifest({
          model: {
            bytes: 1024,
            sha256: "b".repeat(64),
            sourceSha256: "e".repeat(64),
          },
        }),
      ),
    /source hash changed/u,
  );
  assert.throws(
    () =>
      testing.validateBuiltManifest(
        context(),
        inspection(),
        manifest({
          model: {
            bytes: 8 * 1024 * 1024 + 1,
            sha256: "b".repeat(64),
            sourceSha256: SOURCE_HASH,
          },
        }),
      ),
    /prepared model exceeds/u,
  );
  assert.throws(
    () =>
      testing.validateBuiltManifest(
        context(),
        inspection(),
        manifest({ animations: [] }),
      ),
    /built bundle.*Click/u,
  );
});

test("immutable bundle identity changes when normalized manifest content changes", () => {
  const manifest = {
    model: {
      sourceSha256: "a".repeat(64),
      sha256: "b".repeat(64),
    },
  };
  const first = testing.immutableBundleName(
    manifest,
    Buffer.from('{"animations":[]}'),
  );
  const second = testing.immutableBundleName(
    manifest,
    Buffer.from('{"animations":[{"name":"Click"}]}'),
  );

  assert.match(first, /^a{12}-b{12}-[a-f0-9]{12}$/u);
  assert.notEqual(first, second);
});

test("immutable bundle reuse requires the complete manifest to match", () => {
  const expected = Buffer.from('{"model":{"sha256":"same"},"animations":[]}');
  assert.doesNotThrow(() =>
    testing.assertManifestContentsEqual(expected, Buffer.from(expected), "/bundle"),
  );
  assert.throws(
    () =>
      testing.assertManifestContentsEqual(
        Buffer.from('{"model":{"sha256":"same"},"animations":[1]}'),
        expected,
        "/bundle",
      ),
    /immutable bundle conflicts/u,
  );
});

test("immutable bundle artifacts are size/hash checked and cannot be symlinks", async () => {
  const root = await mkdtemp(join(tmpdir(), "inochi2d-blog-bundle-"));
  try {
    const model = Buffer.from("model");
    const fallback = Buffer.from("fallback");
    const modelHash = createHash("sha256").update(model).digest("hex");
    const fallbackHash = createHash("sha256").update(fallback).digest("hex");
    const modelFile = `model.${modelHash.slice(0, 12)}.inp`;
    const fallbackFile = `fallback.${fallbackHash.slice(0, 12)}.png`;
    const manifest = {
      model: {
        file: modelFile,
        sha256: modelHash,
        bytes: model.byteLength,
      },
      fallback: {
        file: fallbackFile,
        sha256: fallbackHash,
        bytes: fallback.byteLength,
      },
    };
    await Promise.all([
      writeFile(join(root, modelFile), model),
      writeFile(join(root, fallbackFile), fallback),
    ]);
    await assert.doesNotReject(() =>
      testing.verifyBundleArtifacts(root, manifest),
    );

    await rm(join(root, modelFile));
    await symlink(fallbackFile, join(root, modelFile));
    await assert.rejects(
      () => testing.verifyBundleArtifacts(root, manifest),
      /non-symlink/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("generated paths cannot escape the blog state directory", () => {
  assert.doesNotThrow(() => testing.assertInside("/blog/.inochi2d", "/blog/.inochi2d/bundle"));
  assert.doesNotThrow(() =>
    testing.assertInside("/blog/.inochi2d", "/blog/.inochi2d/..cache"),
  );
  assert.throws(
    () => testing.assertInside("/blog/.inochi2d", "/blog/public"),
    /unsafe generated path/u,
  );
});

test("stale local preview runs are removed while the active run is preserved", async () => {
  const root = await mkdtemp(join(tmpdir(), "inochi2d-blog-preview-cleanup-"));
  const stale = join(root, "run-stale");
  const active = join(root, "run-active");
  try {
    await Promise.all([mkdir(stale), mkdir(active)]);
    const lock = (pid) =>
      JSON.stringify({
        schemaVersion: 1,
        pid,
        platform: process.platform,
        hostname: hostname(),
        startedAt: new Date().toISOString(),
      });
    await Promise.all([
      writeFile(join(stale, "run.json"), lock(2_147_483_647)),
      writeFile(join(active, "run.json"), lock(process.pid)),
    ]);

    await testing.cleanupStalePreviewRuns(root);

    await assert.rejects(access(stale), { code: "ENOENT" });
    await access(active);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a failed local preview leaves no temporary run or production output", async () => {
  const root = await mkdtemp(join(tmpdir(), "inochi2d-blog-preview-failure-"));
  const blogRoot = join(root, "blog");
  const modelPath = join(root, "model.inp");
  const fallbackPath = join(root, "fallback.png");
  const pipelinePath = join(root, "inochi2d-pipeline.exe");
  const configPath = join(root, "inochi2d-blog.config.json");
  try {
    await mkdir(blogRoot);
    await Promise.all([
      writeFile(modelPath, "model"),
      writeFile(fallbackPath, "fallback"),
      writeFile(pipelinePath, "", { mode: 0o644 }),
    ]);
    await writeFile(
      configPath,
      JSON.stringify({
        schemaVersion: 1,
        blogRoot,
        model: modelPath,
        fallback: fallbackPath,
        pipelineBinary: pipelinePath,
      }),
    );

    await assert.rejects(
      main(["preview", "--config", configPath]),
      /unsigned experimental alpha/u,
    );
    assert.deepEqual(
      await readdir(join(blogRoot, ".inochi2d", "preview")),
      [],
    );
    await assert.rejects(access(join(blogRoot, "public")), { code: "ENOENT" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("built-in preview serves generated files and rejects path traversal", async () => {
  const root = await mkdtemp(join(tmpdir(), "inochi2d-blog-preview-"));
  const server = testing.createStaticServer(root);
  try {
    await writeFile(join(root, "index.html"), "<h1>generated</h1>");
    await testing.listen(server, 0);
    const address = server.address();
    assert.ok(address && typeof address === "object");

    const page = await fetch(`http://127.0.0.1:${address.port}/`);
    assert.equal(page.status, 200);
    assert.equal(await page.text(), "<h1>generated</h1>");

    const traversal = await fetch(
      `http://127.0.0.1:${address.port}/%2e%2e%2foutside.txt`,
    );
    assert.equal(traversal.status, 400);
  } finally {
    await testing.closeServer(server);
    await rm(root, { recursive: true, force: true });
  }
});

test("render performance summary reports FPS and p95 without hiding bad samples", () => {
  const samples = Array.from({ length: 100 }, (_, index) => ({
    timestamp: index * (1_000 / 30),
    durationMs: index < 95 ? 4 : 20,
  }));
  const result = testing.summarizeFramePerformance(samples);
  assert.ok(Math.abs(result.framesPerSecond - 30) < 0.001);
  assert.equal(result.p95DurationMs, 4);
  assert.equal(result.sampleCount, 100);

  assert.throws(
    () =>
      testing.summarizeFramePerformance([
        { timestamp: 1, durationMs: 1 },
        { timestamp: 1, durationMs: 1 },
      ]),
    /malformed or unordered/u,
  );
  assert.throws(
    () =>
      testing.summarizeFramePerformance([
        { timestamp: 1, durationMs: -1 },
        { timestamp: 2, durationMs: 1 },
      ]),
    /malformed or unordered/u,
  );
});
