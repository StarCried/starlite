import { access, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const publicDirectory = resolve(import.meta.dirname, "../public");
const html = await readFile(resolve(publicDirectory, "index.html"), "utf8");
const match = html.match(/inochi2d-widget\/([a-f0-9]{12})\/index\.js/u);

if (!match) {
  throw new Error("generated HTML does not reference a content-hashed widget entry");
}

const assetDirectory = resolve(publicDirectory, "inochi2d-widget", match[1]);
await access(resolve(assetDirectory, "index.js"));
await access(resolve(assetDirectory, "widget.css"));
await access(resolve(assetDirectory, "generated/runtime_bg.wasm"));

const siblings = await readdir(resolve(publicDirectory, "inochi2d-widget"));
if (siblings.length !== 1) {
  throw new Error(`expected one hashed widget asset directory, found ${siblings.length}`);
}
