# Alpha status and approval gates

Status on 2026-07-23:

## Implemented and locally validated

- Official Inochi2D D-SDK WASM at a fixed source/toolchain hash, with
  browser-compatibility patches and a 30-symbol export surface.
- 444,786-byte optimized WASM; raw runtime JS plus WASM is below 1.5 MiB.
- WebGL2 rendering with transparent layers, masks/blends, finite draw-buffer
  validation, deterministic teardown, fallback, reduced motion, and
  visibility/context lifecycle.
- Blink, breath, pointer/head tracking, click pulses, whole-page dragging, body
  feedback, and double-click reset.
- Hexo 7 hashed runtime/model assets, strict bundle verification, mobile
  no-fetch bootstrap, and PJAX singleton.
- Windows/Linux native inspection and pixel-lossless TGA conversion/PNG
  recompression with transactional immutable output.
- Fail-closed inspection, preparation, Hexo generation, browser verification,
  dry run, and deployment orchestration.
- Unit tests, synthetic fixtures, Chromium browser tests, CI definitions, and a
  package-only release dry run.
- Deterministic third-party license bundles for the official D-SDK WASM and
  locked native Cargo graph are included in, and verified before packing, the
  respective npm packages.
- Public Aka local test: upright transparent layers, parameter/click motion,
  drag/reset, fallback, Hexo asset verification, and real official-WASM
  rendering passed.
- Native Linux and Windows GNU release binaries were built locally, staged with
  SHA-256 metadata, packed into `inochi2d-blog`, installed from tarballs, and
  the packaged Windows binary successfully inspected the public Aka fixture.
- The minimal Hexo public-model dry run measured exactly 30.00 FPS and 0.80 ms
  p95 render duration at DPR 1.25 over 90 GPU-synchronized frames.
- The Windows blog's full-screen `starfield.js` was optimized without lowering
  its animation rate: the nearly static atmosphere is cached for one second,
  orbit trigonometry is computed once per frame, the primary sky stays at full
  DPR, and only the masked duplicate cover layer is capped at 0.9x.
- The complete packaged Windows Volantis dry run now passes from the original
  Aka `.inx`: Chrome measured 29.98 FPS and 0.90 ms p95; Edge measured 29.97 FPS
  and 1.00 ms p95. The command generated 446 files and explicitly did not
  execute `hexo deploy`.
- Desktop/mobile checks passed on home, about, gallery, friends, prose, and
  code-heavy pages. Twenty PJAX events retained one sky, one cover sky on home,
  and one model canvas; mobile fetched no model/runtime assets; reduced motion
  scheduled no starfield animation frames.

## Remaining release gates

- Run the same native/package release dry run on GitHub infrastructure.
- Perform the final human visual review in both installed browsers after the
  clean-worktree blog changes are merged.
- Create and approve a separate redistributable StarCried blog puppet, or keep
  using a credited third-party/manual fixture.
- Review the complete diff and third-party notices before the first public push.

## External approval still required

Creating or pushing the public remote, opening an upstream issue, publishing npm
packages, copying a model into a public deployment, and running production
`hexo deploy` are separate approval gates. CI workflows are source files only
until a remote exists; neither workflow publishes or deploys.
