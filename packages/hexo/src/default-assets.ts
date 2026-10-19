import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, rename, unlink } from "node:fs/promises";
import { join, parse, resolve, sep } from "node:path";

import { EnvHttpProxyAgent } from "undici";

export interface DefaultAsset {
  url: string;
  file: string;
  bytes: number;
  sha256: string;
}

const RELEASE_PREFIX = "https://github.com/StarCried/starlite/releases/download/weiguang-v3.0.0-starlite.1/";
const DOWNLOAD_HOSTS = new Set([
  "github.com",
  "objects.githubusercontent.com",
  "release-assets.githubusercontent.com",
]);
const MAX_ASSET_BYTES = 10 * 1024 * 1024;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

class DefaultAssetError extends Error {}

/** Acquire only pinned default assets during generation, never during installation. */
export async function ensureDefaultAssets(
  cacheDirectory: string,
  assets: readonly DefaultAsset[],
  options: { fetch?: typeof globalThis.fetch; timeoutMs?: number } = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 120_000) {
    throw new DefaultAssetError("StarLite default asset timeout is invalid.");
  }
  if (assets.length > 16 || new Set(assets.map((asset) => asset.file)).size !== assets.length) {
    throw new DefaultAssetError("StarLite default asset list is invalid.");
  }
  for (const asset of assets) validateAsset(asset);
  const directory = checkedCachePath(cacheDirectory);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let proxy: EnvHttpProxyAgent | undefined;
  try {
    await ensureDirectory(directory);
    for (const asset of assets) {
      const destination = join(directory, asset.file);
      if (await verifiedCacheFile(destination, asset)) continue;
      if (!options.fetch && !proxy && hasProxyEnvironment()) proxy = new EnvHttpProxyAgent();
      // Node's built-in fetch does not read HTTP(S)_PROXY on supported Node 22.
      // A local dispatcher also honors NO_PROXY without changing other plugins.
      const fetchAsset: typeof globalThis.fetch = options.fetch ?? ((input, init) => globalThis.fetch(
        input,
        proxy ? { ...init, dispatcher: proxy } as RequestInit & { dispatcher: EnvHttpProxyAgent } : init,
      ));
      const contents = await download(asset, fetchAsset, controller.signal);
      await ensureDirectory(directory);
      // Do not replace a symlink installed while the download was in progress.
      await rejectNonRegularFile(destination);
      const temporary = join(directory, `.${asset.file}.${randomUUID()}.tmp`);
      try {
        const handle = await open(temporary, "wx", 0o600);
        try {
          await handle.writeFile(contents);
        } finally {
          await handle.close();
        }
        await ensureDirectory(directory);
        await rejectNonRegularFile(destination);
        await rename(temporary, destination);
      } finally {
        await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== "ENOENT") throw error;
        });
      }
    }
  } catch (error) {
    if (error instanceof DefaultAssetError) throw error;
    throw new DefaultAssetError("StarLite default assets could not be prepared; retry generation when online.");
  } finally {
    clearTimeout(timeout);
    await proxy?.destroy().catch(() => undefined);
  }
}

function hasProxyEnvironment(): boolean {
  return Boolean(
    (process.env.http_proxy ?? process.env.HTTP_PROXY) ||
    (process.env.https_proxy ?? process.env.HTTPS_PROXY),
  );
}

function validateAsset(asset: DefaultAsset): void {
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(asset.file) ||
    /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(asset.file) ||
    asset.file.endsWith(".") ||
    !Number.isSafeInteger(asset.bytes) || asset.bytes < 1 || asset.bytes > MAX_ASSET_BYTES ||
    !/^[a-f0-9]{64}$/.test(asset.sha256)
  ) {
    throw new DefaultAssetError("StarLite default asset metadata is invalid.");
  }
  const url = trustedUrl(asset.url);
  if (
    !url.href.startsWith(RELEASE_PREFIX) || url.search || url.hash ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(url.href.slice(RELEASE_PREFIX.length))
  ) {
    throw new DefaultAssetError("StarLite default asset source is invalid.");
  }
}

function trustedUrl(value: string): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new DefaultAssetError("StarLite default asset source is invalid."); }
  if (url.protocol !== "https:" || url.username || url.password || url.port || !DOWNLOAD_HOSTS.has(url.hostname)) {
    throw new DefaultAssetError("StarLite default asset source is invalid.");
  }
  return url;
}

function checkedCachePath(value: string): string {
  if (!value || value.split(/[\\/]/).some((part) => part === "..")) {
    throw new DefaultAssetError("StarLite default asset cache path is invalid.");
  }
  const directory = resolve(value);
  if (directory === parse(directory).root) throw new DefaultAssetError("StarLite default asset cache path is invalid.");
  return directory;
}

async function ensureDirectory(directory: string): Promise<void> {
  const root = parse(directory).root;
  let current = root;
  for (const part of directory.slice(root.length).split(sep).filter(Boolean)) {
    current = join(current, part);
    try {
      await mkdir(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    const info = await lstat(current);
    if (info.isSymbolicLink() || !info.isDirectory()) {
      throw new DefaultAssetError("StarLite default asset cache must contain only real directories.");
    }
  }
}

async function rejectNonRegularFile(path: string): Promise<boolean> {
  try {
    const info = await lstat(path);
    if (info.isSymbolicLink() || !info.isFile() || info.nlink !== 1) {
      throw new DefaultAssetError("StarLite default asset cache contains an unsafe file.");
    }
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function verifiedCacheFile(path: string, asset: DefaultAsset): Promise<boolean> {
  if (!await rejectNonRegularFile(path)) return false;
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.nlink !== 1 || info.size !== asset.bytes) return false;
    const digest = createHash("sha256");
    const buffer = Buffer.alloc(Math.min(64 * 1024, asset.bytes + 1));
    let length = 0;
    while (length <= asset.bytes) {
      const { bytesRead } = await handle.read(buffer, 0, Math.min(buffer.length, asset.bytes + 1 - length));
      if (bytesRead === 0) break;
      length += bytesRead;
      digest.update(buffer.subarray(0, bytesRead));
    }
    return length === asset.bytes && digest.digest("hex") === asset.sha256;
  } finally {
    await handle.close();
  }
}

async function download(asset: DefaultAsset, fetchAsset: typeof globalThis.fetch, signal: AbortSignal): Promise<Buffer> {
  let url = trustedUrl(asset.url);
  for (let redirects = 0; redirects <= 5; redirects++) {
    const response = await abortable(fetchAsset(url.href, { redirect: "manual", signal }), signal);
    if (response.url) {
      try { trustedUrl(response.url); } catch (error) { discardResponse(response); throw error; }
    }
    if (REDIRECT_STATUSES.has(response.status)) {
      discardResponse(response);
      const location = response.headers.get("location");
      if (!location || redirects === 5) throw new DefaultAssetError("StarLite default asset redirect is invalid.");
      url = trustedUrl(new URL(location, url).href);
      continue;
    }
    if (response.status !== 200 || !response.body) {
      discardResponse(response);
      throw new DefaultAssetError("StarLite default asset download failed; retry generation when online.");
    }
    const contentLength = response.headers.get("content-length");
    if (contentLength !== null && (!/^\d+$/.test(contentLength) || Number(contentLength) !== asset.bytes)) {
      discardResponse(response);
      throw new DefaultAssetError("StarLite default asset size does not match.");
    }
    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    const digest = createHash("sha256");
    let bytes = 0;
    try {
      while (true) {
        const result = await abortable(reader.read(), signal);
        if (result.done) break;
        bytes += result.value.byteLength;
        if (bytes > asset.bytes) throw new DefaultAssetError("StarLite default asset size does not match.");
        const chunk = Buffer.from(result.value);
        chunks.push(chunk);
        digest.update(chunk);
      }
      if (bytes !== asset.bytes) throw new DefaultAssetError("StarLite default asset size does not match.");
      if (digest.digest("hex") !== asset.sha256) throw new DefaultAssetError("StarLite default asset checksum does not match.");
      return Buffer.concat(chunks, bytes);
    } finally {
      void reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  }
  throw new DefaultAssetError("StarLite default asset redirect is invalid.");
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolvePromise, reject) => {
    const aborted = () => reject(new DefaultAssetError("StarLite default asset download timed out; retry generation when online."));
    if (!signal.aborted) signal.addEventListener("abort", aborted, { once: true });
    // Always observe the original promise, including when the shared timeout
    // expired just before starting another request or read.
    promise.then(resolvePromise, reject).finally(() => signal.removeEventListener("abort", aborted));
    if (signal.aborted) aborted();
  });
}

function discardResponse(response: Response): void {
  void response.body?.cancel().catch(() => undefined);
}
