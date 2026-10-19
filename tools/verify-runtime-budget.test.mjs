import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { measureRuntime, assertRuntimeBudget } from "./verify-runtime-budget.mjs";

test("counts loaded entry files only, including independently compressed CSS", async () => {
  const root = await mkdtemp(join(tmpdir(), "starlite-budget-"));
  try {
    await mkdir(join(root, "dist"));
    await writeFile(join(root, "dist/index.js"), "export default 1;".repeat(10));
    await writeFile(join(root, "dist/widget.css"), ".widget{}".repeat(10));
    await writeFile(join(root, "dist/prepare.cjs"), "not a browser dependency".repeat(100));
    const result = await measureRuntime(root, { directory: "dist", files: ["index.js", "widget.css"] });
    assert.equal(result.files.length, 2);
    assert.equal(result.totals.raw, 260);
    assert.ok(result.totals.gzip > 0 && result.totals.brotli > 0);
    assert.doesNotThrow(() => assertRuntimeBudget("vrm", result.totals, { raw: 260, gzip: 500, brotli: 500 }));
    assert.throws(() => assertRuntimeBudget("vrm", result.totals, { raw: 259, gzip: 500, brotli: 500 }), /exceeds/);
    assert.throws(() => assertRuntimeBudget("vrm", result.totals, { raw: 1000, gzip: 1, brotli: 500 }), /gzip/);
    assert.throws(() => assertRuntimeBudget("vrm", result.totals, { raw: 1000, gzip: 500, brotli: 1 }), /brotli/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
