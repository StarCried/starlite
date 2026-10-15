import {createHash} from 'node:crypto';
import {lstat, mkdir, readFile, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {extname, join, resolve} from 'node:path';

const require = createRequire(import.meta.url);

/** Validate user paths before installing dependencies or building anything. */
export async function validateDemoInputs(source, configPath) {
  await checkFile(source, '模型', '.vrm', 64 * 1024 * 1024, '--model');
  if (!configPath) return {};
  await checkFile(configPath, '配置', '.json', 1024 * 1024, '--config');
  let config;
  try { config = JSON.parse(await readFile(configPath, 'utf8')); }
  catch (error) { if (error instanceof SyntaxError) throw new Error('配置不是有效的 JSON。请检查引号、逗号和括号。'); throw error; }
  if (!config || typeof config !== 'object' || Array.isArray(config) || config.animations?.length || typeof config.profile === 'string') throw new Error('体验配置只引用模型内嵌动作和数据型角色配置');
  return config;
}

async function checkFile(source, label, extension, limit, option) {
  const path = resolve(source);
  let metadata;
  try { metadata = await lstat(path); }
  catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
      throw new Error(`找不到${label}文件：${path}\n请把 ${option} 后的路径改为实际文件路径，并用引号包住。Windows 可拖入文件取得路径；在 WSL 中请使用 /mnt/d/... 这类路径。`);
    }
    if (error.code === 'EACCES' || error.code === 'EPERM') throw new Error(`无法读取${label}文件，请检查文件权限或选择可访问的本地文件：${path}`);
    throw error;
  }
  if (extname(path).toLowerCase() !== extension || !metadata.isFile() || metadata.isSymbolicLink() || metadata.size > limit) {
    throw new Error(`${label}必须是不超过 ${limit / (1024 * 1024)} MiB 的普通 ${extension} 文件，请用 ${option} 选择文件本身。`);
  }
}

/** Copy one self-contained VRM into the temporary preview; never rewrite it. */
export async function prepareDemoModel(source, destination, configPath) {
  const config = await validateDemoInputs(source, configPath);
  const path = resolve(source);
  const bytes = await readFile(path);
  const {inspectVrm, parseGlb} = require('@starcried/starlite-vrm/inspect');
  const buffer = Uint8Array.from(bytes).buffer;
  const inspected = inspectVrm(buffer), json = parseGlb(buffer, 'vrm');
  const modelMetadata = json.extensions.VRM?.meta ?? json.extensions.VRMC_vrm.meta;
  const embeddedLicense = json.extras?.starlite?.license;
  const license = typeof embeddedLicense?.text === 'string' ? embeddedLicense.text
    : typeof embeddedLicense === 'string' ? embeddedLicense
    : [inspected.name ?? 'VRM 模型', modelMetadata?.author ?? modelMetadata?.authors?.join(', '), modelMetadata?.licenseName, modelMetadata?.otherLicenseUrl ?? modelMetadata?.licenseUrl, '此预览仅在本机运行；模型和动作仍按各自许可使用。'].filter(Boolean).join('\n');
  await mkdir(destination, {recursive: true});
  await writeFile(join(destination, 'model.vrm'), bytes, {flag: 'wx'});
  return {title: inspected.name ?? 'VRM 体验', license, sourceSha256: createHash('sha256').update(bytes).digest('hex'), config};
}
