import { createHash } from "node:crypto";
import { chmod, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vendorRoot = resolve(workspaceRoot, "packages/inochi2d-blog/vendor");
const inputs = parseArguments(process.argv.slice(2));
const targets = [
  {
    name: "linux-x64",
    source: inputs.get("linux-x64"),
    executable: "inochi2d-pipeline",
  },
  {
    name: "win32-x64",
    source: inputs.get("win32-x64"),
    executable: "inochi2d-pipeline.exe",
  },
];

if (targets.some((target) => !target.source)) {
  throw new Error(
    "usage: npm run stage:native -- --linux-x64 <binary> --win32-x64 <binary>",
  );
}

const artifacts = [];
for (const target of targets) {
  const source = resolve(target.source);
  const bytes = await readFile(source);
  if (bytes.byteLength === 0 || bytes.byteLength > 32 * 1024 * 1024) {
    throw new Error(`${basename(source)} has an invalid native binary size`);
  }
  const directory = resolve(vendorRoot, target.name);
  await mkdir(directory, { recursive: true });
  const destination = resolve(directory, target.executable);
  await copyFile(source, destination);
  if (target.name === "linux-x64") {
    await chmod(destination, 0o755);
  }
  artifacts.push({
    target: target.name,
    file: `${target.name}/${target.executable}`,
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}

await writeFile(
  resolve(vendorRoot, "manifest.json"),
  `${JSON.stringify({ schemaVersion: 1, artifacts }, null, 2)}\n`,
  { flag: "wx" },
);

function parseArguments(argv) {
  const result = new Map();
  while (argv.length > 0) {
    const option = argv.shift();
    const value = argv.shift();
    if (!option?.startsWith("--") || !value) {
      throw new Error("native staging arguments must be --target <path> pairs");
    }
    const target = option.slice(2);
    if (result.has(target) || !["linux-x64", "win32-x64"].includes(target)) {
      throw new Error(`unsupported or duplicate native target ${target}`);
    }
    result.set(target, value);
  }
  return result;
}
