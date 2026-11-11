import assert from 'node:assert/strict';
import test from 'node:test';
import { isDocsOnly } from './ci-scope.mjs';
test('documentation edits take the short gate, including historical prose', () => {
  assert(isDocsOnly(['README.md', 'CHANGELOG.md', 'packages/core/CHANGELOG.md', 'packages/hexo/README.en.md', 'docs/history/old-release.md']));
});
test('unknown files, package metadata, workflows and mixed changes keep the complete gate', () => {
  for (const file of ['package-lock.json', '.changeset/config.json', '.github/workflows/ci.yml', 'tools/release.mjs', 'docs/helper.mjs', 'new-file'])
    assert(!isDocsOnly(['README.md', file]), file);
  assert(!isDocsOnly([]));
});
