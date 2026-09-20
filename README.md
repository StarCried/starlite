# Model Companion Web

Framework-free model companions for websites and desktop applications, with
interchangeable Inochi2D and VRM WebGL2 components. DSH Companion consumes the
same built runtime packages as the Hexo adapter.

This repository is not affiliated with or endorsed by the Inochi2D project. It
is AI-assisted and human-reviewed. It is licensed under BSD-2-Clause; model
copyright and redistribution rights remain separate.

## Component boundaries

| Package | Owns | Does not own |
| --- | --- | --- |
| `model-widget-core` | Playback contract, mount cancellation, dialogue scheduling | Model format, DSH states, rendering |
| `inochi2d-web` | Inochi2D loading, WASM, parameters, animation | VRM bones or expressions |
| `vrm-web` | VRM0/1, VRMA playback, profile validation, bundle preparation | DSH protocol or character source art |
| `hexo-model-companion` | Selected runtime assets, publication checks, page lifecycle | Rendering and motion authoring |
| `inochi2d-pipeline` / `inochi2d-blog` | Inochi2D preparation and publishing workflow | VRM preparation or generic deployment |

Choose a backend through `backend: "inochi2d" | "vrm"`. Character profiles and
VRMA files are assets; they do not require changes to application status logic.
See [architecture](docs/architecture.md) for ownership and dependency direction,
and [VRM usage](packages/vrm-web/README.md) for private local previews.

The repository remote remains `StarCried/inochi2d-web`; it has not been renamed
or published by this local change. Existing Hexo configurations keep the
`inochi2d_widget` key, which selects either backend. The npm adapter is now
`hexo-model-companion`; no duplicate adapter package is installed.

## Inochi2D toolchain

- `inochi2d-web` loads Creator `.inp`/`.inx` bytes through a reproducible build
  of the official [Inochi2D D SDK](https://github.com/Inochi2D/inochi2d), draws
  its command list with WebGL2, and provides motion and interaction.
- `hexo-model-companion` injects a mobile-safe, PJAX-safe widget into Hexo 7 and
  emits immutable JS, WASM, CSS, model, and fallback routes.
- `inochi2d-pipeline` is a native Windows/Linux inspector and deterministic
  compressor. It first performs pixel-lossless PNG/TGA optimization, then
  resizes textures only when WebGL dimensions or the 8 MiB model budget require
  it. It never overwrites the source model and records every lossy resize.
- `inochi2d-blog` joins inspection, authorization, compression, Hexo generation,
  Chrome/Edge validation, and optional `hexo deploy`.

The Inochi2D alpha supports current desktop Chrome and Edge with WebGL2. It includes
blink, breath, pointer following, model-authored ambient loops and
enter/idle/click scene animations, configurable plain-text dialogue libraries,
procedural parameter loops for rigs without embedded animation clips,
model-authored `SimplePhysics`, MeshGroup deformation, automatic model fitting,
whole-page drag, double-click reset, fallback rendering, tab pause/resume,
context-loss handling, and a static reduced-motion pose. Mobile is hidden
before runtime import, so it fetches no widget JavaScript, WASM, or model.

The runtime probes the configured breath target against the official draw list
after loading. A model parameter that produces no visible output receives a
subtle camera-scale breathing fallback; a working model binding remains in full
control. Pointer press/release with less than six pixels of travel triggers the
configured click scene or legacy animation, while larger travel is treated
exclusively as a drag. Ambient clips use their Creator loop region, foreground
scenes temporarily take precedence, and the official SDK advances
model-authored physics after interaction parameters are applied. Procedural
ambient loops run only for exact parameters verified in the model profile.
There is no synthesized click pose or physics fallback: a missing, malformed,
or unsupported configured animation stops preparation or Hexo generation.

WebGL1, BC7, model automation, additive or non-`Forced` animation lanes, Bezier
interpolation, crossfades, microphone/lip-sync, camera tracking, and
Firefox/Safari compatibility promises are outside this release.

## Alpha channels and native executable

`inochi2d-web` and `hexo-model-companion` are the normal browser alpha. They run
JavaScript, WebAssembly, and WebGL2 in the generated site and do not need a
native executable.

`inochi2d-blog` and its bundled `inochi2d-pipeline` are an **experimental,
unsigned native alpha**. Installing the npm package does not run the executable:
there is no install or postinstall lifecycle script. The native program starts
only when the operator explicitly invokes `inspect`, `preview`, `prepare`,
`verify`, or `deploy`. A packaged binary is checked against its exact SHA-256
manifest before execution.

Windows Smart App Control, antivirus, or other endpoint policy may warn about or
block the unsigned binary. Do not weaken those controls for this project. If the
binary cannot start, the command exits with an error before any subsequent Hexo
generation or deployment. Users can instead build the pipeline from source and
select that trusted local build with `pipelineBinary`. On Windows, an explicit
`pipeline.backend: "wsl"` configuration can run only inspection and compression
through a named WSL distribution while keeping Hexo and Chrome/Edge on Windows.
It never auto-detects or falls back; WSL/path/process errors stop the workflow.

## Automatic model-to-blog workflow

Copy
[`inochi2d-blog.config.example.json`](packages/inochi2d-blog/inochi2d-blog.config.example.json)
and first run a read-only inspection and an isolated local preview:

```sh
inochi2d-blog inspect --config inochi2d-blog.config.json
inochi2d-blog preview --config inochi2d-blog.config.json
```

The preview command needs no redistribution attestation. It compresses and
generates only below `.inochi2d/preview`, validates the browser behavior, serves
only on `127.0.0.1`, cannot deploy, and removes the temporary run after Ctrl+C.
Publication metadata is a warning in this mode; technical failures still stop
the command.

Windows users choosing WSL compression should instead start from
[`inochi2d-blog.config.wsl.example.json`](packages/inochi2d-blog/inochi2d-blog.config.wsl.example.json).

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

The last command is fail-closed. Authorization, source identity, every
configured ambient/scene animation, sentence-library configuration, native
compression, immutable bundle validation, Hexo clean/generate, desktop browser
rendering, PJAX singleton, layout, and mobile no-fetch checks must all pass
before `hexo deploy` starts. The browser gate
measures 90 rendered frames at DPR 1.25 and requires at least 29.5 FPS with no
more than 33 ms p95 render duration. Any error stops the workflow and restores
the prior generated widget config.

See [pipeline details](docs/pipeline.md), [configuration](docs/configuration.md),
and the [release checklist](docs/validation.md).

## Local development

Required versions are Node.js 22.12+, Rust 1.85, LLD 20, Binaryen 120, and
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
