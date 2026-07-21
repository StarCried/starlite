# Validation checklist

## Automated

- Rust formatting, clippy with warnings denied, and unit tests.
- `wasm-pack build --target web --release`.
- TypeScript type checks, unit tests, and production builds.
- Chromium smoke tests for desktop mounting and mobile no-fetch behavior.
- Hexo generation test with hashed JS/WASM/CSS routes.
- `git diff --check`.

## Failure paths

- Valid, malformed, missing, and cross-origin model responses.
- WebGL context loss and fallback image activation.
- Page visibility pause/resume and reduced-motion static rendering.
- Twenty PJAX navigation events without duplicate canvas, listeners, or loops.
- Mobile 390 x 844 layout with no runtime, WASM, or model requests.

## Manual Windows release gate

- Chrome and Edge on home, article, gallery, and long pages.
- 1440 x 900 layout without overflow or collision with back-to-top controls.
- 260 x 360 canvas at DPR 1.25 reaches 30 FPS with p95 frame time at most 33 ms.
- Raw JS plus WASM is at most 1.5 MiB; the public puppet is at most 8 MiB.
- Disabling `inochi2d_widget.enable` fully removes the widget on regeneration.
