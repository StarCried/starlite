import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const workspace = resolve(import.meta.dirname, "..");
const payload = await readFile(resolve(workspace, "fixtures/synthetic-puppet.json"));
const payloadLength = Buffer.allocUnsafe(4);
payloadLength.writeUInt32BE(payload.length);
const textureCount = Buffer.alloc(4);
const validInp = Buffer.concat([
  Buffer.from("TRNSRTS\0", "binary"),
  payloadLength,
  payload,
  Buffer.from("TEX_SECT", "ascii"),
  textureCount,
]);
const corruptInp = Buffer.from("not-an-inochi2d-puppet", "utf8");

const destinations = [
  resolve(workspace, "examples/vanilla/public/models"),
  resolve(workspace, "examples/hexo/source/models"),
];

for (const directory of destinations) {
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, "puppet.inp"), validInp);
  await writeFile(resolve(directory, "corrupt.inp"), corruptInp);
}
