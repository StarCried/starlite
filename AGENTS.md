# Model Companion Web project instructions

## Repository boundaries

- `packages/model-widget-core` owns the format-neutral playback contract,
  cancellable mounts and dialogue scheduling. It must not import a backend.
- `packages/vrm-web` owns VRM inspection/preparation, Three.js/three-vrm
  rendering, VRMA playback and data-only character profiles. Keep private
  character models and animation-authoring projects outside this repository.
- Product names are Model Companion Web and DSH Companion. Remote repository
  URLs and Inochi2D-specific package names describe their actual identities.

- `crates/inochi2d-pipeline` owns untrusted `.inp/.inx` inspection,
  compatibility and rights reports, deterministic texture optimization
  (lossless unless web limits require resizing), manifests, and transactional
  output.
- `tools/build-official-sdk.mjs` owns the reproducible official D-SDK download,
  source compatibility patches, minimal browser export surface, Binaryen
  optimization, and pinned output hashes.
- `packages/inochi2d-web` owns model fetch, official WASM calls, WebGL2 command
  rendering, lifecycle, motion synthesis, interaction, DPR/FPS policy, and
  fallback presentation.
- `packages/hexo-model-companion` owns Hexo 7 configuration, manifest verification,
  hashed asset routes, injection, and PJAX-safe singleton bootstrapping.
- `packages/inochi2d-blog` owns fail-closed orchestration. No code path may call
  `hexo deploy` before rights, identity, preparation, generation, and browser
  gates have all passed.
- Examples may depend on packages; packages must not depend on examples.

## Public and private assets

- Never add StarCried source art, Creator projects, private puppets, credentials,
  deployment tokens, or real blog content.
- Committed fixtures must be synthetic, artwork-free, and redistributable.
- Third-party puppets are ignored local test inputs only, with license and
  attribution recorded in `docs/validation.md`.
- Package checks must reject `.inp`, `.inx`, `.vrm`, `.vrma` and `.blend` files.

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
- VRM state changes use a bounded 400 ms captured-pose blend for gesture continuity.
  Explicit stop/destroy still restore neutral immediately; the Inochi2D animation
  restrictions above are unchanged.
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
