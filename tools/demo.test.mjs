import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve, join} from 'node:path';
import {zipSync} from 'fflate';
import {model, motion} from '../tests/fixtures/vrm.mjs';
import {safeRelative, inspectZip, prepareBundle} from './demo-bundle.mjs';
import {parseOptions} from './demo.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function fixture(overrides = {}) {
  const vrm = model(), vrma = motion();
  const record = (file, bytes) => ({file, bytes: bytes.length, sha256: hash(bytes)});
  const manifest = {schemaVersion: 1, tool: 'vrm-companion-assets', backend: 'vrm', model: {...record('model.vrm', vrm), sourceSha256: hash(vrm)}, animations: [{...record('motions/Idle.vrma', vrma), name: 'Idle', durationMs: 1000}], publication: {allowRedistribution: true}};
  const config = {backend: 'vrm', model: 'model.vrm', fallback: 'fallback.png', animations: [{name: 'Idle', url: 'motions/Idle.vrma'}], ambient: {animations: ['Idle']}, interactions: {pointer: true, click: {animation: 'Idle'}}, dialogue: {click: {animation: 'Idle', lines: ['Synthetic fixture']}}, mobile: {show: false, breakpoint: 768}};
  const entries = {'blog/model.vrm': vrm, 'blog/motions/Idle.vrma': vrma, 'blog/manifest.json': Buffer.from(JSON.stringify(manifest)), 'blog/widget-config.json': Buffer.from(JSON.stringify(config)), 'LICENSE-Weiguang.md': Buffer.from('Synthetic artwork-free test fixture: BSD-2-Clause. Not a real character.'), '动作来源.md': Buffer.from('Repository synthetic fixture.'), 'fallback.png': Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64'), ...overrides};
  entries.SHA256SUMS = Buffer.from(Object.entries(entries).map(([name, bytes]) => `${hash(bytes)}  ${name}\n`).join(''));
  return entries;
}
async function browserModuleHashes(directory, prefix = '') {
  const files = new Map(); let entries;
  try { entries = await readdir(join(directory, prefix), {withFileTypes: true}); }
  catch (error) { if (error.code === 'ENOENT') return files; throw error; }
  for (const entry of entries) {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) for (const record of await browserModuleHashes(directory, name)) files.set(...record);
    else if (entry.isFile() && entry.name.endsWith('.js')) files.set(name, hash(await readFile(join(directory, name))));
  }
  return files;
}
async function sandbox(t) {
  const root = await mkdtemp(join(tmpdir(), 'starlite-demo-test-')); t.after(() => rm(root, {recursive: true, force: true})); return root;
}
async function saveZip(root, entries = fixture()) {
  const path = join(root, 'resources.zip'); await writeFile(path, zipSync(entries)); return path;
}

test('CLI requires an explicit bundle and validates the port', () => {
  assert.deepEqual(parseOptions(['--help']), {help: true});
  assert.throws(() => parseOptions([]), /--bundle/u);
  assert.throws(() => parseOptions(['--bundle', 'input', '--port', 'NaN']), /port/u);
  assert.throws(() => parseOptions(['--bundle', 'input', '--unexpected']), /未知参数/u);
  assert.equal(parseOptions(['--bundle', 'input', '--no-open', '--no-install', '--accept-license']).acceptLicense, true);
});
test('paths reject traversal and Windows absolute or special paths', () => {
  for (const path of ['../file', '/absolute', 'C:/outside', 'a\\b', 'a/../b', 'a//b', 'a/./b', 'a\u0000b', 'CON.txt', 'a/trailing.']) assert.throws(() => safeRelative(path));
  assert.equal(safeRelative('blog/motions/Idle.vrma'), 'blog/motions/Idle.vrma');
});
test('ZIP central validation rejects paths, symlinks and expanded size abuse', () => {
  assert.throws(() => inspectZip(Buffer.from(zipSync({'../escape': new Uint8Array([1])}))), /Unsafe/u);
  assert.throws(() => inspectZip(Buffer.from(zipSync({'link': [new Uint8Array([1]), {os: 3, attrs: 0xa1ff0000}]}))), /symlinks/u);
  const huge = Buffer.from(zipSync({'large': new Uint8Array([1])}));
  const index = huge.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])); huge.writeUInt32LE(200 * 1024 * 1024, index + 24);
  assert.throws(() => inspectZip(huge), /size/u);
});
test('valid ZIP creates a verified private snapshot, including UTF-8 filenames', async t => {
  const root = await sandbox(t), archive = await saveZip(root);
  const prepared = await prepareBundle(archive, join(root, 'snapshot'));
  assert.equal(prepared.config.backend, 'vrm'); assert.equal(prepared.manifest.animations[0].name, 'Idle');
  assert.match(await readFile(join(root, 'snapshot/动作来源.md'), 'utf8'), /synthetic/u);
});
test('tampered resource fails before any site is created', async t => {
  const root = await sandbox(t), entries = fixture(); entries['blog/model.vrm'] = Buffer.from('tampered');
  await assert.rejects(prepareBundle(await saveZip(root, entries), join(root, 'snapshot')), /SHA-256 mismatch/u);
});
test('undeclared files and symlinks in unpacked directories are rejected', async t => {
  const root = await sandbox(t), directory = join(root, 'unpacked'); await mkdir(directory);
  for (const [name, bytes] of Object.entries(fixture())) { const path = join(directory, name); await mkdir(resolve(path, '..'), {recursive: true}); await writeFile(path, bytes); }
  await writeFile(join(directory, 'unexpected.txt'), 'unexpected');
  await assert.rejects(prepareBundle(directory, join(root, 'snapshot')), /cover/u);
  await rm(join(directory, 'unexpected.txt'));
  try { await symlink(join(root, 'outside'), join(directory, 'link')); }
  catch (error) { if (error.code === 'EPERM') { t.diagnostic('Symlink creation unavailable on this Windows host'); return; } throw error; }
  await assert.rejects(prepareBundle(directory, join(root, 'snapshot2')), /symlink/u);
});
test('one command serves Hexo, preserves built Inochi2D browser JS, chooses a free port and cleans up', {timeout: 90000}, async t => {
  const root = await sandbox(t), archive = await saveZip(root), blocker = createServer();
  await new Promise(done => blocker.listen(0, '127.0.0.1', done)); t.after(() => new Promise(done => blocker.close(done)));
  const existingBrowserDist = resolve(import.meta.dirname, '../packages/inochi2d/dist');
  const existingBrowserModules = await browserModuleHashes(existingBrowserDist);
  const preferred = blocker.address().port;
  const childTemporary = join(root, 'temporary'); await mkdir(childTemporary);
  const child = spawn(process.execPath, ['tools/demo.mjs', '--bundle', archive, '--port', String(preferred), '--no-open', '--no-install', '--accept-license'], {cwd: resolve(import.meta.dirname, '..'), stdio: ['ignore', 'pipe', 'pipe'], env: {...process.env, TMPDIR: childTemporary, TEMP: childTemporary, TMP: childTemporary, NODE_COMPILE_CACHE: join(root, 'node-compile-cache')}});
  let output = ''; child.stdout.on('data', bytes => { output += bytes; }); child.stderr.on('data', bytes => { output += bytes; });
  t.after(() => { if (child.exitCode === null) child.kill('SIGTERM'); });
  const url = await new Promise((done, reject) => {
    const deadline = setTimeout(() => reject(new Error(`Starter timed out:\n${output}`)), 70000);
    const inspect = bytes => { const match = output.match(/http:\/\/127\.0\.0\.1:(\d+)\//u); if (match) { clearTimeout(deadline); child.stdout.off('data', inspect); done(match[0]); } };
    child.stdout.on('data', inspect); child.once('exit', code => { clearTimeout(deadline); reject(new Error(`Starter exited ${code}:\n${output}`)); });
  });
  assert.notEqual(new URL(url).port, String(preferred));
  const page = await fetch(url); assert.equal(page.status, 200);
  const html = await page.text(); assert.match(html, /<div data-starlite-widget-host/u); assert.match(html, /vrm-widget\//u); assert.doesNotMatch(html, /inochi2d\.wasm/u);
  const runtime = html.match(/entryUrl:"([^"]+)"/u) ?? html.match(/"entryUrl":"([^"]+)"/u);
  assert.ok(runtime, 'Hexo bootstrap includes a concrete runtime URL');
  assert.equal((await fetch(new URL(runtime[1], url))).status, 200);
  const modelUrl = html.match(/"model":"([^"]+)"/u); assert.ok(modelUrl);
  assert.equal((await fetch(new URL(modelUrl[1], url))).status, 200);
  assert.equal((await fetch(url, {method: 'POST'})).status, 405);
  assert.equal((await fetch(new URL('license.txt', url))).status, 200);
  assert.equal((await fetch(new URL('images/weiguang.png', url))).status, 200);
  assert.equal((await fetch(new URL('/%2e%2e%2fresources/LICENSE-Weiguang.md', url))).status, 404);
  child.kill('SIGTERM'); await new Promise(done => child.once('exit', done));
  await assert.rejects(fetch(url));
  assert.deepEqual(await readdir(childTemporary), []);
  const afterBrowserModules = await browserModuleHashes(existingBrowserDist);
  for (const [name, digest] of existingBrowserModules) assert.equal(afterBrowserModules.get(name), digest, 'demo must preserve already-built Inochi2D browser JS: ' + name);
});

test('unapproved bundles and malicious manifest references never start a server', {timeout: 90000}, async t => {
  const root = await sandbox(t), entries = fixture();
  const manifest = JSON.parse(entries['blog/manifest.json']); manifest.publication.allowRedistribution = false;
  await assert.rejects(prepareBundle(await saveZip(root, fixture({'blog/manifest.json': Buffer.from(JSON.stringify(manifest))})), join(root, 'unapproved')), /not allowed/u);
  manifest.publication.allowRedistribution = true; manifest.model.file = '../outside.vrm';
  const archive = await saveZip(root, fixture({'blog/manifest.json': Buffer.from(JSON.stringify(manifest))}));
  const childTemporary = join(root, 'temporary'); await mkdir(childTemporary);
  const child = spawn(process.execPath, ['tools/demo.mjs', '--bundle', archive, '--no-open', '--no-install', '--accept-license'], {cwd: resolve(import.meta.dirname, '..'), stdio: ['ignore', 'pipe', 'pipe'], env: {...process.env, TMPDIR: childTemporary, TEMP: childTemporary, TMP: childTemporary, NODE_COMPILE_CACHE: join(root, 'node-compile-cache')}});
  let output = ''; child.stdout.on('data', bytes => { output += bytes; }); child.stderr.on('data', bytes => { output += bytes; });
  const code = await new Promise((done, reject) => { child.once('exit', done); child.once('error', reject); });
  assert.equal(code, 1); assert.match(output, /invalid manifest asset/u); assert.doesNotMatch(output, /已就绪/u);
  assert.deepEqual(await readdir(childTemporary), []);
});
