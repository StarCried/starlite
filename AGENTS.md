# StarLite project instructions

## Repository boundaries

- `packages/core` owns the format-neutral playback contract,
  cancellable mounts and dialogue scheduling. It must not import a backend.
- `packages/vrm` owns VRM inspection/preparation, Three.js/three-vrm
  rendering, VRMA playback and data-only character profiles. Keep private
  character models and animation-authoring projects outside this repository.
- Product names are StarLite, StarLite for Hexo and StarLite for DSH. Local
  checkouts use `starlite` and `starlite-dsh`; package names and repository metadata
  follow these identities. The GitHub repositories have been renamed to
  `StarCried/starlite` and `StarCried/starlite-dsh` with user approval.
  Pushing source and publishing releases require explicit user approval.

- `crates/inochi2d-pipeline` owns untrusted `.inp/.inx` inspection,
  compatibility and rights reports, deterministic texture optimization
  (lossless unless web limits require resizing), manifests, and transactional
  output.
- `tools/build-official-sdk.mjs` owns the reproducible official D-SDK download,
  source compatibility patches, minimal browser export surface, Binaryen
  optimization, and pinned output hashes.
- `packages/inochi2d` owns model fetch, official WASM calls, WebGL2 command
  rendering, lifecycle, motion synthesis, interaction, DPR/FPS policy, and
  fallback presentation.
- `packages/hexo` owns Hexo 7 configuration, manifest verification,
  hashed asset routes, injection, and PJAX-safe singleton bootstrapping.
- `packages/inochi2d-blog` owns fail-closed orchestration. No code path may call
  `hexo deploy` before rights, identity, preparation, generation, and browser
  gates have all passed.
- Examples may depend on packages; packages must not depend on examples.
- Shared UI locales are `zh-CN` and `en`. Hexo resolves an explicit locale before
  its configured language; preserve user-authored dialogue and model metadata.
  The Inochi2D raw browser distribution needs its local locale facade and bundled
  `locale.js`, not a bare package import. Keep translated example terms in sync
  with canonical documents and the DSH copies.

## Public and private assets

- Never add StarCried source art, Creator projects, private puppets, credentials,
  deployment tokens, or real blog content.
- Committed fixtures must be synthetic, artwork-free, and redistributable.
- Third-party puppets are ignored local test inputs only, with license and
  attribution recorded in `docs/validation.md`.
- Package checks must reject `.inp`, `.inx`, `.vrm`, `.vrma` and `.blend` files.
  The user-approved Idle plus CuriousPeek, HappyWave and SleepyStartle ship as
  embedded, artwork-free motion data. Keep `BUNDLED_MOTIONS.json` hashes and
  provenance with the runtime; HappyWave reuses a selected Warudo upper-body
  motion and must not be described as wholly original. Use reserved names
  `StarLiteIdle`, `StarLiteCuriousPeek`, `StarLiteHappyWave`, `StarLiteSleepyStartle`.
  Existing user mappings remain unchanged when the catalog gains program clips.
- Default Hexo examples are selected with `starlite.preset`; keep the initial
  Weiguang choice and download only the selected example. Each catalog entry
  has separate pinned assets and model terms, available before download. The
  code's BSD license never applies to example artwork. Verify exported VRM0
  orientation in the actual runtime (which rotates VRM0), not only Blender.
- A Hexo preset's explicit `adjustments` override replaces the entire calibration;
  do not deep-merge it, because the adjustment preview exports `{}` to clear
  corrections. The preview reads validated `extras.starlite.adjustments` defaults;
  the runtime still takes its calibration from host config, without a fallback
  that would silently restore model defaults after a user clears them.

## Compatibility contract

- Version 0.1 targets current desktop Chrome and Edge with WebGL2.
- Mobile defaults to hidden and must return before runtime import or model/WASM
  fetch.
- Model-authored, non-additive `Forced` animation lanes may be normalized by the
  pipeline and played by exact name. Creator `leadIn`/`leadOut` regions may be
  used for explicitly configured ambient loops. MeshGroup, Camera,
  SimplePhysics, Cubic bindings, and ColorBurn are supported by the pinned SDK
  compatibility profile. Do not add WebGL1, BC7, model automation,
  additive/Bezier/crossfade animation behavior, voice/camera input, or
  Firefox/Safari support without an approved scope change.
- VRM state changes use a bounded 400 ms captured-pose blend with cubic
  ease-in/ease-out weights for gesture continuity; this is not velocity-preserving
  inertialization.
  Explicit stop/destroy still restore neutral immediately; the Inochi2D animation
  restrictions above are unchanged.
- VRM bubble anchors sample the initial neutral alpha silhouette once and project
  the cached reference point (falling back to visible bounds) through the base
  portrait camera, in host-local CSS pixels. Do not use animated bounds, expanded
  canvas padding or device pixels: doing so moves bubbles during gestures or DPI
  changes. DSH consumes this optional core capability without resizing its window.
- Environment lighting is an optional RGB host hint, not the existing `ambient`
  animation setting. Keep colour acquisition in host adapters; the VRM backend
  reuses its hemisphere and white-key lights, normalizes chroma independently of
  luminance, and bounds the brightness target to .8–1.1. Strength defaults to 1
  and accepts 0–2; preserve the accepted 0–1 curve exactly, then amplify linearly
  above 1 (effective overall light multiplier .6–1.2 at strength 2).
  Null/zero restores both original light intensities and colours;
  near-black hints must not amplify colour noise. Hexo uses explicit bright/dark
  colours with one lifecycle-owned theme observer, never
  screen capture. Keep mobile, retry and PJAX cleanup paths paired.
- Keep official SDK source, toolchain, raw WASM, optimized WASM, LLD, and
  Binaryen versions synchronized with `tools/official-sdk/pin.json` and
  `docs/upstream.md`.

## Change and validation rules

- Use small changes and test the narrow package first.
- Treat `.inp/.inx` input, native manifests, generated paths, and browser draw
  buffers as untrusted.
- Any malformed, non-finite, incompatible, unauthorized, or hash-mismatched
  state must fail closed; never continue to deployment.
- Run `npm run validate`, the public-model browser gate when available,
  `npm run test:browser`, package dry runs, and `git diff --check` before release.
- Keep documentation, config examples, tests, lockfiles, and package contents
  synchronized with behavior changes.

## External actions

Local branches, builds, and tests are allowed. Pushing a remote, opening an
issue or pull request, publishing npm packages, copying a public puppet into a
deployment, and running a real blog deploy each require separate user approval.
Do not submit AI-generated source to an upstream repository whose contribution
policy prohibits it.
