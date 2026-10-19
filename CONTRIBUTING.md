# Contributing

This is an unofficial, AI-assisted and human-reviewed project. Contributions
must be understandable, reproducible, and compatible with the repository's
BSD-2-Clause license.

## Before changing code

1. Keep native preparation, official SDK compatibility, browser rendering,
   Hexo integration, and deployment orchestration in their existing layers.
2. Use only synthetic committed fixtures. Never attach a private or
   non-redistributable puppet to a patch or issue.
3. Discuss changes to public APIs, compatibility targets, production
   dependencies, package layout, security gates, or deployment behavior first.
4. Preserve fail-closed behavior: an uncertain result is an error, not
   permission to publish or deploy.

## Validation

Run the narrow test first, then:

```sh
npm run validate
npm run test:browser
git diff --check
```

When a redistributable local puppet is available, also set
`INOCHI2D_TEST_MODEL_PATH` and run the browser tests. Windows Chrome and Edge on
an isolated Hexo site remain a release gate. Do not overwrite a user's real
blog or private model. See [model compatibility](docs/model-compatibility.md),
[performance budgets](docs/performance.md) and [dependency auditing](docs/dependency-audit.md).

## Upstream work

The browser build consumes the official Inochi2D D SDK at the revision in
`tools/official-sdk/pin.json`. Compatibility patches live here until an upstream
API supports the same behavior. Before any upstream contact, inspect its current
contribution policy, avoid duplicating active work, prepare a minimal factual
reproducer, and obtain approval to post externally. Do not copy this project's
AI-generated implementation into an upstream that does not accept it.
