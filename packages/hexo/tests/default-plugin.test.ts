import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerHexoWidget } from "../src/index";
import { ensureDefaultAssets } from "../src/default-assets";
import { WEIGUANG_ASSETS } from "../src/default-preset";
import type { HexoLike } from "../src/types";
// @ts-expect-error artwork-free JavaScript fixture
import { model, glb } from "../../../tests/fixtures/vrm.mjs";

vi.mock("../src/default-assets", () => ({ ensureDefaultAssets: vi.fn() }));
vi.mock("../src/default-preset", async importOriginal => {
  const actual = await importOriginal<typeof import("../src/default-preset")>();
  return {
    ...actual,
    resolveDefaultPreset: (...args: Parameters<typeof actual.resolveDefaultPreset>) => {
      const result = actual.resolveDefaultPreset(...args);
      // This lifecycle fixture has no character artwork. The real downloader's
      // exact release pin is independently covered by default-assets tests.
      if (!args[0]?.publication?.sourceSha256 && result.publication) delete result.publication.sourceSha256;
      return result;
    },
  };
});

const roots: string[] = [];
const Hexo = createRequire(import.meta.url)("hexo");
const names = ["Idle", "GentleWave", "HighFive", "HighWave", "StumbleAndRecover", "PlayfulScare", "RaisedHandWave", "Stretch", "BackStretch", "AbsentmindedWait", "Thinking", "HaveAnIdea", "AwkwardHeadScratch"];
function animatedModel(): Buffer {
  const original = model(), size = original.readUInt32LE(12);
  const json = JSON.parse(original.subarray(20, 20 + size).toString());
  const binary = Buffer.concat([original.subarray(28 + size), Buffer.from(new Float32Array([0, 1, 0, 0, 0, 1, 0, 0, .15, Math.sqrt(1 - .15 ** 2)]).buffer)]);
  const offset = json.buffers[0].byteLength, view = json.bufferViews.length, accessor = json.accessors.length;
  json.buffers[0].byteLength = binary.byteLength;
  json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: 8 }, { buffer: 0, byteOffset: offset + 8, byteLength: 32 });
  json.accessors.push({ bufferView: view, componentType: 5126, type: "SCALAR", count: 2, min: [0], max: [1] }, { bufferView: view + 1, componentType: 5126, type: "VEC4", count: 2 });
  json.animations = names.map(name => ({ name, samplers: [{ input: accessor, output: accessor + 1 }], channels: [{ sampler: 0, target: { node: 2, path: "rotation" } }] }));
  return glb(json, binary);
}
function blog(config: HexoLike["config"] = {}) {
  const root = mkdtempSync(join(tmpdir(), "starlite-default-plugin-")); roots.push(root);
  const registrations: { prepare?: () => Promise<void>; generate?: () => Array<{ path: string; data: Buffer }> | undefined; inject?: () => string | undefined } = {};
  const hexo: HexoLike = {
    base_dir: root, config,
    extend: {
      filter: { register: (name: string, callback: any) => {
        if (name === "before_generate") registrations.prepare = callback;
        else if (name === "after_render:html") registrations.inject = () => {
          const source = "<!doctype html><html><body></body></html>", result = callback(source);
          return result === source ? undefined : result;
        };
      } },
      generator: { register: (_name, callback) => { registrations.generate = callback; } },
      injector: { register: (_name, callback) => { registrations.inject = callback; } },
    },
    log: { warn: vi.fn(), info: vi.fn() },
  };
  registerHexoWidget(hexo);
  return { root, hexo, registrations };
}
beforeEach(() => {
  vi.mocked(ensureDefaultAssets).mockReset().mockImplementation(async (directory, assets) => {
    mkdirSync(directory, { recursive: true });
    for (const [index, asset] of assets.entries()) writeFileSync(join(directory, asset.file), index === 0 ? animatedModel() : "Synthetic model notice");
  });
});
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

it("prepares the full default experience with no configuration and preserves the user's config", async () => {
  const config = { root: "/blog/" }, site = blog(config);
  expect(ensureDefaultAssets).not.toHaveBeenCalled();
  expect(site.registrations.inject!()).toBeUndefined();
  await site.registrations.prepare!();
  const routes = site.registrations.generate!()!, html = site.registrations.inject!()!;
  expect(ensureDefaultAssets).toHaveBeenCalledOnce();
  expect(config).toEqual({ root: "/blog/" });
  expect(routes.filter(route => route.path.endsWith(".vrm"))).toHaveLength(1);
  expect(routes.some(route => route.path.endsWith("LICENSE-Weiguang.md"))).toBe(true);
  expect(routes.some(route => route.path.endsWith("ASSET-SOURCES.md"))).toBe(true);
  expect(routes.some(route => /\.(vrma|wasm)$/.test(route.path))).toBe(false);
  expect(html).toContain('"model":"/blog/vrm-model/');
  expect(html).toContain('"embeddedAnimations":' + JSON.stringify(names));
  expect(html).toContain('"neutralAnimation":"Idle"');
  expect(html).toContain('"fps":60'); expect(html).toContain('"maxDevicePixelRatio":1');
  expect(html).toContain('"passThrough":true'); expect(html).toContain('"breakpoint":900');
  expect(html).toContain("right:112px;bottom:160px");
  expect(html).toContain('"RaisedHandWave":'); expect(html).toContain('"StumbleAndRecover":');
});

it("explicit disable downloads nothing and emits no companion resources", async () => {
  const site = blog({ starlite: { enable: false } });
  await site.registrations.prepare!();
  expect(ensureDefaultAssets).not.toHaveBeenCalled();
  expect(site.registrations.generate!()).toBeUndefined(); expect(site.registrations.inject!()).toBeUndefined();
});

it("continues normal generation after acquisition failure and recovers on the next generation", async () => {
  const site = blog(); vi.mocked(ensureDefaultAssets).mockRejectedValueOnce(new Error("offline"));
  await expect(site.registrations.prepare!()).resolves.toBeUndefined();
  expect(site.registrations.generate!()).toBeUndefined(); expect(site.registrations.inject!()).toBeUndefined();
  expect(site.hexo.log.warn).toHaveBeenCalledWith(expect.stringContaining("博客继续生成"));
  await site.registrations.prepare!();
  expect(site.registrations.generate!()!.some(route => route.path.endsWith(".vrm"))).toBe(true);
  expect(site.registrations.inject!()).toContain("data-starlite-widget-host");
});

it("a custom VRM skips the default download and all character-specific action/dialogue defaults", async () => {
  const site = blog({ starlite: { model: "./avatar.vrm", publication: { confirm: true, allowRedistribution: true }, dialogue: { click: { lines: ["My avatar"] } } } });
  writeFileSync(join(site.root, "avatar.vrm"), model());
  await site.registrations.prepare!();
  const html = site.registrations.inject!()!;
  expect(ensureDefaultAssets).not.toHaveBeenCalled();
  expect(html).toContain('"backend":"vrm"'); expect(html).toContain("My avatar");
  expect(html).not.toContain("StumbleAndRecover"); expect(html).not.toContain("RaisedHandWave");
  expect(html).toContain('"fps":30'); expect(html).toContain("right:16px;bottom:0px");
});

it("custom models retain explicit publication checks", async () => {
  const site = blog({ starlite: { model: "./avatar.vrm" } });
  writeFileSync(join(site.root, "avatar.vrm"), model()); await site.registrations.prepare!();
  expect(() => site.registrations.generate!()).toThrow("publication.confirm");
  expect(ensureDefaultAssets).not.toHaveBeenCalled();
});

it("default preset accepts partial display and sentence overrides without mutating them", async () => {
  const input = { position: { bottom: 80 }, render: { fps: 30 as const }, dialogue: { click: { lines: ["Hello reader"] } } };
  const site = blog({ starlite: input }); const before = structuredClone(input);
  await site.registrations.prepare!(); const html = site.registrations.inject!()!;
  expect(html).toContain("right:112px;bottom:80px"); expect(html).toContain('"fps":30');
  expect(html).toContain("Hello reader"); expect(input).toEqual(before);
});

it("rejects invalid placement and explicit pin overrides before emitting default assets", async () => {
  const site = blog({ starlite: { position: { bottom: Number.NaN } } });
  await expect(site.registrations.prepare!()).rejects.toThrow("starlite.position");
  const pinned = blog({ starlite: { publication: { sourceSha256: "0".repeat(64) } } });
  await expect(pinned.registrations.prepare!()).rejects.toThrow("sourceSha256");
});

it("shares concurrent preparation and rechecks once per later generation", async () => {
  const site = blog();
  const first = site.registrations.prepare!(), second = site.registrations.prepare!();
  expect(first).toBe(second); await Promise.all([first, second]);
  expect(ensureDefaultAssets).toHaveBeenCalledOnce();
  await site.registrations.prepare!(); expect(ensureDefaultAssets).toHaveBeenCalledTimes(2);
});

it("changing to a custom model on the next generation cannot reuse cached default routes", async () => {
  const site = blog(); await site.registrations.prepare!();
  site.hexo.config.starlite = { model: "./avatar.vrm", publication: { confirm: true, allowRedistribution: true } };
  writeFileSync(join(site.root, "avatar.vrm"), model()); await site.registrations.prepare!();
  const routes = site.registrations.generate!()!;
  expect(routes.some(route => route.path.endsWith(WEIGUANG_ASSETS[1]!.file))).toBe(false);
  expect(site.registrations.inject!()).not.toContain("StumbleAndRecover");
  expect(ensureDefaultAssets).toHaveBeenCalledOnce();
});

it.each([
  [null, "configuration object"],
  [{ enable: "yes" }, "starlite.enable"],
  [{ backend: "unknown" }, "unknown model backend"],
  [{ model: "" }, "starlite.model"],
  [{ model: null }, "starlite.model"],
  [{ model: 123 }, "starlite.model"],
  [{ bundle: " " }, "starlite.bundle"],
  [{ bundle: false }, "starlite.bundle"],
])("rejects malformed configuration before any default download: %j", async (input, message) => {
  const site = blog({ starlite: input as any });
  await expect(site.registrations.prepare!()).rejects.toThrow(message);
  expect(ensureDefaultAssets).not.toHaveBeenCalled();
});

it("a real Hexo 7 render includes the asynchronously prepared default on its first generation", async () => {
  const root = mkdtempSync(join(tmpdir(), "starlite-default-real-hexo-")); roots.push(root);
  mkdirSync(join(root, "source")); mkdirSync(join(root, "themes/preview/layout"), { recursive: true });
  writeFileSync(join(root, "_config.yml"), "title: Default preset\ntheme: preview\n");
  writeFileSync(join(root, "source/index.html"), "---\nlayout: page\n---\n<h1>Article first</h1>");
  writeFileSync(join(root, "themes/preview/layout/page.njk"), '<!doctype html><html><head><title>Article</title></head><body>{{ page.content | safe }}</body></html>');
  // Isolate source registration; the packed-install smoke covers discovery.
  const hexo = new Hexo(root, { silent: true, safe: true }); hexo.env.init = true;
  try {
    await hexo.init(); registerHexoWidget(hexo);
    expect(hexo.config.starlite).toBeUndefined();
    await hexo.call("generate");
    const html = readFileSync(join(root, "public/index.html"), "utf8");
    expect(html).toContain("Article first"); expect(html).toContain("__hexoStarLiteWidgetState");
    expect(html.match(/<div data-starlite-widget-host/g)).toHaveLength(1);
    expect(html).toContain("right:112px;bottom:160px");
    // Hexo registers after_render:html under its _after_html_render alias.
    const twice = await hexo.execFilter("_after_html_render", html, { context: hexo, args: [{}] });
    expect(twice.match(/<div data-starlite-widget-host/g)).toHaveLength(1);
    expect(await hexo.execFilter("_after_html_render", "<p>Article fragment</p>", { context: hexo, args: [{}] })).toBe("<p>Article fragment</p>");
    hexo.config.starlite = { enable: false };
    expect((await hexo.execFilter("_after_html_render", html, { context: hexo, args: [{}] })).includes("__hexoStarLiteWidgetState")).toBe(false);
  } finally { await hexo.exit(); }
});
