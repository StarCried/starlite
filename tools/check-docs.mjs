import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { releasePlan } from './release.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
releasePlan(root);
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' })
  .trim().split('\n').filter(file => /\.md$/.test(file) && !file.startsWith('docs/history/'));
const missing = [];
for (const file of files) {
  const source = readFileSync(resolve(root, file), 'utf8');
  // Current local document links only; external links and historical evidence are not release state.
  for (const match of source.matchAll(/\]\((<[^>]+>|[^\s)]+)(?:\s+"[^"]*")?\)/g)) {
    const target = match[1].replace(/^<|>$/g, '').split('#')[0];
    if (!target || /^(?:[a-z][a-z\d+.-]*:|\/)/i.test(target)) continue;
    const path = resolve(root, dirname(file), decodeURIComponent(target));
    if (!existsSync(path)) missing.push(`${file}: ${target}`);
  }
}
assert.equal(missing.length, 0, `Broken local documentation links:\n${missing.join('\n')}`);
console.log(`Checked local links in ${files.length} documents and workspace version consistency.`);
