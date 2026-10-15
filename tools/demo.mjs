#!/usr/bin/env node
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import {mkdtemp, mkdir, readFile, writeFile, rm, stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join, resolve, extname, relative, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline/promises';
import {prepareDemoModel, validateDemoInputs} from './demo-model.mjs';

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const help = `StarLite for Hexo · 本机 VRM 体验\n\n用法：npm run demo -- --model <模型.vrm>\n\n首次自动安装锁定依赖并构建 JavaScript，无需 Rust、Blender 或 DSH。\n读取模型内许可；Ctrl-C 停止并清理临时站点。不生成可部署输出。\n\n  --model PATH       自包含 VRM 0/1 文件（必填，不上传）\n  --config PATH      可选 widget JSON，只引用模型内嵌动作\n  --port NUMBER      首选端口，默认 4183，占用时自动换下一个\n  --no-open          不自动打开浏览器\n  --no-install       依赖缺失时报错，不运行 npm ci\n  --accept-license   已阅读并同意模型许可，跳过交互确认\n  --help             显示帮助\n`;

export function parseOptions(args) {
  const options = {port: 4183, open: true, install: true, acceptLicense: false};
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === '--help' || argument === '-h') return {help: true};
    if (argument === '--no-open') options.open = false;
    else if (argument === '--no-install') options.install = false;
    else if (argument === '--accept-license') options.acceptLicense = true;
    else if (argument === '--model' || argument === '--config' || argument === '--port') {
      const value = args[++index]; if (!value || value.startsWith('--')) throw new Error(`${argument} 需要一个值`);
      if (argument === '--model') options.model = resolve(value);
      else if (argument === '--config') options.config = resolve(value);
      else options.port = Number(value);
    } else throw new Error(`未知参数：${argument}`);
  }
  if (!options.model) throw new Error('请用 --model 指定 VRM 文件；查看 npm run demo -- --help');
  if (!Number.isInteger(options.port) || options.port < 1024 || options.port > 65535) throw new Error('--port 必须为 1024～65535 的整数');
  return options;
}

function run(command, args, options = {}) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(command, args, {cwd: workspace, stdio: 'inherit', windowsHide: true, ...options});
    child.once('error', reject); child.once('exit', (code, signal) => code === 0 ? resolveResult() : reject(new Error(`${command} 失败（${signal ?? code}）`)));
  });
}
function npm(args) {
  if (process.env.npm_execpath?.endsWith('.js')) return run(process.execPath, [process.env.npm_execpath, ...args]);
  return run(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, {shell: process.platform === 'win32'});
}
async function ensureDependencies(allowInstall) {
  let available = true;
  for (const name of ['hexo', 'typescript', 'esbuild']) { try { require.resolve(name); } catch { available = false; } }
  if (available) return;
  if (!allowInstall) throw new Error('缺少开发依赖。请运行 npm ci，或去掉 --no-install 让体验入口安装锁定依赖。');
  console.log('首次体验：正在运行 npm ci 安装锁定依赖…'); await npm(['ci']);
}
async function buildRuntime() {
  console.log('准备 StarLite for Hexo 运行时（不构建 WASM／原生工具）…');
  await npm(['run', 'build', '--workspace', '@starcried/starlite-core']);
  // Hexo still references the optional backend's types/config validator. Emit
  // declarations only: compiling all its JS would replace bundled browser
  // modules (dialogue/hit-mask) with files containing bare package imports.
  await run(process.execPath, [join(workspace, 'node_modules/typescript/bin/tsc'), '-p', 'packages/inochi2d/tsconfig.build.json', '--emitDeclarationOnly']);
  const configPath = join(workspace, 'packages/inochi2d/dist/config.js');
  try { await stat(configPath); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const {build} = await import('esbuild');
    await build({entryPoints: [join(workspace, 'packages/inochi2d/src/config.ts')], outfile: configPath, bundle: true, format: 'esm', platform: 'node', target: 'node22'});
  }
  await npm(['run', 'build', '--workspace', '@starcried/starlite-vrm']);
  await npm(['run', 'build', '--workspace', 'hexo-starlite']);
}
async function acceptLicense(license, accepted) {
  if (accepted) { console.log('已按 --accept-license 确认模型使用许可。'); return; }
  console.log(`\n${license}\n`);
  if (!process.stdin.isTTY) throw new Error('请在交互终端阅读并确认许可；已阅读的自动验收可明确传 --accept-license。');
  const input = createInterface({input: process.stdin, output: process.stdout});
  try { if (!/^(y|yes|是)$/iu.test((await input.question('已阅读并同意上述模型使用许可？[y/N] ')).trim())) throw new Error('未同意模型许可，体验已取消。'); }
  finally { input.close(); }
}
const page = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>StarLite · 微光体验</title><style>
:root{color-scheme:light;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#273447;background:#f4f5fa}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(ellipse at 20% 10%,#e8e3fa,transparent 60%)}main{max-width:760px;padding:clamp(28px,6vw,80px);margin:auto}header{letter-spacing:.12em;color:#776e9c;font-weight:650;font-size:14px}h1{font-size:clamp(32px,5vw,46px);line-height:1.25;letter-spacing:-.04em;margin:28px 0 18px}p{line-height:1.85;color:#627086;font-size:16px}.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:30px 0}.cards div{background:#ffffffb8;border:1px solid #fff;border-radius:16px;padding:18px;font-size:14px;line-height:1.8}.cards strong{display:block;color:#46536a}footer{margin-top:36px;color:#778195;font-size:12px;line-height:1.8}a{color:#75639b}button{background:#75639b;color:white;border:0;border-radius:10px;padding:10px 16px;font:inherit;cursor:pointer}output{margin-left:12px;font-size:14px;color:#627086}[data-starlite-widget-host]{right:28px!important;bottom:20px!important} @media(max-width:600px){.cards{grid-template-columns:1fr}main{padding:28px}}@media(prefers-color-scheme:dark){:root{color-scheme:dark;color:#e6e9ef;background:#171c28}body{background:radial-gradient(ellipse at 20% 10%,#2c2843,transparent 60%)}p,output{color:#aab4c5}.cards div{background:#242b3c;border-color:#343c50}.cards strong{color:#d6dbea}a{color:#b9a7eb}}
</style></head><body><main><header>STARLITE · 星伴</header><h1>一点微光，静静相伴。</h1><p>这是运行在你电脑上的 Hexo 示例。模型无需自带动作即可体验待机和轻呼吸；具备 Blink 表达时自动眨眼。配置内嵌动作后，可让点击和偶发互动播放不同动作。</p><section class="cards"><div><strong>移动光标</strong>体验限角视线跟随。</div><div><strong>轻点角色</strong>按配置体验动作和短句。</div><div><strong>安静陪伴</strong>放松站姿与轻呼吸；具备 Blink 表达时眨眼。</div></section><p>角色区域保留页面点击。你可以点击下面的按钮验证，或调整浏览器窗口检查显示效果。手机尺寸默认隐藏角色。</p><button id="example-button">试试页面按钮</button><output id="example-output">已点击 0 次</output><footer>模型与动作依其各自许可使用。<br><a href="/license.txt" target="_blank">模型使用许可</a><br>此页面只在本机提供；关闭终端或按 Ctrl-C 结束体验。</footer></main><script>let count=0;document.getElementById('example-button').onclick=()=>{document.getElementById('example-output').textContent='已点击 '+(++count)+' 次'}</script></body></html>`;

async function generateSite(site, assets, prepared) {
  const Hexo = require('hexo');
  const {registerHexoWidget} = require('hexo-starlite');
  await mkdir(site, {recursive: true});
  await writeFile(join(site, '_config.yml'), 'title: StarLite · 微光体验\nurl: http://127.0.0.1\ntheme: false\n');
  const token = randomBytes(32).toString('hex');
  const hexo = new Hexo(site, {silent: true}); hexo.env.init = true;
  process.env.STARLITE_LOCAL_PREVIEW_TOKEN = token;
  try {
    await hexo.init();
    hexo.config.public_dir = '.inochi2d/preview/demo';
    hexo.public_dir = join(site, '.inochi2d/preview/demo/');
    hexo.config.starlite = {render:{fps:30,maxDevicePixelRatio:1},interactions:{pointer:true,passThrough:true,drag:false},...prepared.config, enable: true, backend: 'vrm', model: join(assets, 'model.vrm'), fallback: 'images/avatar.svg', localPreview:{token}};
    registerHexoWidget(hexo);
    hexo.extend.generator.register('starlite-demo-page', () => [
      {path: 'index.html', data: page},
      {path: 'images/avatar.svg', data: '<svg xmlns="http://www.w3.org/2000/svg" width="260" height="360"><rect width="260" height="360" rx="24" fill="#dfe5f0"/><text x="30" y="180" fill="#46536a">StarLite</text></svg>'},
      {path: 'license.txt', data: prepared.license},
    ]);
    await hexo.call('generate');
    const index = join(hexo.public_dir, 'index.html'); const html = await readFile(index, 'utf8');
    if (!html.includes('<div data-starlite-widget-host')) await writeFile(index, hexo.extend.injector.exec(html));
    return hexo.public_dir;
  } finally { delete process.env.STARLITE_LOCAL_PREVIEW_TOKEN; await hexo.exit(); }
}
const mime = {'.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg':'image/svg+xml', '.txt': 'text/plain; charset=utf-8'};
async function serve(publicDirectory, firstPort) {
  const server = createServer(async (request, response) => {
    try {
      if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405).end(); return; }
      const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      const path = resolve(publicDirectory, `.${pathname.endsWith('/') ? pathname + 'index.html' : pathname}`);
      const inside = relative(publicDirectory, path);
      if (inside === '..' || inside.startsWith(`..${sep}`) || inside.startsWith(sep)) { response.writeHead(404).end(); return; }
      if (!(await stat(path)).isFile()) { response.writeHead(404).end(); return; }
      const data = await readFile(path); response.writeHead(200, {'Content-Type': mime[extname(path)] ?? 'application/octet-stream', 'Content-Length': data.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'}).end(request.method === 'HEAD' ? undefined : data);
    } catch { response.writeHead(404).end(); }
  });
  for (let port = firstPort; port <= 65535; port++) {
    try {
      await new Promise((resolveResult, reject) => { const error = cause => { server.off('listening', listening); reject(cause); }; const listening = () => { server.off('error', error); resolveResult(); }; server.once('error', error); server.once('listening', listening); server.listen(port, '127.0.0.1'); });
      return {server, port};
    } catch (error) { if (error.code !== 'EADDRINUSE') throw error; }
  }
  throw new Error('没有可用的本机端口');
}
function openBrowser(url) {
  const windows = process.platform === 'win32' || Boolean(process.env.WSL_DISTRO_NAME);
  const child = spawn(windows ? 'rundll32.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open', windows ? ['url.dll,FileProtocolHandler', url] : [url], {stdio: 'ignore', detached: true, windowsHide: true});
  child.once('error', () => console.log('未能自动打开浏览器，请打开上方本机网址。')); child.unref();
}

export async function main(args = process.argv.slice(2)) {
  const options = parseOptions(args); if (options.help) { console.log(help); return; }
  await validateDemoInputs(options.model, options.config);
  await ensureDependencies(options.install);
  const temporary = await mkdtemp(join(tmpdir(), 'starlite-demo-'));
  let active, cleaned = false;
  async function cleanup() {
    if (cleaned) return; cleaned = true;
    if (active) { active.closeAllConnections(); await new Promise(done => active.close(done)); }
    await rm(temporary, {recursive: true, force: true});
  }
  const signals = ['SIGINT', 'SIGTERM'];
  const interrupt = () => { void cleanup().then(() => process.exit(0)); };
  for (const signal of signals) process.once(signal, interrupt);
  try {
    const assets = join(temporary, 'resources');
    await buildRuntime();
    const prepared = await prepareDemoModel(options.model, assets, options.config);
    await acceptLicense(prepared.license, options.acceptLicense);
    const publicDirectory = await generateSite(join(temporary, 'site'), assets, prepared);
    const {server, port} = await serve(publicDirectory, options.port); active = server;
    const url = `http://127.0.0.1:${port}/`;
    console.log(`\nStarLite for Hexo 已就绪：${url}\n仅在本机提供。按 Ctrl-C 停止；临时资源会自动清理。\n`);
    if (options.open) openBrowser(url);
    await new Promise(done => server.once('close', done));
  } finally { for (const signal of signals) process.off(signal, interrupt); await cleanup(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(`StarLite 体验未启动：${error.message}`); process.exitCode = 1; });
