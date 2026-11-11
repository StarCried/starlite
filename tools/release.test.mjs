import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { releasePlan, validateArchives, publishPackages } from './release.mjs';

const write = (file, value) => writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
const hash = (value, algorithm, format) => createHash(algorithm).update(value).digest(format);
function fixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'starlite-release-test-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  mkdirSync(join(cwd, '.changeset')); mkdirSync(join(cwd, 'packages')); mkdirSync(join(cwd, 'examples'));
  const packages = [
    { path: 'packages/core', name: '@example/core', version: '1.0.0' },
    { path: 'packages/host', name: '@example/host', version: '1.0.0', dependencies: { '@example/core': '1.0.0' } },
    { path: 'packages/cli', name: '@example/cli', version: '0.5.0' },
    { path: 'examples/demo', name: '@example/demo', version: '1.0.0', private: true },
  ];
  write(join(cwd, '.changeset/config.json'), { fixed: [['@example/core', '@example/host']] });
  write(join(cwd, 'package.json'), { name: 'example', private: true, version: '1.0.0' });
  const lock = { version: '1.0.0', packages: { '': { version: '1.0.0' } } };
  for (const { path, ...pkg } of packages) {
    mkdirSync(join(cwd, path)); write(join(cwd, path, 'package.json'), pkg);
    writeFileSync(join(cwd, path, 'README.md'), `# ${pkg.name}\n\nCurrent instructions.\n`);
    lock.packages[path] = pkg;
  }
  write(join(cwd, 'package-lock.json'), lock);
  const git = (...args) => execFileSync('git', args, { cwd, stdio: 'pipe' });
  git('init', '-q'); git('add', '.'); git('-c', 'user.name=Release Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'fixture');
  return cwd;
}
function archives(cwd, staleReadme = false) {
  const directory = join(cwd, 'out'); mkdirSync(directory, { recursive: true });
  const plan = releasePlan(cwd);
  const packages = plan.packages.map(pkg => {
    const staging = mkdtempSync(join(cwd, 'archive-')); mkdirSync(join(staging, 'package'));
    for (const name of ['package.json', 'README.md']) writeFileSync(join(staging, 'package', name),
      name === 'README.md' && staleReadme ? 'Old installation instructions\n' : readFileSync(join(cwd, pkg.path, name)));
    const file = `${pkg.name.split('/').pop()}.tgz`;
    execFileSync('tar', ['-czf', join(directory, file), '-C', staging, 'package'], { stdio: 'pipe' });
    const bytes = readFileSync(join(directory, file));
    return { name: pkg.name, version: pkg.version, file, bytes: bytes.length,
      sha256: hash(bytes, 'sha256', 'hex'), integrity: 'sha512-' + hash(bytes, 'sha512', 'base64') };
  });
  write(join(directory, 'release-manifest.json'), { ...plan, packages });
  return directory;
}

test('version group, examples and lock cannot drift; CLI stays independent', t => {
  const cwd = fixture(t);
  assert.equal(releasePlan(cwd, 'cli').version, '0.5.0');
  assert.equal(releasePlan(cwd).packages[0].name, '@example/core');
  const path = join(cwd, 'packages/host/package.json'), original = readFileSync(path);
  const pkg = JSON.parse(original); pkg.dependencies['@example/core'] = '^1.0.0'; write(path, pkg);
  assert.throws(() => releasePlan(cwd), /internal dependency drift/);
  writeFileSync(path, original);
  const lockPath = join(cwd, 'package-lock.json'), lock = JSON.parse(readFileSync(lockPath));
  lock.packages['examples/demo'].version = '0.9.0'; write(lockPath, lock);
  assert.throws(() => releasePlan(cwd), /lock version drift/);
});

test('a valid hash does not make stale instructions or a different source acceptable', t => {
  const cwd = fixture(t), out = archives(cwd);
  validateArchives(cwd, out);
  archives(cwd, true);
  assert.throws(() => validateArchives(cwd, out), /README.md differs/);
  archives(cwd);
  const path = join(out, 'release-manifest.json'), manifest = JSON.parse(readFileSync(path));
  manifest.sourceRevision = '0'.repeat(40); write(path, manifest);
  assert.throws(() => validateArchives(cwd, out), /sourceRevision differs/);
});

test('partial publication resumes exact files, with batch conflicts rejected before any write', async () => {
  const packages = ['first', 'second'].map(name => ({ name, version: '1.0.0', file: `${name}.tgz` }));
  const manifest = { channel: 'latest', packages }, writes = [];
  const npm = async args => writes.push(args);
  await publishPackages(manifest, '/reviewed', npm, async pkg => pkg.name === 'first'
    ? { exists: true, tags: { latest: '1.0.0' } } : { exists: false });
  assert.equal(writes.length, 1); assert.equal(writes[0][1], join('/reviewed', 'second.tgz'));
  writes.length = 0;
  await assert.rejects(publishPackages(manifest, '/reviewed', npm, async pkg => {
    if (pkg.name === 'second') throw new Error('different bytes');
    return { exists: false };
  }), /different bytes/);
  assert.equal(writes.length, 0);
  await assert.rejects(publishPackages(manifest, '/reviewed', npm, async pkg => ({ exists: false,
    tags: { latest: pkg.name === 'second' ? '2.0.0' : '0.9.0' } })), /backwards/);
  assert.equal(writes.length, 0);
  await publishPackages(manifest, '/reviewed', npm, async () => ({ exists: true, tags: {} }));
  assert(writes.every(args => args[0] === 'dist-tag'));
});
