# Changelog

All notable changes will be recorded here. The project follows semantic
versioning once packages are published.

## 0.1.0-alpha.1 - Unreleased

- Added a reproducible browser build of the official Inochi2D D SDK.
- Added a framework-free WebGL2 renderer and widget controller.
- Added blink, breath, pointer, click, drag, reset, fallback, reduced-motion,
  visibility, DPR, frame-rate, and context-loss behavior.
- Added a Hexo 7 adapter with hashed assets, mobile no-fetch bootstrap, and a
  PJAX-safe singleton.
- Added a native Windows/Linux model inspection and lossless compression
  pipeline for Creator `.inp` and `.inx` exports.
- Added the fail-closed `inochi2d-blog` inspection, preparation, verification,
  and deployment workflow with a built-in read-only preview server and
  interaction and measured performance gates.
- Added synthetic fixtures, unit tests, Chromium gates, CI validation, and a
  release dry run that never publishes packages or deploys a blog.
- Fixed model-space Y projection so Creator models render upright and added a
  public-model orientation regression.
- Pinned the native image pipeline to the latest release compatible with the
  declared Rust 1.85 toolchain.
- Fixed 30 FPS scheduling near display refresh deadlines and added 60 Hz and
  32.5 Hz timing regressions.
- Added deterministic full third-party license bundles for the official D-SDK
  WASM and native Cargo dependency graph, with stale-output package gates.

No public package, repository push, or production blog deployment is part of
this unreleased entry.
