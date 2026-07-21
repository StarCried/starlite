import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";

import type { RuntimeAssetBundle } from "./types";

const PUBLISHABLE_EXTENSIONS = new Set([".css", ".js", ".wasm"]);

export function collectRuntimeAssets(runtimeDist = resolveRuntimeDist()): RuntimeAssetBundle {
  const assets = walk(runtimeDist)
    .filter((path) => PUBLISHABLE_EXTENSIONS.has(extension(path)))
    .map((path) => ({
      relativePath: relative(runtimeDist, path).split(sep).join("/"),
      contents: readFileSync(path),
    }))
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));

  if (!assets.some((asset) => asset.relativePath === "index.js")) {
    throw new Error("inochi2d-web dist is missing index.js; run the runtime build first");
  }
  if (!assets.some((asset) => asset.relativePath === "generated/runtime_bg.wasm")) {
    throw new Error("inochi2d-web dist is missing generated WASM; run the WASM build first");
  }

  const digest = createHash("sha256");
  for (const asset of assets) {
    digest.update(asset.relativePath);
    digest.update("\0");
    digest.update(asset.contents);
  }
  const hash = digest.digest("hex").slice(0, 12);
  return {
    hash,
    routePrefix: `inochi2d-widget/${hash}`,
    assets,
  };
}

function resolveRuntimeDist(): string {
  return dirname(require.resolve("inochi2d-web"));
}

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function extension(path: string): string {
  const index = path.lastIndexOf(".");
  return index === -1 ? "" : path.slice(index);
}
