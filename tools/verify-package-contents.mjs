import { spawnSync } from "node:child_process";

const expectations = new Map([
  [
    "inochi2d-web",
    [
      "dist/index.js",
      "dist/generated/inochi2d.wasm",
      "dist/widget.css",
      "README.md",
      "THIRD_PARTY_NOTICES.md",
      "THIRD_PARTY_LICENSES.txt",
    ],
  ],
  ["hexo-inox2d-widget", ["dist/index.js", "LICENSE", "README.md"]],
  [
    "inochi2d-blog",
    [
      "bin/inochi2d-blog.mjs",
      "src/cli.mjs",
      "LICENSE",
      "README.md",
      "THIRD_PARTY_NOTICES.md",
      "THIRD_PARTY_LICENSES.txt",
      "inochi2d-blog.config.example.json",
    ],
  ],
]);

for (const [workspace, required] of expectations) {
  const result = spawnSync(
    "npm",
    ["pack", "--dry-run", "--json", "--workspace", workspace],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(`npm pack failed for ${workspace}: ${result.stderr}`);
  }
  const [manifest] = JSON.parse(result.stdout);
  const paths = new Set(manifest.files.map((file) => file.path));
  for (const requiredPath of required) {
    if (!paths.has(requiredPath)) {
      throw new Error(`${workspace} package is missing ${requiredPath}`);
    }
  }
  if ([...paths].some((path) => path.endsWith(".inp") || path.endsWith(".inx"))) {
    throw new Error(`${workspace} package contains a puppet file`);
  }
  if (
    workspace !== "inochi2d-blog" &&
    [...paths].some((path) => path.startsWith("src/"))
  ) {
    throw new Error(`${workspace} package contains TypeScript source`);
  }
}

if (process.env.INOCHI2D_RELEASE_PACK === "1") {
  const result = spawnSync(
    "npm",
    ["pack", "--dry-run", "--json", "--workspace", "inochi2d-blog"],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(`npm pack failed for inochi2d-blog: ${result.stderr}`);
  }
  const [manifest] = JSON.parse(result.stdout);
  const paths = new Set(manifest.files.map((file) => file.path));
  for (const nativePath of [
    "vendor/linux-x64/inochi2d-pipeline",
    "vendor/win32-x64/inochi2d-pipeline.exe",
    "vendor/manifest.json",
  ]) {
    if (!paths.has(nativePath)) {
      throw new Error(`inochi2d-blog release package is missing ${nativePath}`);
    }
  }
}
