import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync, brotliCompressSync, constants } from "node:zlib";

const workspaceRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

/** Count independently served files, rather than an unrealistically concatenated archive. */
export async function measureRuntime(root, entry) {
  const paths = entry.files ?? (await collect(resolve(root, entry.directory)))
    .filter((path) => /\.(js|wasm)$/.test(path))
    .map((path) => relative(resolve(root, entry.directory), path));
  if (!paths.length) throw new Error(`No browser runtime files found in ${entry.directory}; build it before checking the budget`);
  const files = [];
  for (const path of paths) {
    const bytes = await readFile(resolve(root, entry.directory, path));
    files.push({ path, raw: bytes.length, gzip: gzipSync(bytes, { level: 9 }).length,
      brotli: brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length });
  }
  return { files, totals: files.reduce((sum, file) => ({ raw: sum.raw + file.raw,
    gzip: sum.gzip + file.gzip, brotli: sum.brotli + file.brotli }), { raw: 0, gzip: 0, brotli: 0 }) };
}

export function assertRuntimeBudget(id, totals, limits) {
  for (const encoding of ["raw", "gzip", "brotli"]) {
    if (!Number.isSafeInteger(limits[encoding]) || limits[encoding] <= 0) throw new Error(`${id}: invalid ${encoding} budget`);
    if (totals[encoding] > limits[encoding]) throw new Error(`${id} ${encoding}: ${totals[encoding]} bytes exceeds ${limits[encoding]} bytes`);
  }
}

async function collect(directory) {
  const paths = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) paths.push(...await collect(path));
    else if (entry.isFile()) paths.push(path);
  }
  return paths.sort();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const budget = JSON.parse(await readFile(resolve(workspaceRoot, "tools/performance-budget.json"), "utf8"));
  const results = {};
  for (const [id, entry] of Object.entries(budget.runtime)) {
    const result = await measureRuntime(workspaceRoot, entry);
    assertRuntimeBudget(id, result.totals, entry.maxBytes);
    results[id] = result;
    console.log(`${id}: raw ${result.totals.raw}/${entry.maxBytes.raw}; gzip ${result.totals.gzip}/${entry.maxBytes.gzip}; brotli ${result.totals.brotli}/${entry.maxBytes.brotli} bytes (${result.files.length} files)`);
  }
  const outputIndex = process.argv.indexOf("--report");
  if (outputIndex !== -1) {
    if (!process.argv[outputIndex + 1]) throw new Error("--report requires a path");
    await writeFile(resolve(process.argv[outputIndex + 1]), JSON.stringify({ schemaVersion: 1, node: process.version, zlib: process.versions.zlib, brotli: process.versions.brotli, runtime: results }, null, 2) + "\n");
  }
}
