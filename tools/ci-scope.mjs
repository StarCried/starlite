import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Only prose has a cheap path. Unknown files and all tooling still get the full gate.
export const isDocsOnly = paths => paths.length > 0 && paths.every(path =>
  /^(?:(?:README(?:\.en)?|CHANGELOG)\.md|AGENTS\.md|CONTRIBUTING\.md|docs\/.*\.md|packages\/[^/]+\/(?:README(?:\.en)?|CHANGELOG)\.md)$/.test(path));

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const base = event.pull_request?.base?.sha ?? event.before;
  const head = event.pull_request?.head?.sha ?? process.env.GITHUB_SHA;
  const files = base && !/^0+$/.test(base)
    ? execFileSync('git', ['diff', '--name-only', base, head], { encoding: 'utf8' }).trim().split('\n').filter(Boolean) : [];
  const docsOnly = isDocsOnly(files);
  console.log(JSON.stringify({ docsOnly, files }));
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `docs-only=${docsOnly}\n`);
}
