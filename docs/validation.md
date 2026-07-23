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
INOCHI2D_TEST_MODEL_PATH=/absolute/path/model.inp npm run test:browser
```

The release dry-run additionally builds native Linux x64 and Windows x64
binaries, stages a SHA-256 manifest, checks all npm package contents, creates
tarballs, and uploads artifacts. It never publishes npm packages or deploys a
blog.

## Required failure paths

- Valid, malformed, missing, and cross-origin model responses.
- Unsupported/corrupt `.inp/.inx`, BC7, resource limits, invalid parameter
  ranges/axes/bindings, non-linear interpolation, and non-finite draw buffers.
- Publication prohibition, missing attestation, source hash drift, corrupt
  native binary manifest, bundle size/hash mismatch, and unsafe generated paths.
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
- Confirm blink, downward/upward pointer response, click pulse, drag outside the
  original canvas rectangle, and double-click reset.
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

Current optimized official WASM is 444,786 bytes with exactly 30 exports. The
exact Rust 1.85 toolchain passes formatting, Clippy with warnings denied, and
all native tests. `image` is pinned to 0.25.9 because 0.25.10 requires Rust
1.88.

The production interaction/layout/mobile gate passed against the clean Windows
Volantis test worktree in installed Chrome and Edge. Locally built and
SHA-verified Linux/Windows native binaries were packed into tarballs, installed
into that worktree, and the Windows binary inspected the fixture successfully.
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

It rebuilt the public Aka model from the original `.inx`, generated 446 Hexo
files, measured Chrome at 29.98 FPS/0.90 ms p95 and Edge at
29.97 FPS/1.00 ms p95, passed the interaction/PJAX/mobile gates, and confirmed
that `hexo deploy` was not executed. Additional desktop/mobile route checks
passed on home, about, gallery, friends, prose, and code-heavy pages; reduced
motion scheduled no starfield animation frames.
