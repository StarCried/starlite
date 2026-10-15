import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve, join} from 'node:path';
import {model} from '../tests/fixtures/vrm.mjs';
import {prepareDemoModel,validateDemoInputs} from './demo-model.mjs';
import {parseOptions} from './demo.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function sandbox(t) {
  const root = await mkdtemp(join(tmpdir(), 'starlite-demo-test-'));
  t.after(() => rm(root, {recursive: true, force: true})); return root;
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
test('CLI requires a VRM file, retires ZIP options and validates the port', () => {
  assert.deepEqual(parseOptions(['--help']), {help:true});
  assert.throws(()=>parseOptions([]), /--model/u);
  assert.throws(()=>parseOptions(['--bundle','old.zip']), /未知参数/u);
  assert.throws(()=>parseOptions(['--model','input','--port','NaN']), /port/u);
  assert.equal(parseOptions(['--model','avatar.vrm','--no-open','--no-install','--accept-license']).acceptLicense,true);
});

test('bad model and config paths fail with actionable guidance before dependency setup or builds',async t=>{
  const root=await sandbox(t), missing=join(root,'not downloaded.vrm');
  const isolated=join(root,'without-dependencies');await mkdir(join(isolated,'tools'),{recursive:true});
  for(const name of ['demo.mjs','demo-model.mjs']) await writeFile(join(isolated,'tools',name),await readFile(join(import.meta.dirname,name)));
  const result=await new Promise((done,reject)=>{
    const child=spawn(process.execPath,['tools/demo.mjs','--model',missing,'--no-install'],{cwd:isolated,stdio:['ignore','pipe','pipe']});
    let output='';child.stdout.on('data',bytes=>output+=bytes);child.stderr.on('data',bytes=>output+=bytes);
    child.once('error',reject);child.once('exit',code=>done({code,output}));
  });
  assert.equal(result.code,1);assert.match(result.output,/找不到模型文件/u);assert.match(result.output,/--model/u);assert.match(result.output,/WSL/u);
  assert.doesNotMatch(result.output,/npm ci|准备 StarLite|ENOENT|build|缺少开发依赖/u);
  const source=join(root,'avatar.vrm');await writeFile(source,model());
  await assert.rejects(validateDemoInputs(source,join(root,'missing.json')),/找不到配置文件.*[\s\S]*--config/u);
  await assert.rejects(validateDemoInputs(root),/普通 \.vrm 文件/u);
  const config=join(root,'settings.json');await writeFile(config,'{"dialogue":');
  await assert.rejects(validateDemoInputs(source,config),/配置不是有效的 JSON/u);
});
test('single VRM snapshot retains exact bytes and embedded license metadata', async t => {
  const root=await sandbox(t), source=join(root,'avatar.vrm'); await writeFile(source,model());
  const prepared=await prepareDemoModel(source,join(root,'snapshot'));
  assert.equal(prepared.sourceSha256,hash(model()));
  assert.deepEqual(await readFile(join(root,'snapshot/model.vrm')),model());
  assert.match(prepared.license,/StarCried test fixture/u);
  assert.deepEqual(await readdir(join(root,'snapshot')),['model.vrm']);
});
test('corrupt files, external resources and symlinks cannot become preview assets',async t=>{
  const root=await sandbox(t), source=join(root,'avatar.vrm'); await writeFile(source,'broken');
  await assert.rejects(prepareDemoModel(source,join(root,'broken')),/GLB/u);
  await assert.rejects(readFile(join(root,'broken/model.vrm')));
  await writeFile(source,model()); const link=join(root,'link.vrm');
  try {await symlink(source,link);} catch(error){if(error.code==='EPERM')return;throw error;}
  await assert.rejects(prepareDemoModel(link,join(root,'linked')),/普通/u);
  const config=join(root,'config.json');await writeFile(config,JSON.stringify({animations:[{name:'External',url:'https://example.invalid/action.vrma'}]}));
  await assert.rejects(prepareDemoModel(source,join(root,'external'),config),/内嵌/u);
});
test('one command serves isolated Hexo from a VRM, preserves other backend JS and cleans up', {timeout:90000},async t=>{
  const root=await sandbox(t), source=join(root,'avatar.vrm');await writeFile(source,model());
  const blocker=createServer();await new Promise(done=>blocker.listen(0,'127.0.0.1',done));
  t.after(()=>new Promise(done=>blocker.close(done)));
  const browserDist=resolve(import.meta.dirname,'../packages/inochi2d/dist'), hashes=await browserModuleHashes(browserDist);
  const childTemporary=join(root,'temporary');await mkdir(childTemporary);
  const child=spawn(process.execPath,['tools/demo.mjs','--model',source,'--port',String(blocker.address().port),'--no-open','--no-install','--accept-license'],{cwd:resolve(import.meta.dirname,'..'),stdio:['ignore','pipe','pipe'],env:{...process.env,TMPDIR:childTemporary,TEMP:childTemporary,TMP:childTemporary,NODE_COMPILE_CACHE:join(root,'node-compile-cache')}});
  let output='';child.stdout.on('data',bytes=>output+=bytes);child.stderr.on('data',bytes=>output+=bytes);
  t.after(()=>{if(child.exitCode===null)child.kill('SIGTERM')});
  const url=await new Promise((done,reject)=>{
    const deadline=setTimeout(()=>reject(new Error(`Starter timed out:\n${output}`)),70000);
    const inspect=()=>{const match=output.match(/http:\/\/127\.0\.0\.1:(\d+)\//u);if(match){clearTimeout(deadline);child.stdout.off('data',inspect);done(match[0]);}};
    child.stdout.on('data',inspect);child.once('exit',code=>{clearTimeout(deadline);reject(new Error(`Starter exited ${code}:\n${output}`));});
  });
  assert.notEqual(new URL(url).port,String(blocker.address().port));
  const html=await(await fetch(url)).text();assert.match(html,/<div data-starlite-widget-host/u);assert.match(html,/vrm-widget\//u);assert.doesNotMatch(html,/inochi2d\.wasm/u);
  const runtime=html.match(/"entryUrl":"([^"]+)"/u), modelUrl=html.match(/"model":"([^"]+)"/u);assert.ok(runtime);assert.ok(modelUrl);
  assert.equal((await fetch(new URL(runtime[1],url))).status,200);
  assert.deepEqual(Buffer.from(await(await fetch(new URL(modelUrl[1],url))).arrayBuffer()),model());
  assert.equal((await fetch(url,{method:'POST'})).status,405);
  assert.equal((await fetch(new URL('license.txt',url))).status,200);
  assert.equal((await fetch(new URL('images/avatar.svg',url))).status,200);
  assert.equal((await fetch(new URL('/%2e%2e%2fresources/model.vrm',url))).status,404);
  child.kill('SIGTERM');await new Promise(done=>child.once('exit',done));await assert.rejects(fetch(url));
  assert.deepEqual(await readdir(childTemporary),[]);
  const after=await browserModuleHashes(browserDist);for(const [name,digest]of hashes)assert.equal(after.get(name),digest,name);
});
