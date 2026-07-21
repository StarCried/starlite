import { spawnSync } from "node:child_process";

const expectations = new Map([
  [
    "inochi2d-web",
    ["dist/index.js", "dist/generated/runtime.js", "dist/generated/runtime_bg.wasm", "dist/widget.css"],
  ],
  ["hexo-inox2d-widget", ["dist/index.js", "LICENSE"]],
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
  if ([...paths].some((path) => path.endsWith(".inp") || path.startsWith("src/"))) {
    throw new Error(`${workspace} package contains a source or puppet file`);
  }
}
