import {createHash} from 'node:crypto';
import {lstat, mkdir, readFile, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {extname, join, resolve} from 'node:path';

const require = createRequire(import.meta.url);

/** Copy one self-contained VRM into the temporary preview; never rewrite it. */
export async function prepareDemoModel(source, destination, configPath) {
  const path = resolve(source), metadata = await lstat(path);
  if (extname(path).toLowerCase() !== '.vrm' || !metadata.isFile() || metadata.isSymbolicLink() || metadata.size > 64 * 1024 * 1024) throw new Error('请选择不超过 64 MiB 的普通 .vrm 文件');
  const bytes = await readFile(path);
  const {inspectVrm, parseGlb} = require('@starcried/starlite-vrm/inspect');
  const buffer = Uint8Array.from(bytes).buffer;
  const inspected = inspectVrm(buffer), json = parseGlb(buffer, 'vrm');
  const modelMetadata = json.extensions.VRM?.meta ?? json.extensions.VRMC_vrm.meta;
  const embeddedLicense = json.extras?.starlite?.license;
  const license = typeof embeddedLicense?.text === 'string' ? embeddedLicense.text
    : typeof embeddedLicense === 'string' ? embeddedLicense
    : [inspected.name ?? 'VRM 模型', modelMetadata?.author ?? modelMetadata?.authors?.join(', '), modelMetadata?.licenseName, modelMetadata?.otherLicenseUrl ?? modelMetadata?.licenseUrl, '此预览仅在本机运行；模型和动作仍按各自许可使用。'].filter(Boolean).join('\n');
  let config = {};
  if (configPath) {
    const info = await lstat(configPath);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 1024 * 1024) throw new Error('配置必须是不超过 1 MiB 的普通 JSON 文件');
    config = JSON.parse(await readFile(configPath, 'utf8'));
    if (!config || typeof config !== 'object' || Array.isArray(config) || config.animations?.length || typeof config.profile === 'string') throw new Error('体验配置只引用模型内嵌动作和数据型角色配置');
  }
  await mkdir(destination, {recursive: true});
  await writeFile(join(destination, 'model.vrm'), bytes, {flag: 'wx'});
  return {title: inspected.name ?? 'VRM 体验', license, sourceSha256: createHash('sha256').update(bytes).digest('hex'), config};
}
