#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as wait } from 'node:timers/promises';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const save = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const integrity = bytes => 'sha512-' + createHash('sha512').update(bytes).digest('base64');
function run(cwd, command, args, capture = false) {
  if (command === 'npm' && process.env.npm_execpath) { args = [process.env.npm_execpath, ...args]; command = process.execPath; }
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit', windowsHide: true });
  if (result.error || result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed${capture ? ': ' + result.stderr : ''}`, { cause: result.error });
  return result.stdout?.trim() ?? '';
}
const git = (cwd, ...args) => run(cwd, 'git', args, true);
function bytesFrom(cwd, command, args) {
  const result = spawnSync(command, args, { cwd, windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
  assert.equal(result.status, 0, `${command} failed: ${result.stderr}`);
  return result.stdout;
}
function workspaces(cwd) {
  return ['packages', 'examples'].flatMap(group => readdirSync(join(cwd, group), { withFileTypes: true })
    .filter(entry => entry.isDirectory() && existsSync(join(cwd, group, entry.name, 'package.json')))
    .map(entry => ({ path: `${group}/${entry.name}`, ...json(join(cwd, group, entry.name, 'package.json')) })));
}
export function releasePlan(cwd = root, group = 'public') {
  assert(['public', 'cli'].includes(group), 'group must be public or cli');
  const config = json(join(cwd, '.changeset/config.json')), packages = workspaces(cwd);
  assert.equal(config.fixed.length, 1, 'One public fixed group is supported');
  const fixed = config.fixed[0];
  assert(fixed.every(name => packages.some(pkg => pkg.name === name && !pkg.private)), 'Unknown/private fixed member');
  const selected = group === 'public' ? packages.filter(pkg => fixed.includes(pkg.name))
    : packages.filter(pkg => !pkg.private && !fixed.includes(pkg.name));
  assert(selected.length > 0 && (group !== 'cli' || selected.length === 1), 'Unexpected independent CLI group');
  const version = packages.find(pkg => pkg.name === fixed[0]).version;
  assert(packages.filter(pkg => fixed.includes(pkg.name)).every(pkg => pkg.version === version), 'Fixed group version drift');
  assert.equal(json(join(cwd, 'package.json')).version, version, 'Root version drift; run release version');
  for (const pkg of packages) {
    if (pkg.private) assert.equal(pkg.version, version, `${pkg.name}: example version drift`);
    for (const [name, range] of Object.entries(pkg.dependencies ?? {})) {
      const internal = packages.find(other => other.name === name);
      if (internal) assert.equal(range, internal.version, `${pkg.name}: internal dependency drift for ${name}`);
    }
  }
  const lock = json(join(cwd, 'package-lock.json'));
  assert.equal(lock.version, version, 'Lock root version drift');
  for (const pkg of [{ path: '', ...json(join(cwd, 'package.json')) }, ...packages]) {
    assert.equal(lock.packages[pkg.path]?.version, pkg.version, `${pkg.path}: lock version drift`);
    for (const [name, value] of Object.entries(pkg.dependencies ?? {})) assert.equal(lock.packages[pkg.path]?.dependencies?.[name], value, `${pkg.path}: lock dependency drift`);
  }
  // Dependency order is derived from the group, not another package-name list.
  const ordered = [];
  while (ordered.length < selected.length) {
    const next = selected.find(pkg => !ordered.includes(pkg) && Object.keys(pkg.dependencies ?? {}).every(name => !selected.some(other => other.name === name) || ordered.some(other => other.name === name)));
    assert(next, 'Cyclic release dependencies'); ordered.push(next);
  }
  const selectedVersion = selected[0].version;
  return { schemaVersion: 1, repository: 'StarCried/starlite', sourceRevision: git(cwd, 'rev-parse', 'HEAD'), group,
    version: selectedVersion, tag: `${group === 'public' ? 'v' : 'inochi2d-blog-v'}${selectedVersion}`,
    channel: selectedVersion.includes('-') ? 'alpha' : 'latest', packages: ordered.map(({ name, version, path }) => ({ name, version, path })) };
}
function version(cwd) {
  const bin = json(join(cwd, 'node_modules/@changesets/cli/package.json')).bin.changeset;
  run(cwd, process.execPath, [join(cwd, 'node_modules/@changesets/cli', bin), 'version']);
  const packages = workspaces(cwd), fixed = json(join(cwd, '.changeset/config.json')).fixed[0];
  const next = packages.find(pkg => pkg.name === fixed[0]).version;
  for (const pkg of packages) {
    const file = join(cwd, pkg.path, 'package.json'), value = json(file);
    if (pkg.private) value.version = next;
    for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      for (const name of Object.keys(value[field] ?? {})) {
        const internal = packages.find(other => other.name === name);
        if (internal) value[field][name] = internal.private ? next : internal.version;
      }
    }
    save(file, value);
  }
  const top = json(join(cwd, 'package.json')); top.version = next; save(join(cwd, 'package.json'), top);
  // Update workspace entries before npm resolves ranges of not-yet-published versions.
  const lock = json(join(cwd, 'package-lock.json')); lock.version = next;
  for (const path of ['', ...packages.map(pkg => pkg.path)]) {
    const pkg = json(join(cwd, path, 'package.json'));
    lock.packages[path].version = pkg.version;
    for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) if (pkg[field]) lock.packages[path][field] = pkg[field];
  }
  save(join(cwd, 'package-lock.json'), lock);
  run(cwd, 'npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund']);
  releasePlan(cwd); console.log('Versions synchronized. Review and commit this diff before prepare.');
}
function doctor(cwd, preparing = false) {
  releasePlan(cwd);
  const npm = run(cwd, 'npm', ['--version'], true), [major, minor] = npm.split('.').map(Number);
  assert(major > 10 || (major === 10 && minor >= 9), 'Changesets requires npm >=10.9');
  const tools = { node: process.version, npm, git: run(cwd, 'git', ['--version'], true) };
  if (process.platform === 'linux') tools.cargo = run(cwd, 'cargo', ['--version'], true);
  if (preparing) tools.rustsec = run(cwd, process.env.CARGO_AUDIT_BIN || 'cargo', ['audit', '--version'], true);
  console.log(JSON.stringify(tools, null, 2));
}
function pendingChanges(cwd) {
  if (!readdirSync(join(cwd, '.changeset')).some(name => name.endsWith('.md') && name !== 'README.md')) return { changesets: [], releases: [] };
  const directory = mkdtempSync(join(tmpdir(), 'starlite-plan-'));
  try {
    const output = join(directory, 'changesets.json');
    run(cwd, process.execPath, [join(cwd, 'node_modules/@changesets/cli/bin.js'), 'status', '--output', output]);
    return json(output);
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
function checkRemoteTag(cwd, manifest) {
  const ref = `refs/tags/${manifest.tag}`;
  const entries = git(cwd, 'ls-remote', '--tags', 'https://github.com/StarCried/starlite.git', ref, ref + '^{}').split('\n').filter(Boolean).map(line => line.split(/\s+/));
  const sha = entries.find(([, name]) => name.endsWith('^{}'))?.[0] ?? entries[0]?.[0];
  assert(!sha || sha === manifest.sourceRevision, `Existing ${manifest.tag} points to different source; never move a release tag`);
}
export function validateArchives(cwd, directory) {
  const manifest = json(join(directory, 'release-manifest.json'));
  const expected = releasePlan(cwd, manifest.group);
  for (const field of ['schemaVersion', 'repository', 'sourceRevision', 'version', 'tag', 'channel']) assert.equal(manifest[field], expected[field], `Archive ${field} differs from checked-out source`);
  assert.equal(manifest.packages.length, expected.packages.length);
  for (let i = 0; i < expected.packages.length; i++) {
    const item = manifest.packages[i], pkg = expected.packages[i];
    assert.equal(item.name, pkg.name); assert.equal(item.version, pkg.version);
    assert.equal(item.file, basename(item.file)); assert(item.file.endsWith('.tgz'));
    const bytes = readFileSync(join(directory, item.file));
    assert.equal(bytes.length, item.bytes); assert.equal(sha256(bytes), item.sha256); assert.equal(integrity(bytes), item.integrity);
    const archived = JSON.parse(run(cwd, 'tar', ['-xOf', join(directory, item.file), 'package/package.json'], true));
    assert.equal(archived.name, pkg.name); assert.equal(archived.version, pkg.version);
    const source = JSON.parse(git(cwd, 'show', `${manifest.sourceRevision}:${pkg.path}/package.json`));
    assert.deepEqual(archived.dependencies, source.dependencies, 'Archive dependency drift');
    assert.deepEqual(archived.repository, source.repository, 'Archive repository drift');
    for (const name of ['README.md', 'README.en.md']) {
      if (!existsSync(join(cwd, pkg.path, name))) continue;
      assert.deepEqual(bytesFrom(cwd, 'tar', ['-xOf', join(directory, item.file), `package/${name}`]),
        bytesFrom(cwd, 'git', ['show', `${manifest.sourceRevision}:${pkg.path}/${name}`]), `Archive ${name} differs from source`);
    }
    const entries = run(cwd, 'tar', ['-tzf', join(directory, item.file)], true).split('\n');
    assert(entries.every(path => path.startsWith('package/') && !path.split('/').includes('..') && !/\.(inp|inx|vrm|vrma|blend)$/i.test(path)), 'Unwanted archive contents');
  }
  return manifest;
}
async function prepare(cwd, output, group, nativeDir) {
  assert.equal(git(cwd, 'status', '--porcelain'), '', 'Prepare requires a clean committed source');
  assert(!existsSync(output), 'Use a new artifact directory; publish retries reuse its existing manifest');
  doctor(cwd, true);
  const plan = releasePlan(cwd, group), staging = mkdtempSync(join(tmpdir(), 'starlite-release-'));
  mkdirSync(output, { recursive: true });
  try {
    const checkout = join(staging, 'source');
    run(cwd, 'git', ['clone', '--quiet', '--no-hardlinks', '--no-checkout', cwd, checkout]);
    run(checkout, 'git', ['checkout', '--quiet', '--detach', plan.sourceRevision]);
    run(checkout, 'npm', ['ci', '--no-audit', '--no-fund']);
    for (const check of ['validate', 'check:docs', 'test:browser', 'check:dependencies']) run(checkout, 'npm', ['run', check]);
    if (group === 'cli') {
      assert(nativeDir, 'CLI preparation requires --native-dir with verified Linux/Windows builds');
      for (const target of ['linux-x64', 'win32-x64']) assert.equal(readFileSync(join(nativeDir, target, 'SOURCE_REVISION'), 'utf8').trim(), plan.sourceRevision, 'Native source identity mismatch');
      run(checkout, 'npm', ['run', 'stage:native', '--', '--linux-x64', join(nativeDir, 'linux-x64/inochi2d-pipeline'), '--win32-x64', join(nativeDir, 'win32-x64/inochi2d-pipeline.exe')]);
      run(checkout, 'npm', ['run', 'pack:release-check']);
    }
    assert.equal(git(checkout, 'status', '--porcelain'), '', 'Build changed tracked source');
    const packages = plan.packages.map(pkg => {
      const [packed] = JSON.parse(run(checkout, 'npm', ['pack', '--json', '--workspace', pkg.name, '--pack-destination', output], true));
      const bytes = readFileSync(join(output, packed.filename));
      return { name: pkg.name, version: pkg.version, file: packed.filename, bytes: bytes.length, sha256: sha256(bytes), integrity: integrity(bytes) };
    });
    const notes = plan.packages.map(pkg => {
      const changelog = join(checkout, pkg.path, 'CHANGELOG.md');
      if (!existsSync(changelog)) return `- ${pkg.name}@${pkg.version}`;
      const content = readFileSync(changelog, 'utf8');
      const section = content.split(/^## /m).find(section => section.startsWith(pkg.version + '\n'));
      return section ? `### ${pkg.name}\n${section.slice(pkg.version.length).trim()}`
        : `- [${pkg.name}@${pkg.version} changelog](https://github.com/${plan.repository}/blob/${plan.sourceRevision}/${pkg.path}/CHANGELOG.md)`;
    }).join('\n\n');
    save(join(output, 'release-manifest.json'), { ...plan, notes, packages });
    validateArchives(checkout, output);
    writeFileSync(join(output, 'SOURCE_REVISION'), plan.sourceRevision + '\n');
    writeFileSync(join(output, 'SHA256SUMS'), packages.map(p => `${p.sha256}  ${p.file}`).join('\n') + '\n');
    console.log(`Reviewed artifacts: ${output}`);
  } finally { rmSync(staging, { recursive: true, force: true }); }
}
export async function registryPackage(pkg, fetcher = fetch) {
  const response = await fetcher(`https://registry.npmjs.org/${encodeURIComponent(pkg.name)}`, { cache: 'no-store', redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(60000) });
  if (response.status === 404) return { exists: false };
  assert(response.ok, `Registry request failed for ${pkg.name}: ${response.status}`);
  const metadata = await response.json(), published = metadata.versions?.[pkg.version];
  if (!published) return { exists: false, tags: metadata['dist-tags'] ?? {} };
  const url = new URL(published.dist.tarball);
  assert.equal(url.protocol, 'https:'); assert.equal(url.hostname, 'registry.npmjs.org');
  const archive = await fetcher(url.href, { redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(60000) }); assert(archive.ok);
  const bytes = Buffer.from(await archive.arrayBuffer());
  assert.equal(sha256(bytes), pkg.sha256, `${pkg.name}@${pkg.version} already exists with different bytes`);
  assert.equal(integrity(bytes), pkg.integrity); assert.equal(published.dist.integrity, pkg.integrity);
  return { exists: true, tags: metadata['dist-tags'] ?? {} };
}
export async function publishPackages(manifest, directory, npm, query = registryPackage) {
  // Inspect the whole batch before uploading anything; reruns never repackage.
  const states = await Promise.all(manifest.packages.map(pkg => query(pkg)));
  const { default: semver } = await import('semver');
  for (let i = 0; i < states.length; i++) {
    const current = states[i].tags?.[manifest.channel];
    assert(!current || !semver.gt(current, manifest.packages[i].version), `Refusing to move ${manifest.channel} backwards from ${current}`);
  }
  for (let i = 0; i < manifest.packages.length; i++) {
    const pkg = manifest.packages[i], state = states[i];
    if (!state.exists) await npm(['publish', join(directory, pkg.file), '--access', 'public', '--tag', manifest.channel, '--ignore-scripts']);
    else if (state.tags[manifest.channel] !== pkg.version) {
      await npm(['dist-tag', 'add', `${pkg.name}@${pkg.version}`, manifest.channel]);
    }
    else console.log(`Already published identically: ${pkg.name}@${pkg.version}`);
  }
}
async function main(argv) {
  const command = argv.shift(), options = {};
  while (argv.length) { const key = argv.shift(); assert(['--out', '--group', '--native-dir'].includes(key) && argv.length, `Unknown option ${key}`); options[key.slice(2)] = argv.shift(); }
  const group = options.group ?? 'public', directory = options.out && resolve(options.out);
  if (command === 'doctor') return doctor(root);
  if (command === 'plan') { console.log(JSON.stringify({ ...releasePlan(root, group), pending: pendingChanges(root) }, null, 2)); return; }
  if (command === 'version') return version(root);
  if (command === 'prepare') { assert(directory, '--out is required'); return prepare(root, directory, group, options['native-dir'] && resolve(options['native-dir'])); }
  if (command === 'publish' || command === 'verify') {
    assert(directory, '--out is required');
    const manifest = validateArchives(root, directory);
    if (command === 'publish') { checkRemoteTag(root, manifest); await publishPackages(manifest, directory, args => run(root, 'npm', args)); }
    let states;
    for (let attempt = 0; attempt < 18; attempt++) {
      states = await Promise.all(manifest.packages.map(pkg => registryPackage(pkg)));
      if (states.every((state, i) => state.exists && state.tags[manifest.channel] === manifest.packages[i].version)) break;
      if (attempt < 17) await wait(10000);
    }
    assert(states.every((state, i) => state.exists && state.tags[manifest.channel] === manifest.packages[i].version), 'Registry propagation/tag still pending; rerun verify, or publish to resume the same artifacts');
    const packages = manifest.packages.map(({ name, version, sha256 }) => ({ name, version, sha256 }));
    save(join(directory, 'registry-verification.json'), { checkedAt: new Date().toISOString(), sourceRevision: manifest.sourceRevision, channel: manifest.channel, packages });
    return;
  }
  throw new Error('Usage: npm run release -- doctor|plan|version|prepare|publish|verify [--group public|cli] [--out directory] [--native-dir directory]');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
