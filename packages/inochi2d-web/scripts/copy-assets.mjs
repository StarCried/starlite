import { copyFile, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const generatedSource = resolve(packageRoot, "src/generated");
const generatedDestination = resolve(packageRoot, "dist/generated");

await mkdir(resolve(packageRoot, "dist"), { recursive: true });
await copyFile(resolve(packageRoot, "src/widget.css"), resolve(packageRoot, "dist/widget.css"));
await rm(generatedDestination, { force: true, recursive: true });
await mkdir(generatedDestination, { recursive: true });
for (const filename of ["runtime.js", "runtime.d.ts", "runtime_bg.wasm", "runtime_bg.wasm.d.ts"]) {
  await copyFile(resolve(generatedSource, filename), resolve(generatedDestination, filename));
}
