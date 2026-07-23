# inochi2d-web

An unofficial, framework-free Inochi2D WebGL2 runtime, Hexo widget, and
fail-closed model-to-blog toolchain.

This repository is not affiliated with or endorsed by the Inochi2D project. It
is AI-assisted and human-reviewed. It is licensed under BSD-2-Clause; model
copyright and redistribution rights remain separate.

## Packages

- `inochi2d-web` loads Creator `.inp`/`.inx` bytes through a reproducible build
  of the official [Inochi2D D SDK](https://github.com/Inochi2D/inochi2d), draws
  its command list with WebGL2, and provides motion and interaction.
- `hexo-inox2d-widget` injects a mobile-safe, PJAX-safe widget into Hexo 7 and
  emits immutable JS, WASM, CSS, model, and fallback routes.
- `inochi2d-pipeline` is a native Windows/Linux inspector and pixel-lossless
  compressor. It rewrites only when the result is smaller and never overwrites
  the source model.
- `inochi2d-blog` joins inspection, authorization, compression, Hexo generation,
  Chrome/Edge validation, and optional `hexo deploy`.

The alpha supports current desktop Chrome and Edge with WebGL2. It includes
blink, breath, pointer following, click pulses, whole-page drag, double-click
reset, fallback rendering, tab pause/resume, context-loss handling, and a static
reduced-motion pose. Mobile is hidden before runtime import, so it fetches no
widget JavaScript, WASM, or model.

WebGL1, BC7, MeshGroup, built-in animations, microphone/lip-sync, camera
tracking, and Firefox/Safari compatibility promises are outside this release.

## Automatic model-to-blog workflow

Copy
[`inochi2d-blog.config.example.json`](packages/inochi2d-blog/inochi2d-blog.config.example.json)
and first run a read-only inspection:

```sh
inochi2d-blog inspect --config inochi2d-blog.config.json
```

Review compatibility, publication metadata, and `source.sha256`. Put that exact
hash in `publication.sourceSha256`, confirm that redistribution is allowed, then
run every gate without deployment:

```sh
inochi2d-blog deploy --dry-run --config inochi2d-blog.config.json
```

Only the explicit command below can invoke the blog's configured Hexo deployer:

```sh
inochi2d-blog deploy --config inochi2d-blog.config.json
```

The last command is fail-closed. Authorization, source identity, native
compression, immutable bundle validation, Hexo clean/generate, desktop browser
rendering, PJAX singleton, layout, and mobile no-fetch checks must all pass
before `hexo deploy` starts. The browser gate measures 90 rendered frames at
DPR 1.25 and requires at least 29.5 FPS with no more than 33 ms p95 render
duration. Any error stops the workflow and restores the prior generated widget
config.

See [pipeline details](docs/pipeline.md), [configuration](docs/configuration.md),
and the [release checklist](docs/validation.md).

## Local development

Required versions are Node.js 22+, Rust 1.85, LLD 20, Binaryen 120, and
`curl`. The official D SDK source and toolchain are downloaded with bounded
retry/resume support from pinned URLs and verified by SHA-256.

```sh
npm ci
npm run validate
npm run test:browser
git diff --check
```

`npm run validate` builds the official SDK WASM, checks Rust and TypeScript,
runs unit tests, builds both examples, verifies generated third-party license
bundles, and inspects package contents. The
repository contains no private StarCried art or puppet. Automated tests use only
source-generated, artwork-free fixtures; the public Aka model is an ignored
local visual test input.

Read [model policy](docs/model-policy.md), [upstream pins](docs/upstream.md),
[third-party notices](THIRD_PARTY_NOTICES.md), and [security policy](SECURITY.md)
before contributing or packaging a release.
