import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateArchives } from './release.mjs';

const repository = 'StarCried/starlite';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

// Reconcile one reviewed batch; the remote draft is the retry checkpoint.
export async function reconcileRelease(manifest, directory, { phase, token, fetcher = fetch } = {}) {
  assert(['preflight', 'publish', 'verify'].includes(phase), 'Expected preflight, publish or verify');
  assert.equal(manifest.repository, repository);
  const api = `https://api.github.com/repos/${repository}`;
  async function request(url, { method = 'GET', body, binary = false, anonymous = false } = {}) {
    const headers = { Accept: binary ? 'application/octet-stream' : 'application/vnd.github+json' };
    if (!anonymous) {
      assert(['api.github.com', 'uploads.github.com'].includes(new URL(url).hostname), 'Unexpected authenticated GitHub host');
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    if (body !== undefined) headers['Content-Type'] = Buffer.isBuffer(body) ? 'application/octet-stream' : 'application/json';
    const response = await fetcher(url, { method, headers, body: body === undefined ? undefined : Buffer.isBuffer(body) ? body : JSON.stringify(body), credentials: 'omit', signal: AbortSignal.timeout(60000) });
    if (response.status === 404 && method === 'GET') return undefined;
    assert(response.ok, `GitHub ${method} failed: HTTP ${response.status}`);
    return binary ? Buffer.from(await response.arrayBuffer()) : response.json();
  }
  async function tagTarget() {
    const ref = await request(`${api}/git/ref/tags/${encodeURIComponent(manifest.tag)}`);
    let object = ref?.object;
    while (object?.type === 'tag') object = (await request(`${api}/git/tags/${object.sha}`)).object;
    if (object) assert(object.type === 'commit' && object.sha === manifest.sourceRevision, 'Existing tag targets different source');
    return object;
  }
  // A tag may exist without a release: check it before any create/upload.
  const ref = await tagTarget();
  const source = await request(`${api}/commits/${manifest.sourceRevision}`);
  assert(source?.sha === manifest.sourceRevision, 'Reviewed source must be public before publishing');
  const names = [...manifest.packages.map(pkg => pkg.file), 'SOURCE_REVISION', 'SHA256SUMS', 'release-manifest.json'];
  assert.equal(new Set(names).size, names.length);
  const assets = names.map(name => {
    assert.equal(name, basename(name));
    return { name, bytes: readFileSync(join(directory, name)) };
  });
  assert.equal(assets.find(asset => asset.name === 'SOURCE_REVISION').bytes.toString('utf8').trim(), manifest.sourceRevision);
  assert.equal(assets.find(asset => asset.name === 'SHA256SUMS').bytes.toString('utf8'), manifest.packages.map(pkg => `${pkg.sha256}  ${pkg.file}`).join('\n') + '\n', 'Checksum list differs from reviewed packages');
  let release = await request(`${api}/releases/tags/${encodeURIComponent(manifest.tag)}`);
  // REST's by-tag endpoint omits drafts whose tag has not been created yet.
  if (!release && token) {
    for (let page = 1; ; page++) {
      const releases = await request(`${api}/releases?per_page=100&page=${page}`);
      release = releases.find(item => item.tag_name === manifest.tag);
      if (release || releases.length < 100) break;
    }
  }
  if (release?.draft && !ref) assert.equal(release.target_commitish, manifest.sourceRevision, 'Pending draft targets different source');
  async function checkAssets(current, anonymous) {
    for (const asset of current.assets) {
      const expected = assets.find(item => item.name === asset.name);
      assert(expected, `Unexpected release asset: ${asset.name}`);
      const bytes = await request(anonymous ? asset.browser_download_url : `${api}/releases/assets/${asset.id}`, { binary: true, anonymous });
      assert(bytes && bytes.length === expected.bytes.length && sha256(bytes) === sha256(expected.bytes), `Release asset conflicts: ${asset.name}`);
    }
  }
  if (release) {
    await checkAssets(release, !release.draft);
    if (!release.draft) assert.equal(release.assets.length, assets.length, 'Published release is incomplete');
  }
  if (phase === 'preflight') return { tagExists: Boolean(ref), releaseExists: Boolean(release), draft: release?.draft ?? false };
  if (phase === 'publish') {
    assert(token, 'Set GH_TOKEN or authenticate GitHub CLI before publishing');
    if (release && !release.draft) {
      assert.equal(release.assets.length, assets.length, 'Published release is incomplete; do not mutate immutable release assets');
    } else {
      if (!release) release = await request(`${api}/releases`, { method: 'POST', body: { tag_name: manifest.tag, target_commitish: manifest.sourceRevision, name: `${manifest.group === 'cli' ? 'Inochi2D CLI' : 'StarLite'} ${manifest.version}`, body: manifest.notes ?? `Source: ${manifest.sourceRevision}\n\n${manifest.packages.map(pkg => `- ${pkg.name}@${pkg.version}`).join('\n')}`, draft: true, prerelease: manifest.channel !== 'latest' } });
      for (const asset of assets.filter(item => !release.assets.some(remote => remote.name === item.name))) {
        const url = new URL(release.upload_url.replace(/\{.*$/u, ''));
        url.searchParams.set('name', asset.name);
        await request(url.href, { method: 'POST', body: asset.bytes });
      }
      release = await request(`${api}/releases/${release.id}`);
      await checkAssets(release, false);
      assert.equal(release.assets.length, assets.length, 'Draft is incomplete');
      release = await request(`${api}/releases/${release.id}`, { method: 'PATCH', body: { draft: false, make_latest: manifest.group === 'cli' ? 'false' : 'legacy' } });
    }
  }
  assert(release && !release.draft && release.tag_name === manifest.tag, 'No published release for this source');
  assert(await tagTarget(), 'Published source tag is missing');
  assert.equal(release.assets.length, assets.length, 'Public release is incomplete');
  await checkAssets(release, true);
  return { repository, tag: manifest.tag, sourceRevision: manifest.sourceRevision, files: assets.map(({ name, bytes }) => ({ name, sha256: sha256(bytes) })), anonymousDownloads: true };
}

async function main() {
  const [phase, flag, output, ...extra] = process.argv.slice(2);
  assert(flag === '--out' && output && extra.length === 0, 'Usage: node tools/release-github.mjs preflight|publish|verify --out directory');
  const directory = resolve(output), root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const manifest = validateArchives(root, directory);
  let token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  if (!token) {
    try { token = execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }).trim(); } catch { /* Public reads need no CLI login. */ }
  }
  const result = await reconcileRelease(manifest, directory, { phase, token });
  if (phase !== 'preflight') writeFileSync(join(directory, 'github-verification.json'), JSON.stringify({ checkedAt: new Date().toISOString(), ...result }, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
