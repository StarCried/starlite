import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
const root = new URL("../", import.meta.url);
const source = process.argv[2];
if (!source) throw new Error("usage: node tools/embed-builtin-motions.mjs <reviewed VRMA directory>");
const provenance = JSON.parse(await readFile(new URL("packages/vrm/BUNDLED_MOTIONS.json", root), "utf8"));
const data = {};
for (const clip of provenance.clips) {
  const bytes = await readFile(resolve(source, clip.name.replace(/^StarLite/, "") + ".vrma"));
  if (bytes.length !== clip.bytes || createHash("sha256").update(bytes).digest("hex") !== clip.sha256) throw new Error(`motion source mismatch: ${clip.name}`);
  data[clip.name] = deflateSync(bytes, { level: 9 }).toString("base64");
}
await writeFile(new URL("packages/vrm/src/builtin-motion-data.ts", root), "// Losslessly deflated VRMA. See BUNDLED_MOTIONS.json and tools/embed-builtin-motions.mjs.\nexport const builtinMotionDeflate = " + JSON.stringify(data, null, 2) + " as const;\n");
