import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { main, testing } from "../src/cli.mjs";

const SOURCE_HASH = "a".repeat(64);
const CLICK_ANIMATION = {
  name: "Click",
  lanes: [{ parameter: "Arm:: Right:: Move" }],
};

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

test("generated paths cannot escape the blog state directory", () => {
  assert.doesNotThrow(() => testing.assertInside("/blog/.inochi2d", "/blog/.inochi2d/bundle"));
  assert.throws(
    () => testing.assertInside("/blog/.inochi2d", "/blog/public"),
    /unsafe generated path/u,
  );
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
