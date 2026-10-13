import {createHash} from 'node:crypto';
import {lstat, readdir, readFile, mkdir, writeFile} from 'node:fs/promises';
import {resolve, dirname, join} from 'node:path';

const MAX_ARCHIVE = 64 * 1024 * 1024;
const MAX_FILE = 16 * 1024 * 1024;
const MAX_TOTAL = 128 * 1024 * 1024;
const MAX_FILES = 512;

export function safeRelative(name) {
  if (typeof name !== 'string' || !name || name.length > 512 || /[\\\u0000-\u001f<>:"|?*]/u.test(name) || name.startsWith('/') || name.split('/').some(part => !part || part === '.' || part === '..' || /[. ]$/u.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(part))) {
    throw new Error(`Unsafe bundle path: ${JSON.stringify(name)}`);
  }
  return name;
}

// Read the central directory before decoding: fflate's local entry API does not
// expose Unix file types, encrypted flags or the complete allocation budget.
export function inspectZip(bytes) {
  if (bytes.length > MAX_ARCHIVE) throw new Error('ZIP exceeds the 64 MiB limit');
  let end = -1;
  for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 65557); index--) {
    if (bytes.readUInt32LE(index) === 0x06054b50 && index + 22 + bytes.readUInt16LE(index + 20) === bytes.length) { end = index; break; }
  }
  if (end < 0) throw new Error('Invalid ZIP end record');
  const count = bytes.readUInt16LE(end + 10), size = bytes.readUInt32LE(end + 12), offset = bytes.readUInt32LE(end + 16);
  if (bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6) || bytes.readUInt16LE(end + 8) !== count || count === 65535 || count > MAX_FILES || offset + size !== end) throw new Error('Unsupported multi-disk, ZIP64 or oversized ZIP');
  const files = new Map(), seen = new Set(); let position = offset, total = 0;
  for (let index = 0; index < count; index++) {
    if (position + 46 > end || bytes.readUInt32LE(position) !== 0x02014b50) throw new Error('Invalid ZIP central entry');
    const flags = bytes.readUInt16LE(position + 8), method = bytes.readUInt16LE(position + 10), compressed = bytes.readUInt32LE(position + 20), length = bytes.readUInt32LE(position + 24);
    const nameLength = bytes.readUInt16LE(position + 28), extraLength = bytes.readUInt16LE(position + 30), commentLength = bytes.readUInt16LE(position + 32), mode = bytes.readUInt32LE(position + 38) >>> 16;
    const next = position + 46 + nameLength + extraLength + commentLength;
    if (next > end || flags & 1 || ![0, 8].includes(method) || compressed === 0xffffffff || length === 0xffffffff) throw new Error('Unsupported ZIP entry');
    const name = bytes.subarray(position + 46, position + 46 + nameLength).toString('utf8');
    const directory = name.endsWith('/'); safeRelative(directory ? name.slice(0, -1) : name);
    const kind = mode & 0xf000;
    if (kind && kind !== (directory ? 0x4000 : 0x8000)) throw new Error('ZIP symlinks and special files are not allowed');
    const identity = (directory ? name.slice(0, -1) : name).toLowerCase();
    if (seen.has(identity)) throw new Error('Duplicate ZIP path'); seen.add(identity);
    if (length > MAX_FILE || (total += length) > MAX_TOTAL) throw new Error('ZIP expanded size exceeds the limit');
    files.set(name, {length, directory}); position = next;
  }
  if (position !== end) throw new Error('Invalid ZIP central directory size');
  return files;
}

async function extractZip(source, destination) {
  const metadata = await lstat(source);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > MAX_ARCHIVE) throw new Error('Expected a regular ZIP of at most 64 MiB');
  const bytes = await readFile(source), expected = inspectZip(bytes);
  const {Unzip, UnzipInflate} = await import('fflate');
  const entries = new Map(); let total = 0;
  const unzip = new Unzip(file => {
    const record = expected.get(file.name);
    if (!record || entries.has(file.name)) throw new Error('ZIP local entry does not match its central directory');
    const chunks = []; let length = 0;
    const state = {done: false, chunks, record}; entries.set(file.name, state);
    file.ondata = (error, chunk, final) => {
      if (error) throw error;
      length += chunk.length; total += chunk.length;
      if (length > record.length || length > MAX_FILE || total > MAX_TOTAL) throw new Error('ZIP expanded size does not match its declared limit');
      chunks.push(Buffer.from(chunk));
      if (final) { if (length !== record.length) throw new Error('ZIP truncated entry'); state.done = true; }
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  for (let offset = 0; offset < bytes.length; offset += 4096) unzip.push(bytes.subarray(offset, offset + 4096), offset + 4096 >= bytes.length);
  if (entries.size !== expected.size || [...entries.values()].some(entry => !entry.done)) throw new Error('ZIP is missing complete entries');
  for (const [name, {chunks, record}] of entries) {
    if (record.directory) continue;
    const path = join(destination, safeRelative(name)); await mkdir(dirname(path), {recursive: true}); await writeFile(path, Buffer.concat(chunks));
  }
}

async function listFiles(root, prefix = '', state = {total: 0, count: 0}) {
  const records = [];
  for (const entry of await readdir(join(root, prefix), {withFileTypes: true})) {
    if (++state.count > MAX_FILES) throw new Error('Bundle contains too many files or directories');
    const name = safeRelative(prefix ? `${prefix}/${entry.name}` : entry.name), path = join(root, name), metadata = await lstat(path);
    if (metadata.isSymbolicLink()) throw new Error('Bundle symlinks are not allowed');
    if (metadata.isDirectory()) records.push(...await listFiles(root, name, state));
    else {
      if (!metadata.isFile() || metadata.size > MAX_FILE || (state.total += metadata.size) > MAX_TOTAL) throw new Error('Bundle contains a special file or exceeds its size limit');
      records.push(name);
    }
  }
  return records;
}

export async function verifyChecksums(root) {
  const files = await listFiles(root);
  if (!files.includes('SHA256SUMS')) throw new Error('The resource package is missing SHA256SUMS');
  const text = await readFile(join(root, 'SHA256SUMS'), 'utf8'), expected = new Map();
  for (const line of text.trim().split(/\r?\n/u)) {
    const match = /^([a-f0-9]{64})  (.+)$/u.exec(line);
    if (!match) throw new Error('Invalid SHA256SUMS line');
    const name = safeRelative(match[2]);
    if (name === 'SHA256SUMS' || expected.has(name.toLowerCase())) throw new Error('Duplicate or recursive checksum');
    expected.set(name.toLowerCase(), {name, hash: match[1]});
  }
  if (files.length !== expected.size + 1) throw new Error('SHA256SUMS does not cover every resource file');
  for (const name of files) {
    if (name === 'SHA256SUMS') continue;
    const record = expected.get(name.toLowerCase());
    if (!record || record.name !== name) throw new Error(`Missing resource checksum: ${name}`);
    const actual = createHash('sha256').update(await readFile(join(root, name))).digest('hex');
    if (actual !== record.hash) throw new Error(`Resource SHA-256 mismatch: ${name}`);
  }
}

export async function prepareBundle(source, destination) {
  const input = resolve(source), metadata = await lstat(input);
  if (metadata.isSymbolicLink()) throw new Error('The bundle itself must not be a symlink');
  await mkdir(destination, {recursive: true});
  if (metadata.isDirectory()) {
    await verifyChecksums(input);
    for (const name of await listFiles(input)) { const output = join(destination, name); await mkdir(dirname(output), {recursive: true}); await writeFile(output, await readFile(join(input, name))); }
  } else await extractZip(input, destination);
  await verifyChecksums(destination);
  for (const name of ['blog/widget-config.json', 'blog/manifest.json', 'LICENSE-Weiguang.md', 'fallback.png']) {
    if (!(await lstat(join(destination, name))).isFile()) throw new Error(`Missing resource: ${name}`);
  }
  const config = JSON.parse(await readFile(join(destination, 'blog/widget-config.json'), 'utf8'));
  if (config.backend !== 'vrm') throw new Error('The quick start requires a VRM blog package');
  const manifest = JSON.parse(await readFile(join(destination, 'blog/manifest.json'), 'utf8'));
  if (manifest.publication?.allowRedistribution !== true) throw new Error('The model package has not allowed redistribution');
  return {config, manifest, license: await readFile(join(destination, 'LICENSE-Weiguang.md'), 'utf8')};
}
