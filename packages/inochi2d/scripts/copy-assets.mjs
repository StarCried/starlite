import { build } from "esbuild";
import { readFile, writeFile, copyFile, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const generatedSource = resolve(packageRoot, "src/generated");
const generatedDestination = resolve(packageRoot, "dist/generated");

await mkdir(resolve(packageRoot, "dist"), { recursive: true });
await writeFile(resolve(packageRoot, "dist/widget.css"), await readFile(resolve(packageRoot, "src/widget.css"), "utf8") + "\n" + await readFile(new URL(import.meta.resolve("@starcried/starlite-core/bubble.css")), "utf8"));
await rm(generatedDestination, { force: true, recursive: true });
await mkdir(generatedDestination, { recursive: true });
for (const filename of ["inochi2d.wasm"]) {
  await copyFile(resolve(generatedSource, filename), resolve(generatedDestination, filename));
}

// Keep the shared scheduler inside the browser distribution: no bare npm imports.
await build({ entryPoints: [resolve(packageRoot,"src/dialogue.ts")], outfile: resolve(packageRoot,"dist/dialogue.js"), bundle: true, format: "esm", platform: "browser", target: "es2022" });
await build({ entryPoints: [resolve(packageRoot,"src/hit-mask.ts")], outfile: resolve(packageRoot,"dist/hit-mask.js"), bundle: true, format: "esm", platform: "browser", target: "es2022" });
