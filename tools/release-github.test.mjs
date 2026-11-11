import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { reconcileRelease } from './release-github.mjs';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const source = 'a'.repeat(40);
const base = { repository: 'StarCried/starlite', tag: 'v0.2.0', sourceRevision: source, version: '0.2.0', channel: 'latest', group: 'public' };

test('a conflicting tag without a release stops before uploads', async () => {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url, method: init.method });
    return Response.json({ object: { type: 'commit', sha: 'b'.repeat(40) } });
  };
  await assert.rejects(reconcileRelease(base, 'unused', { phase: 'publish', token: 'fixture', fetcher }), /different source/u);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'GET');
});

test('interrupted uploads resume the draft; publication and anonymous verification follow completeness', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'starlite-github-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const bytes = Buffer.from('reviewed package fixture');
  const manifest = { ...base, packages: [{ name: 'fixture', version: '0.2.0', file: 'fixture.tgz', sha256: sha256(bytes) }] };
  writeFileSync(join(directory, 'fixture.tgz'), bytes);
  writeFileSync(join(directory, 'SOURCE_REVISION'), source + '\n');
  writeFileSync(join(directory, 'SHA256SUMS'), `${sha256(bytes)}  fixture.tgz\n`);
  writeFileSync(join(directory, 'release-manifest.json'), JSON.stringify(manifest));
  const stored = new Map([[1, bytes]]);
  const asset = (id, name) => ({ id, name, browser_download_url: `https://github.com/StarCried/starlite/releases/download/v0.2.0/${name}` });
  const release = { id: 7, tag_name: base.tag, target_commitish: source, draft: true, assets: [asset(1, 'fixture.tgz')], upload_url: 'https://uploads.github.com/repos/StarCried/starlite/releases/7/assets{?name,label}' };
  const uploads = [], publicReads = [];
  let interrupt = true, published = 0;
  const fetcher = async (address, init) => {
    const url = new URL(address);
    if (url.pathname.includes('/git/ref/tags/')) return release.draft ? new Response('', {status: 404}) : Response.json({ object: { type: 'commit', sha: source } });
    if (url.pathname.includes('/commits/')) return Response.json({ sha: source });
    if (url.pathname.includes('/releases/tags/') && release.draft) return new Response('', {status: 404});
    if (url.searchParams.has('page')) return Response.json([release]);
    if (url.hostname === 'uploads.github.com') {
      assert(release.draft, 'No writes to a published release');
      const name = url.searchParams.get('name');
      if (name === 'SHA256SUMS' && interrupt) { interrupt = false; throw Error('simulated interrupted upload'); }
      assert(!uploads.includes(name), 'Existing uploads must not repeat');
      uploads.push(name);
      const id = stored.size + 1;
      stored.set(id, Buffer.from(init.body)); release.assets.push(asset(id, name));
      return Response.json(release.assets.at(-1));
    }
    if (url.hostname === 'github.com') {
      assert.equal(init.headers.Authorization, undefined);
      const found = release.assets.find(item => address === item.browser_download_url);
      publicReads.push(found.name);
      return new Response(stored.get(found.id));
    }
    if (url.pathname.includes('/releases/assets/')) return new Response(stored.get(Number(url.pathname.split('/').at(-1))));
    if (init.method === 'PATCH') {
      assert.equal(release.assets.length, 4, 'Every artifact must exist before publishing');
      published++; release.draft = false;
      return Response.json(release);
    }
    return Response.json(release);
  };
  release.target_commitish = 'b'.repeat(40);
  await assert.rejects(reconcileRelease(manifest, directory, { phase: 'publish', token: 'fixture', fetcher }), /Pending draft targets/u);
  assert.equal(uploads.length, 0);
  release.target_commitish = source;
  await assert.rejects(reconcileRelease(manifest, directory, { phase: 'publish', token: 'fixture', fetcher }), /interrupted/u);
  assert(release.draft); assert.equal(published, 0);
  const result = await reconcileRelease(manifest, directory, { phase: 'publish', token: 'fixture', fetcher });
  assert(result.anonymousDownloads); assert.equal(published, 1);
  assert.equal(uploads.length, 3); assert.equal(new Set(publicReads).size, 4);
  await reconcileRelease(manifest, directory, { phase: 'publish', token: 'fixture', fetcher });
  assert.equal(published, 1); assert.equal(uploads.length, 3);
  stored.set(1, Buffer.from('different package'));
  await assert.rejects(reconcileRelease(manifest, directory, { phase: 'preflight', token: 'fixture', fetcher }), /conflicts/u);
  assert.equal(readFileSync(join(directory, 'fixture.tgz')).toString(), bytes.toString());
});
