# Validation checklist

## Local commands

```sh
npm ci
npm run check:rust
npm run lint
npm run typecheck
npm run build
npm test
npm run test:browser
npm run pack:check
git diff --check
```

For a prepared redistributable model:

```sh
INOCHI2D_TEST_MODEL_PATH=/absolute/path/model.inp npm test --workspace inochi2d-web
INOCHI2D_TEST_MODEL_PATH=/absolute/path/model.inp npm run test:browser
```

The release dry-run additionally builds native Linux x64 and Windows x64
binaries, stages a SHA-256 manifest, checks all npm package contents, creates
tarballs, and uploads artifacts. It never publishes npm packages or deploys a
blog.

## First public alpha

Publication remains a separate maintainer approval after the public repository
and hosted release-dry-run succeed. Publish the exact reviewed tarballs in
dependency order, using the non-default `alpha` dist-tag:

```sh
npm publish inochi2d-web-0.1.0-alpha.1.tgz --tag alpha
npm publish hexo-inox2d-widget-0.1.0-alpha.1.tgz --tag alpha
npm publish inochi2d-blog-0.1.0-alpha.1.tgz --tag alpha
```

Before the first command, verify npm authentication/MFA, package-name
availability, `SHA256SUMS`, and the public Git commit used to build the
artifacts. After each command, inspect its registry version, integrity, and
dist-tag before continuing. An npm release does not authorize publishing a
model or running production `hexo deploy`.

## Required failure paths

- Valid, malformed, missing, and cross-origin model responses.
- Unsupported/corrupt `.inp/.inx`, BC7, resource limits, invalid parameter
  ranges/axes/bindings, malformed/missing configured animations, unsupported
  animation lanes, non-linear binding interpolation, and non-finite draw
  buffers.
- Publication prohibition, missing attestation, source hash drift, corrupt
  native binary manifest, blocked native execution with no generated Hexo
  config, bundle size/hash mismatch, and unsafe generated paths.
- WebGL context loss, fallback activation, hidden/restored tab, and
  reduced-motion static rendering.
- Twenty PJAX completions with one canvas and one runtime/model load.
- 390 x 844 with no widget runtime, WASM, or model request.

## Windows release gate

- Use the clean worktree, never the dirty production blog checkout.
- Run `inochi2d-blog deploy --dry-run` in installed Chrome and Edge.
- The CLI injects a validation-only WebGL probe, forces DPR 1.25, waits for 90
  frames that actually draw the Inochi2D canvas, synchronizes the GPU, and
  fails closed below 29.5 measured FPS or above 33 ms p95 render duration.
- Inspect home, article, gallery, and long pages at 1440 x 900.
- Confirm no back-to-top collision, clipping, or horizontal overflow.
- Confirm blink, downward/upward pointer response, a physical press/release
  `Click` animation with the authored right arm clearly moving while its hand
  stays connected to its sleeve, drag outside the original canvas rectangle
  without a click action, and double-click reset.
- Confirm a model with an ineffective declared Breath target reports fallback
  breathing and changes idle frames without enabling motion under
  `prefers-reduced-motion`.
- Measure 260 x 360 at DPR 1.25: 30 FPS and p95 frame time at most 33 ms.
- Confirm raw runtime JS plus WASM at most 1.5 MiB and prepared model at most
  8 MiB.
- Disable the widget and regenerate; no host or widget assets may load.

## Local public-model baseline (2026-07-23)

The ignored manual fixture is Aka from the official
[Inochi2D example-models](https://github.com/Inochi2D/example-models) project.
Its official record credits design and rigging to seagetch under CC BY 4.0.
Neither archive nor model is committed or packaged.

- downloaded archive SHA-256:
  `d6bcbe9d1afe04c6f688c47f9838339384233b5594fe61784be8cd7cb4877701`;
- source Aka SHA-256:
  `dbf82ffb86d1c761bca883ad37ec1c47487a447f8104290b459ce60aaee81e0f`;
- source size: 17,731,911 bytes, 76 TGA textures;
- prepared SHA-256:
  `d6ef9fd894e43c2fc4846edd37cb12b762715e789e14612349021d4bfce609e6`;
- prepared size: 7,073,513 bytes, 76 PNG textures;
- reduction: 10,658,398 bytes (60.11%);
- official WASM/WebGL2 mount, upright transparent layers, pointer pose
  difference, click response, whole-page drag/reset, hashed Hexo bundle, mobile
  no-fetch, and 20-event PJAX singleton passed in Playwright Chromium.
- a 41-position scan of `Head:: Yaw-Pitch` changes more than 1,000 vertices at
  every step and rejects frozen ranges, large discontinuities, and single-vertex
  spikes.

Current optimized official WASM is 445,034 bytes with exactly 31 exports. The
exact Rust 1.85 toolchain passes formatting, Clippy with warnings denied, and
all native tests. `image` is pinned to 0.25.9 because 0.25.10 requires Rust
1.88.

An earlier production interaction/layout/mobile gate passed against the clean
Windows Volantis test worktree in installed Chrome and Edge. Locally built and
SHA-verified Linux/Windows native binaries were packed into tarballs, installed
into that worktree, and the Windows binary inspected the fixture successfully.
That automated gate did not detect the subsequently reported D-SDK layer and
parameter-decoding regression. The corrected artifact was therefore rebuilt and
rerun through the full installed Chrome/Edge gate; automation passed again, but
final visual acceptance still requires a human review.

The first packaged full-blog dry run remained fail-closed because the original
full-screen `starfield.js` limited host-page scheduling below 30 FPS. The
minimal Hexo baseline passed at 30.00 FPS and 0.80 ms p95 at DPR 1.25, and
isolating only the starfield restored Chrome callbacks to about 59.95 Hz.
Non-persistent diagnostics showed that throttling the visual would work, but
the approved solution instead preserved its animation rate and optimized its
rendering.

The clean blog worktree now caches the slowly changing atmospheric layer,
computes orbit trigonometry once per frame, keeps the primary sky at full DPR,
and caps only the masked duplicate cover backing store at 0.9x. A deterministic
before/after screenshot changed just 0.071% of pixels above the comparison
threshold, with no visible design regression during review.

The installed-package command below then passed without browser injection or
starfield isolation:

```powershell
.\node_modules\.bin\inochi2d-blog.cmd deploy --dry-run `
  --config .\inochi2d-blog.config.local.json
```

The final corrected D-WASM run rebuilt the public Aka model from the original
`.inp`, generated 446 Hexo files, measured Chrome at 30.15 FPS/0.90 ms p95 and
Edge at 29.98 FPS/0.80 ms p95, passed the physical pointer-release
interaction/PJAX/mobile gates, and confirmed that `hexo deploy` was not
executed. Additional desktop/mobile route checks passed on home, about,
gallery, friends, prose, and code-heavy pages; reduced motion scheduled no
starfield animation frames.

## Model-authored Click baseline (2026-07-24)

A test-only copy of Aka was opened in Inochi Creator 0.8.6 and given a standard
`Click` animation. Neither the copy nor its prepared bundle is committed or
packaged.

- test-copy source SHA-256:
  `d49fc0472eaa195b0a1acf64d76e9ba9abcb7e393ec0099c6cda49b5efdb84b0`;
- source size: 17,737,006 bytes;
- prepared model SHA-256:
  `6c4d9b8d1561a16ea31a36be89ed68bbf46bdb332d26346105b1868deaaa77d5`;
- prepared model size: 7,078,608 bytes;
- `Click` targets `Arm:: Right:: Move` with `Linear` keys
  `0:0`, `18:0.9411765`, `30:0.9411765`, and `45:0`;
- Creator visual inspection confirmed the anatomical right arm (screen-left)
  rises with its hand and sleeve connected and returns to neutral.

The normalized animation profile was checked against the official 0.8.7 SDK
sampling behavior: nearest keeps the left key at the exact midpoint, cubic uses
the official four-point formula, full vector defaults are retained, and
`leadIn`/`leadOut` accept the official `-1` sentinel. Bezier, additive, and
non-`Forced` lanes fail closed.

With the ignored prepared model, all 29 runtime tests and all eight Playwright
browser tests passed. The final local tarballs were installed into the clean
Windows Volantis worktree. Its manifest-addressed bundle was
`d49fc0472eaa-6c4d9b8d1561-ae920b62626e`; 447 Hexo files were generated.
Installed Chrome and Edge each measured 29.98 FPS over 90 GPU-synchronized
frames at DPR 1.25, with 0.90 ms and 1.10 ms p95 render duration respectively.
Both passed the visible model-authored click, pointer, drag/reset, PJAX, layout,
and mobile no-fetch gates. The command was `deploy --dry-run`; `hexo deploy`
was not executed.

The release review also switches to reduced motion in the middle of a named
clip and asserts that the lane returns to its model default. The full validated
runtime is 538,715 raw JavaScript-plus-WASM bytes. The retained package
candidate is `/home/pc/.cache/inochi2d-release-candidate-click-20260724-final4`
with SHA-256 values:

- `inochi2d-web`: `a406ec109aeb8af267090211f0e779f6961de822fabbfb9a1aa4353592b95860`;
- `hexo-inox2d-widget`: `59ee023e4a349611bea03443094c8069147e722b2a13fb7c3645405a0aed7d9c`;
- `inochi2d-blog`: `9856c67f1e001ae133559bcc03a6970661d21d82c225b7ba341c0d76a03b3956`.

The packaged unsigned Windows helper was also deliberately exercised as a
failure path. Local endpoint policy blocked it, and the CLI stopped before Hexo
generation. The successful final run used a hash-verified, source-built copy
through `pipelineBinary`, leaving the endpoint block in place.
