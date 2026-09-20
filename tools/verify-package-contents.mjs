import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const blogPackage = JSON.parse(
  await readFile(
    new URL("../packages/inochi2d-blog/package.json", import.meta.url),
    "utf8",
  ),
);
for (const lifecycle of ["preinstall", "install", "postinstall"]) {
  if (blogPackage.scripts?.[lifecycle]) {
    throw new Error(
      `inochi2d-blog must not execute native code through npm ${lifecycle}`,
    );
  }
}

const expectations = new Map([
 ["model-widget-core", ["dist/index.js", "LICENSE", "README.md"]],
 ["vrm-web", ["dist/index.js", "dist/widget.css", "dist/inspect.cjs", "dist/config.cjs", "LICENSE", "README.md", "THIRD_PARTY_LICENSES.txt"]],
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
  ["hexo-model-companion", ["dist/index.js", "LICENSE", "README.md"]],
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
  if ([...paths].some((path) => /\.(inp|inx|vrm|vrma|blend)$/i.test(path))) {
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
