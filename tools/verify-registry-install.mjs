#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

assert(process.argv.length === 4 && process.argv[2] === '--out', 'Usage: npm run release:consumer -- --out <artifact directory>');
assert(process.env.npm_execpath, 'Run through npm run release:consumer');
const directory = resolve(process.argv[3]), manifest = JSON.parse(readFileSync(join(directory, 'release-manifest.json')));
const site = mkdtempSync(join(tmpdir(), 'starlite-registry-'));
const write = (path, value) => writeFileSync(join(site, path), value);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const proof = { sourceRevision: manifest.sourceRevision, freshCache: true, anonymous: true, packages: [], presets: [], passed: false };
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^npm_config_/i.test(key) && !['NPM_TOKEN', 'NODE_AUTH_TOKEN', 'NODE_OPTIONS', 'NODE_PATH'].includes(key.toUpperCase())));
Object.assign(env, { npm_config_userconfig: join(site, 'empty-user.npmrc'), npm_config_globalconfig: join(site, 'empty-global.npmrc'),
  npm_config_cache: join(site, 'npm-cache'), npm_config_registry: 'https://registry.npmjs.org/', npm_config_update_notifier: 'false', NODE_USE_ENV_PROXY: '1' });
function run(script, args, environment = env) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd: site, env: environment, windowsHide: true,
    encoding: 'utf8', timeout: 300000, maxBuffer: 16 * 1024 * 1024 });
  assert.equal(result.status, 0, `Consumer step failed: ${args.join(' ')}\n${result.stderr?.slice(-2000)}`);
  return result.stdout + result.stderr;
}
function files(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? files(join(path, entry.name)) : [join(path, entry.name)]);
}
try {
  write('package.json', JSON.stringify({ name: 'starlite-registry-check', private: true, hexo: { version: '7.3.0' } }));
  write('empty-user.npmrc', ''); write('empty-global.npmrc', '');
  const targets = manifest.packages.map(pkg => `${pkg.name}@${pkg.version}`);
  run(process.env.npm_execpath, ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--save-exact', ...targets,
    ...(manifest.group === 'public' ? ['hexo@7.3.0'] : [])]);
  const lock = JSON.parse(readFileSync(join(site, 'package-lock.json')));
  for (const pkg of manifest.packages) {
    const location = `node_modules/${pkg.name}`, installed = lock.packages[location];
    assert.equal(installed.version, pkg.version); assert.equal(installed.integrity, pkg.integrity);
    assert.equal(new URL(installed.resolved).origin, 'https://registry.npmjs.org');
    assert(!installed.link && !lstatSync(join(site, location)).isSymbolicLink());
    proof.packages.push({ name: pkg.name, version: pkg.version, integrity: installed.integrity });
  }
  if (manifest.group === 'public') {
    mkdirSync(join(site, 'scripts')); mkdirSync(join(site, 'themes/minimal/layout'), { recursive: true });
    write('scripts/page.js', "hexo.extend.generator.register('release-check',()=>({path:'index.html',layout:'index',data:{title:'Registry check'}}));\n");
    write('themes/minimal/_config.yml', '');
    write('themes/minimal/layout/index.njk', '<!doctype html><html><head><meta charset="utf-8"></head><body><h1>Registry installation</h1></body></html>');
    // Deliberately deny Node HTTP and fetch in the second build; cache reuse must not require a network.
    write('offline.cjs', "const fail=()=>{throw Error('Offline consumer: network denied')};globalThis.fetch=fail;for(const p of ['http','https']){const m=require(p);m.get=fail;m.request=fail;}\n");
    const cli = join(site, 'node_modules/hexo/bin/hexo');
    for (const preset of ['weiguang', 'bluefish']) {
      write('_config.yml', `title: Registry check\nurl: https://example.invalid\ntheme: minimal\nlanguage: zh-CN\npublic_dir: public-${preset}\n` +
        (preset === 'weiguang' ? '' : 'starlite:\n  preset: bluefish\n'));
      const generated = run(cli, ['generate']);
      const out = join(site, `public-${preset}`), models = files(out).filter(path => path.endsWith('.vrm'));
      assert.equal(models.length, 1, `Expected one preset model: ${generated.slice(-2000)}`); const sha256 = hash(readFileSync(models[0]));
      assert(readFileSync(join(out, 'index.html'), 'utf8').includes('__hexoStarLiteWidgetState'));
      assert(!files(out).some(path => path.endsWith('.wasm')));
      const offline = { ...env, NODE_OPTIONS: `--require=${JSON.stringify(join(site, 'offline.cjs'))}` };
      run(cli, ['clean'], offline); assert(!existsSync(out)); run(cli, ['generate'], offline);
      assert.equal(hash(readFileSync(files(out).find(path => path.endsWith('.vrm')))), sha256);
      proof.presets.push({ preset, zeroConfig: preset === 'weiguang', sha256, offlineCache: true });
    }
  } else {
    run(join(site, 'node_modules/inochi2d-blog/bin/inochi2d-blog.mjs'), ['--help']);
  }
  proof.passed = true;
} finally {
  writeFileSync(join(directory, 'consumer-proof.json'), JSON.stringify(proof, null, 2) + '\n');
  rmSync(site, { recursive: true, force: true });
}
console.log(JSON.stringify(proof, null, 2));
