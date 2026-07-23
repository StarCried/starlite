#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const checkOnly = process.argv.includes("--check");
const licenseName = /^(?:license|copying|notice|unlicense|copyright)(?:[._-].*)?$/iu;

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function normalizeText(value) {
  return `${value.replace(/\r\n?/gu, "\n").trimEnd()}\n`;
}

function readDubLicense(componentRoot, fallback = "SEE LICENSE FILE") {
  const jsonPath = resolve(componentRoot, "dub.json");
  if (existsSync(jsonPath)) {
    const value = readJson(jsonPath).license;
    return Array.isArray(value) ? value.join(" OR ") : (value ?? fallback);
  }
  const sdlPath = resolve(componentRoot, "dub.sdl");
  if (existsSync(sdlPath)) {
    const match = readFileSync(sdlPath, "utf8").match(
      /^license\s+"([^"]+)"/mu,
    );
    return match?.[1] ?? fallback;
  }
  return fallback;
}

function collectLicenseFiles(componentRoot, configuredLicenseFile) {
  const candidates = readdirSync(componentRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && licenseName.test(entry.name))
    .map((entry) => resolve(componentRoot, entry.name));
  if (configuredLicenseFile) {
    const configured = resolve(componentRoot, configuredLicenseFile);
    if (statSync(configured).isFile() && !candidates.includes(configured)) {
      candidates.push(configured);
    }
  }
  candidates.sort((left, right) => left.localeCompare(right));
  if (candidates.length === 0) {
    throw new Error(`no distributable license file found in ${componentRoot}`);
  }
  return candidates.map((path) => ({
    name: path.slice(componentRoot.length + 1),
    contents: normalizeText(readFileSync(path, "utf8")),
  }));
}

function cargoComponents() {
  const result = spawnSync(
    "cargo",
    ["metadata", "--locked", "--format-version", "1"],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(`cargo metadata failed: ${result.stderr}`);
  }
  const metadata = JSON.parse(result.stdout);
  const nodes = new Map(metadata.resolve.nodes.map((node) => [node.id, node]));
  const reachable = new Set();
  const pending = [...metadata.workspace_members];
  while (pending.length > 0) {
    const id = pending.pop();
    if (reachable.has(id)) continue;
    reachable.add(id);
    const node = nodes.get(id);
    for (const dependency of node?.deps ?? []) {
      pending.push(dependency.pkg);
    }
  }
  return metadata.packages
    .filter((item) => item.source && reachable.has(item.id))
    .sort(
      (left, right) =>
        left.name.localeCompare(right.name) ||
        left.version.localeCompare(right.version),
    )
    .map((item) => {
      const componentRoot = dirname(item.manifest_path);
      return {
        name: item.name,
        version: item.version,
        license: item.license ?? "SEE LICENSE FILE",
        source: item.repository ?? item.source,
        files: collectLicenseFiles(componentRoot, item.license_file),
      };
    });
}

function dComponents() {
  const pin = readJson(resolve(repositoryRoot, "tools/official-sdk/pin.json"));
  const selections = readJson(
    resolve(repositoryRoot, "tools/official-sdk/dub.selections.json"),
  );
  const cacheRoot = resolve(
    homedir(),
    ".cache/inochi2d-web/official-sdk",
    `${pin.sdkCommit}-${pin.toolchainTag}`,
  );
  const sdkRoot = resolve(cacheRoot, `inochi2d-${pin.sdkCommit}`);
  const components = [
    {
      name: "inochi2d",
      version: pin.sdkCommit,
      license: readDubLicense(sdkRoot, "BSD-2-Clause"),
      source: pin.sdkSourceUrl,
      files: collectLicenseFiles(sdkRoot),
    },
  ];
  for (const [name, version] of Object.entries(selections.versions).sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    const componentRoot = resolve(
      homedir(),
      ".dub/packages",
      name,
      version,
      name,
    );
    components.push({
      name,
      version,
      license: readDubLicense(componentRoot),
      source: `https://code.dlang.org/packages/${name}`,
      files: collectLicenseFiles(componentRoot),
    });
  }
  return components;
}

function renderLicenseBundle(title, components) {
  const groups = new Map();
  for (const component of components) {
    for (const file of component.files) {
      const hash = createHash("sha256").update(file.contents).digest("hex");
      const group = groups.get(hash) ?? { contents: file.contents, references: [] };
      group.references.push(`${component.name} ${component.version} (${file.name})`);
      groups.set(hash, group);
    }
  }
  const inventory = components
    .map(
      (component) =>
        `- ${component.name} ${component.version} | ${component.license} | ${component.source}`,
    )
    .join("\n");
  const licenses = [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(
      ([hash, group]) =>
        [
          "=".repeat(80),
          `SHA-256: ${hash}`,
          "Applies to:",
          ...group.references.sort().map((reference) => `- ${reference}`),
          "",
          group.contents.trimEnd(),
        ].join("\n"),
    )
    .join("\n\n");
  return normalizeText(
    [
      title,
      "",
      "This file is generated from the exact locked dependency sources.",
      "Regenerate it with `npm run licenses:generate`.",
      "",
      "COMPONENT INVENTORY",
      "",
      inventory,
      "",
      "LICENSE AND NOTICE TEXTS",
      "",
      licenses,
    ].join("\n"),
  );
}

const outputs = [
  {
    path: resolve(
      repositoryRoot,
      "packages/inochi2d-web/THIRD_PARTY_LICENSES.txt",
    ),
    contents: renderLicenseBundle(
      "THIRD-PARTY LICENSES FOR inochi2d-web",
      dComponents(),
    ),
  },
  {
    path: resolve(
      repositoryRoot,
      "packages/inochi2d-blog/THIRD_PARTY_LICENSES.txt",
    ),
    contents: renderLicenseBundle(
      "THIRD-PARTY LICENSES FOR inochi2d-blog NATIVE BINARIES",
      cargoComponents(),
    ),
  },
];

for (const output of outputs) {
  if (checkOnly) {
    let existing;
    try {
      existing = readFileSync(output.path, "utf8");
    } catch {
      throw new Error(`missing generated license bundle ${output.path}`);
    }
    if (normalizeText(existing) !== output.contents) {
      throw new Error(
        `${output.path} is stale; run npm run licenses:generate`,
      );
    }
  } else {
    writeFileSync(output.path, output.contents);
    console.log(`Wrote ${output.path}`);
  }
}
