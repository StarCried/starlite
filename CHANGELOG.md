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
- Added strict extraction and browser playback of Creator model animations.
  Stationary press/release triggers the configured case-sensitive animation
  name (`Click` by default in the Hexo adapter); movement beyond the drag
  threshold remains a drag. Missing, malformed, unsupported, or mismatched
  animation data stops preparation or Hexo generation, with no parameter-pulse
  fallback.
- Matched Creator/SDK animation sampling for nearest, stepped, linear, and
  four-point cubic interpolation; retained vector parameter defaults and the
  official `-1` lead marker sentinel. Additive, non-`Forced`, and Bezier lanes
  remain explicit alpha blockers.
- Included the normalized manifest hash in immutable bundle directory names so
  pipeline upgrades cannot accidentally reuse stale animation metadata when
  the copied model bytes are unchanged.
- Added a restored-value draw-list probe for configured breath parameters.
  Models whose declared Breath bindings produce no visible output receive a
  subtle camera-scale idle fallback; effective model breathing is preserved.
- Added deterministic full third-party license bundles for the official D-SDK
  WASM and native Cargo dependency graph, with stale-output package gates.
- Fixed the official D-SDK browser migration so decoded textures retain their
  source orientation and legacy parameter ranges, composite colors,
  simple-physics output scales, and mesh deformation vectors deserialize
  correctly. The deformation fix prevents bound sleeves from remaining frozen
  while their separately transformed hands move.
- Added parameter-bound validation and clamping, a synthetic legacy
  compatibility fixture, and a full-range public Aka continuity regression.
- Increased the default desktop bottom clearance so the widget does not
  overlap Volantis' fixed return-to-top control at 1440 x 900.
- Defined `inochi2d-web` and `hexo-inox2d-widget` as the normal browser alpha,
  while `inochi2d-blog` and its bundled native pipeline are an explicitly
  invoked experimental unsigned alpha. Installation has no native lifecycle
  script; integrity, authorization, or execution failures remain fail-closed.

No public package, repository push, or production blog deployment is part of
this unreleased entry.
