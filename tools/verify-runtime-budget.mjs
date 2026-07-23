import { readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";

const workspaceRoot = resolve(import.meta.dirname, "..");
const distRoot = resolve(workspaceRoot, "packages/inochi2d-web/dist");
const budget = 1.5 * 1024 * 1024;
const assets = [];

await collect(distRoot);
const runtimeAssets = assets.filter(
  (asset) => asset.path.endsWith(".js") || asset.path.endsWith(".wasm"),
);
const bytes = runtimeAssets.reduce((total, asset) => total + asset.bytes, 0);
if (bytes > budget) {
  throw new Error(
    `raw runtime JavaScript + WASM is ${bytes} bytes; budget is ${budget} bytes`,
  );
}
console.log(
  `Raw runtime JavaScript + WASM: ${bytes} / ${budget} bytes ` +
    `(${runtimeAssets.length} files)`,
);

async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      await collect(path);
    } else if (entry.isFile()) {
      assets.push({ path, bytes: (await stat(path)).size });
    }
  }
}
