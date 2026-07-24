# Alpha status and approval gates

Status on 2026-07-24:

## Implemented and locally validated

- Official Inochi2D D-SDK WASM at a fixed source/toolchain hash, with
  browser-compatibility patches and a 31-symbol export surface.
- 445,034-byte optimized WASM; raw runtime JS plus WASM is below 1.5 MiB.
- WebGL2 rendering with transparent layers, masks/blends, finite draw-buffer
  validation, deterministic teardown, fallback, reduced motion, and
  visibility/context lifecycle.
- Blink, breath, pointer/head tracking, whole-page dragging, body feedback, and
  double-click reset. Strict model-animation extraction, named playback, and
  missing-animation failure paths pass unit tests. A Creator-authored public
  Aka test copy's `Click` clip passed official-WASM, Chromium, installed Chrome,
  and installed Edge visual interaction gates without a synthesized fallback.
  Enabling reduced motion during an active clip restores its affected model
  parameters instead of leaving the puppet frozen at an intermediate pose.
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
- Public Aka pre-animation baseline: upright transparent layers, parameter motion,
  drag/reset, fallback, Hexo asset verification, and real official-WASM
  rendering passed.
- Public Aka's Breath parameter now changes more than twenty final draw
  vertices across its range. The runtime still probes draw output and selects a
  restored-value camera breathing fallback for genuinely ineffective targets,
  but Aka uses its authored mesh deformation.
- Real pointer press/release shares the drag recognizer: sub-six-pixel travel
  triggers the configured model animation, while larger movement remains an
  exclusive whole-widget drag. No parameter-pulse fallback remains; a missing
  or invalid configured clip stops the automatic workflow.
- Aka names arms anatomically. Its `Arm:: Left:: Move` produces the screen-right
  action and `Arm:: Right:: Move` produces the screen-left action. Both arms and
  their hands are bound in the source model and now move together in the
  browser.
- D-SDK migration regressions reported during human review were reproduced and
  fixed: browser upload no longer flips already-decoded textures; legacy 1D/2D
  ranges, composite tint/screen tint, simple-physics output scale, and mesh
  deformation vectors now deserialize through the correct fixed-vector
  storage. The previous generic `vec2` conversion silently replaced every
  legacy deformation vector with zero. The runtime validates model ranges and
  clamps finite external parameter values to them.
- Synthetic compatibility tests now cover legacy scalar/vector ranges,
  non-zero mesh deformation vectors, and composite colors. The ignored public
  Aka fixture scans
  `Head:: Yaw-Pitch` across its full range and rejects frozen segments or
  discontinuous jumps.
- Final npm tarballs install into a fresh directory without lifecycle
  execution; the packaged Linux native helper inspects Aka successfully and a
  production-dependency `npm audit` reports zero vulnerabilities. The reviewed
  local candidate hashes are `a406ec109aeb8af267090211f0e779f6961de822fabbfb9a1aa4353592b95860`
  (`inochi2d-web`), `59ee023e4a349611bea03443094c8069147e722b2a13fb7c3645405a0aed7d9c`
  (`hexo-inox2d-widget`), and
  `9856c67f1e001ae133559bcc03a6970661d21d82c225b7ba341c0d76a03b3956`
  (`inochi2d-blog`).
- Native Linux and Windows GNU release binaries were built locally, staged with
  SHA-256 metadata, packed into `inochi2d-blog`, installed from tarballs, and
  the packaged Windows binary successfully inspected the public Aka fixture.
- The minimal Hexo public-model dry run measured exactly 30.00 FPS and 0.80 ms
  p95 render duration at DPR 1.25 over 90 GPU-synchronized frames.
- The Windows blog's full-screen `starfield.js` was optimized without lowering
  its animation rate: the nearly static atmosphere is cached for one second,
  orbit trigonometry is computed once per frame, the primary sky stays at full
  DPR, and only the masked duplicate cover layer is capped at 0.9x.
- The final packaged Windows Volantis dry run used the normalized
  model-authored `Click` manifest and a manifest-addressed immutable bundle.
  Chrome and Edge each measured 29.98 FPS; p95 render duration was 0.90 ms and
  1.10 ms respectively. Both installed browsers passed the visible click pose,
  pointer, drag/reset, PJAX, layout, and mobile no-fetch gates. `hexo deploy`
  was not executed.
- Windows endpoint policy blocked the newly packed unsigned helper exactly as
  expected. The CLI stopped before writing or generating the blog. Final local
  validation then used a hash-verified executable built from the same reviewed
  source via the documented `pipelineBinary` override; no system protection was
  disabled or bypassed.
- Desktop/mobile checks passed on home, about, gallery, friends, prose, and
  code-heavy pages. Twenty PJAX events retained one sky, one cover sky on home,
  and one model canvas; mobile fetched no model/runtime assets; reduced motion
  scheduled no starfield animation frames.

## Remaining release gates

- Run the same native/package release dry run on GitHub infrastructure.
- Keep the clean worktree's machine-local Aka bundle/config and self-built
  executable test-only; they must not be merged or deployed. Production blog
  integration remains a separate reviewed change.
- Create and approve a separate redistributable StarCried blog puppet, or keep
  using a credited third-party/manual fixture.
- Run the reviewed source and package candidate through hosted CI before the
  first public tag.

## External approval still required

Creating or pushing the public remote, opening an upstream issue, publishing npm
packages, copying a model into a public deployment, and running production
`hexo deploy` are separate approval gates. CI workflows are source files only
until a remote exists; neither workflow publishes or deploys.
