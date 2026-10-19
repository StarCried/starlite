import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { EnvHttpProxyAgent } from "undici";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ensureDefaultAssets, type DefaultAsset } from "../src/default-assets";

const ROOT_URL = "https://github.com/StarCried/starlite/releases/download/weiguang-v3.0.0-starlite.1/";
const contents = Buffer.from("synthetic default model");
const asset: DefaultAsset = {
  url: `${ROOT_URL}example.vrm`,
  file: "example.vrm",
  bytes: contents.length,
  sha256: createHash("sha256").update(contents).digest("hex"),
};
const roots: string[] = [];

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "starlite-default-assets-"));
  roots.push(directory);
  return directory;
}

function bodyResponse(value: Uint8Array = contents, headers?: HeadersInit): Response {
  return new Response(Uint8Array.from(value).buffer, { status: 200, ...(headers ? { headers } : {}) });
}

afterEach(() => {
  for (const directory of roots.splice(0)) rmSync(directory, { recursive: true, force: true });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("default model asset cache", () => {
  it("downloads verified bytes once and uses a validated cache completely offline", async () => {
    const directory = join(temporaryDirectory(), "node_modules", ".cache", "hexo-starlite", "version");
    const fetchAsset = vi.fn<typeof fetch>().mockResolvedValueOnce(bodyResponse());
    await ensureDefaultAssets(directory, [asset], { fetch: fetchAsset });
    expect(readFileSync(join(directory, asset.file))).toEqual(contents);
    expect(readdirSync(directory)).toEqual([asset.file]);
    expect(fetchAsset).toHaveBeenCalledWith(asset.url, expect.objectContaining({ redirect: "manual", signal: expect.any(AbortSignal) }));
    const offline = vi.fn<typeof fetch>().mockRejectedValue(new Error("offline"));
    await ensureDefaultAssets(directory, [asset], { fetch: offline });
    expect(offline).not.toHaveBeenCalled();
  });

  it("rehashes equal-size cache contents on every generation and replaces corrupted bytes", async () => {
    const directory = temporaryDirectory();
    writeFileSync(join(directory, asset.file), Buffer.alloc(contents.length, 33));
    const fetchAsset = vi.fn<typeof fetch>().mockResolvedValue(bodyResponse());
    await ensureDefaultAssets(directory, [asset], { fetch: fetchAsset });
    expect(fetchAsset).toHaveBeenCalledOnce();
    expect(readFileSync(join(directory, asset.file))).toEqual(contents);
  });

  it("checks every asset and keeps already valid cache when a later download fails", async () => {
    const directory = temporaryDirectory();
    const second = { ...asset, url: `${ROOT_URL}LICENSE.txt`, file: "LICENSE.txt" };
    const fetchAsset = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(bodyResponse())
      .mockRejectedValueOnce(new Error("offline"));
    await expect(ensureDefaultAssets(directory, [asset, second], { fetch: fetchAsset })).rejects.toThrow(/retry generation/);
    expect(readdirSync(directory)).toEqual([asset.file]);
    const retry = vi.fn<typeof fetch>().mockResolvedValueOnce(bodyResponse());
    await ensureDefaultAssets(directory, [asset, second], { fetch: retry });
    expect(retry).toHaveBeenCalledOnce();
    expect(readdirSync(directory).sort()).toEqual([second.file, asset.file].sort());
  });

  it.each([
    ["wrong hash", () => bodyResponse(Buffer.alloc(contents.length, 32)), /checksum/],
    ["too short", () => bodyResponse(contents.subarray(1)), /size/],
    ["too long", () => bodyResponse(Buffer.concat([contents, contents])), /size/],
    ["wrong content length", () => bodyResponse(contents, { "content-length": "999" }), /size/],
    ["HTTP error", () => new Response("no", { status: 503 }), /download failed/],
  ])("rejects %s without leaving a partial cache file", async (_label, response, message) => {
    const directory = temporaryDirectory();
    await expect(ensureDefaultAssets(directory, [asset], { fetch: vi.fn<typeof fetch>().mockResolvedValue(response()) })).rejects.toThrow(message);
    expect(readdirSync(directory)).toEqual([]);
  });

  it("bounds a streamed body before consuming the remaining chunks", async () => {
    const directory = temporaryDirectory();
    const cancelled = vi.fn();
    let chunks = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) { chunks++; controller.enqueue(contents); },
      cancel: cancelled,
    });
    const fetchAsset = vi.fn<typeof fetch>().mockResolvedValue(new Response(stream));
    await expect(ensureDefaultAssets(directory, [asset], { fetch: fetchAsset })).rejects.toThrow(/size/);
    expect(chunks).toBeLessThanOrEqual(3);
    expect(cancelled).toHaveBeenCalledOnce();
    expect(readdirSync(directory)).toEqual([]);
  });

  it("follows bounded HTTPS release redirects and verifies their bytes", async () => {
    const directory = temporaryDirectory();
    const destination = "https://release-assets.githubusercontent.com/github-production-release-asset/example?signature=private";
    const fetchAsset = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: destination } }))
      .mockResolvedValueOnce(bodyResponse());
    await ensureDefaultAssets(directory, [asset], { fetch: fetchAsset });
    expect(fetchAsset).toHaveBeenNthCalledWith(2, destination, expect.objectContaining({ redirect: "manual" }));
    expect(readFileSync(join(directory, asset.file))).toEqual(contents);
  });

  it.each([
    "https://attacker.example/model.vrm?secret=value",
    "http://release-assets.githubusercontent.com/model.vrm",
    "https://secret@github.com/model.vrm",
    "https://release-assets.githubusercontent.com:444/model.vrm",
  ])("rejects an unsafe redirect without requesting it: %s", async (location) => {
    const directory = temporaryDirectory();
    const fetchAsset = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 302, headers: { location } }));
    await expect(ensureDefaultAssets(directory, [asset], { fetch: fetchAsset })).rejects.toThrow("StarLite default asset source is invalid.");
    expect(fetchAsset).toHaveBeenCalledOnce();
    expect(readdirSync(directory)).toEqual([]);
  });

  it("rejects redirect loops", async () => {
    const directory = temporaryDirectory();
    const fetchAsset = vi.fn<typeof fetch>().mockImplementation(async () => new Response(null, { status: 302, headers: { location: asset.url } }));
    await expect(ensureDefaultAssets(directory, [asset], { fetch: fetchAsset })).rejects.toThrow(/redirect/);
    expect(fetchAsset).toHaveBeenCalledTimes(6);
    expect(readdirSync(directory)).toEqual([]);
  });

  it("rejects an unexpected final response URL even if a fetch implementation follows redirects", async () => {
    const directory = temporaryDirectory();
    const response = bodyResponse();
    Object.defineProperty(response, "url", { value: "https://attacker.example/model.vrm" });
    await expect(ensureDefaultAssets(directory, [asset], { fetch: vi.fn<typeof fetch>().mockResolvedValue(response) })).rejects.toThrow(/source is invalid/);
    expect(readdirSync(directory)).toEqual([]);
  });

  it.each(["../outside.vrm", "nested/model.vrm", "nested\\model.vrm", ".", "C:outside.vrm", "CON", "model."])("rejects unsafe filenames: %s", async (file) => {
    const fetchAsset = vi.fn<typeof fetch>();
    await expect(ensureDefaultAssets(temporaryDirectory(), [{ ...asset, file }], { fetch: fetchAsset })).rejects.toThrow(/metadata/);
    expect(fetchAsset).not.toHaveBeenCalled();
  });

  it("rejects arbitrary source URLs and invalid metadata before requesting assets", async () => {
    const fetchAsset = vi.fn<typeof fetch>();
    const directory = temporaryDirectory();
    for (const invalid of [
      { ...asset, url: "https://github.com/another/project/releases/download/version/model.vrm" },
      { ...asset, url: `${ROOT_URL}example.vrm?token=secret` },
      { ...asset, bytes: Number.POSITIVE_INFINITY },
      { ...asset, bytes: 11 * 1024 * 1024 },
      { ...asset, sha256: "not a checksum" },
    ]) {
      await expect(ensureDefaultAssets(directory, [invalid], { fetch: fetchAsset })).rejects.toThrow(/invalid/);
    }
    await expect(ensureDefaultAssets(directory, [asset, asset], { fetch: fetchAsset })).rejects.toThrow(/list/);
    await expect(ensureDefaultAssets(`${directory}/../outside`, [asset], { fetch: fetchAsset })).rejects.toThrow(/path/);
    expect(fetchAsset).not.toHaveBeenCalled();
  });

  it.each(["file", "directory", "ancestor"])("rejects symlink %s instead of reading or writing through it", async (kind) => {
    const root = temporaryDirectory();
    const target = join(root, "target");
    mkdirSync(target);
    writeFileSync(join(target, asset.file), contents);
    const directory = join(root, "cache");
    if (kind === "file") {
      mkdirSync(directory);
      symlinkSync(join(target, asset.file), join(directory, asset.file));
    } else {
      symlinkSync(target, directory, "dir");
    }
    const cache = kind === "ancestor" ? join(directory, "version") : directory;
    const fetchAsset = vi.fn<typeof fetch>();
    await expect(ensureDefaultAssets(cache, [asset], { fetch: fetchAsset })).rejects.toThrow(/unsafe|real directories/);
    expect(fetchAsset).not.toHaveBeenCalled();
    expect(readFileSync(join(target, asset.file))).toEqual(contents);
    expect(readdirSync(target)).toEqual([asset.file]);
  });

  it("does not expose upstream errors or authorization URLs", async () => {
    const directory = temporaryDirectory();
    const fetchAsset = vi.fn<typeof fetch>().mockRejectedValue(new Error("https://example.com/?token=secret"));
    await expect(ensureDefaultAssets(directory, [asset], { fetch: fetchAsset })).rejects.toThrow("StarLite default assets could not be prepared; retry generation when online.");
  });

  it("times out a fetch that ignores AbortSignal, and a later generation can retry", async () => {
    const directory = temporaryDirectory();
    const pending = vi.fn<typeof fetch>().mockImplementation(() => new Promise(() => undefined));
    await expect(ensureDefaultAssets(directory, [asset], { fetch: pending, timeoutMs: 20 })).rejects.toThrow(/timed out/);
    expect(readdirSync(directory)).toEqual([]);
    await ensureDefaultAssets(directory, [asset], { fetch: vi.fn<typeof fetch>().mockResolvedValue(bodyResponse()) });
    expect(readFileSync(join(directory, asset.file))).toEqual(contents);
  });

  it("times out a stalled streamed body and cancels it", async () => {
    const directory = temporaryDirectory();
    const cancelled = vi.fn();
    const body = new ReadableStream<Uint8Array>({ start() {}, cancel: cancelled });
    const fetchAsset = vi.fn<typeof fetch>().mockResolvedValue(new Response(body));
    await expect(ensureDefaultAssets(directory, [asset], { fetch: fetchAsset, timeoutMs: 20 })).rejects.toThrow(/timed out/);
    expect(cancelled).toHaveBeenCalledOnce();
    expect(readdirSync(directory)).toEqual([]);
  });

  it("uses one timeout budget across redirects and assets", async () => {
    const directory = temporaryDirectory();
    const fetchAsset = vi.fn<typeof fetch>().mockImplementation(async () => {
      await new Promise((complete) => setTimeout(complete, 20));
      return new Response(null, { status: 302, headers: { location: asset.url } });
    });
    await expect(ensureDefaultAssets(directory, [asset], { fetch: fetchAsset, timeoutMs: 30 })).rejects.toThrow(/timed out/);
    expect(fetchAsset).toHaveBeenCalledTimes(2);
    expect(readdirSync(directory)).toEqual([]);
  });

  it("passes a scoped environment proxy dispatcher to global fetch and destroys it after use", async () => {
    const directory = temporaryDirectory();
    vi.stubEnv("http_proxy", "");
    vi.stubEnv("https_proxy", "");
    vi.stubEnv("HTTPS_PROXY", "http://proxy.invalid:8080");
    // Lowercase variables take precedence, as they do in EnvHttpProxyAgent.
    vi.stubEnv("https_proxy", "http://user:synthetic-password@proxy.invalid:8080");
    vi.stubEnv("NO_PROXY", "localhost,127.0.0.1");
    const destroy = vi.spyOn(EnvHttpProxyAgent.prototype, "destroy");
    const fetchAsset = vi.fn<typeof fetch>().mockResolvedValue(bodyResponse());
    vi.stubGlobal("fetch", fetchAsset);
    await ensureDefaultAssets(directory, [asset]);
    const init = fetchAsset.mock.calls[0]?.[1] as RequestInit & { dispatcher?: EnvHttpProxyAgent };
    expect(init.dispatcher).toBeInstanceOf(EnvHttpProxyAgent);
    expect(destroy.mock.contexts).toContain(init.dispatcher);
    await destroy.mock.results[0]?.value;
    expect(readFileSync(join(directory, asset.file))).toEqual(contents);
  });

  it("bypasses proxy setup for an injected fetch and a valid offline cache", async () => {
    const directory = temporaryDirectory();
    vi.stubEnv("https_proxy", "not a proxy URL");
    const destroy = vi.spyOn(EnvHttpProxyAgent.prototype, "destroy");
    await ensureDefaultAssets(directory, [asset], { fetch: vi.fn<typeof fetch>().mockResolvedValue(bodyResponse()) });
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(new Error("offline")));
    await ensureDefaultAssets(directory, [asset]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(destroy).not.toHaveBeenCalled();
  });

  it("destroys proxy connections after download errors without exposing proxy credentials", async () => {
    const directory = temporaryDirectory();
    vi.stubEnv("https_proxy", "http://synthetic-user:synthetic-secret@proxy.invalid:8080");
    const destroy = vi.spyOn(EnvHttpProxyAgent.prototype, "destroy");
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(new Error(process.env.https_proxy)));
    await expect(ensureDefaultAssets(directory, [asset])).rejects.toThrow("StarLite default assets could not be prepared; retry generation when online.");
    expect(destroy).toHaveBeenCalled();
    await destroy.mock.results[0]?.value;
    expect(readdirSync(directory)).toEqual([]);
  });
});
