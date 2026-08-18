# Architecture

```text
Creator .inp/.inx
  -> inochi2d-pipeline
     bounds + compatibility + rights report + bounded compression + manifest
  -> inochi2d-blog
     source attestation + immutable bundle + Hexo + browser gates + deploy
  -> hexo-inox2d-widget
     verified hashed routes + mobile-first bootstrap + PJAX singleton
  -> inochi2d-web
     fetch + motion/lifecycle + official D-SDK WASM + WebGL2 draw-list renderer
```

## Official SDK boundary

`tools/build-official-sdk.mjs` downloads the official Inochi2D D SDK and its
WASM toolchain from fixed URLs, checks both archives by SHA-256, applies the
documented browser compatibility patches, and builds with LLD 20. Binaryen 120
then performs deterministic `-Oz` optimization. Both raw and optimized output
hashes are pinned, so a source, dependency, compiler, linker, or optimizer drift
stops the build.

The D SDK owns container parsing, the puppet object graph, parameter bindings,
deformations, texture decode, update, and draw-list creation. Only 30 WebAssembly
exports remain: memory, initialization, three allocator functions, and the 26
puppet/parameter/texture/draw-list calls used by TypeScript. This permits link
garbage collection and limits the browser-callable surface.

Rust is not part of the browser runtime. The TypeScript renderer uploads decoded
textures transactionally, validates finite command and vertex data, maintains
stencil/mask state and the RGB/alpha equations from the Inochi2D blend standard,
and draws the SDK command list into a transparent WebGL2 canvas.
The SDK does not choose URLs or CORS policy.

## Browser controller

The controller checks the mobile rule before importing runtime code or fetching
WASM/model bytes. It mixes values in this order:

1. neutral pose;
2. breath and blink;
3. pointer-driven eyes and head;
4. drag feedback;
5. procedural/model-authored ambient motion;
6. the active model-authored foreground animation;
7. explicit values supplied through `setParameter`.

`requestAnimationFrame` is throttled to the configured FPS. The loop pauses on
visibility loss, reduced motion draws one neutral frame, and WebGL/model/network
failures switch to a lazily loaded static fallback. Dragging moves the widget
across the viewport rather than clipping motion inside the canvas; double-click
restores its configured corner.

After model loading, the official runtime temporarily samples each configured
breath target at its lower and upper bound, compares vertices, indices, draw
commands, and render variables, then restores the original value. If every
target is draw-inert, the controller applies a small camera-scale breathing
cycle instead. Gesture travel under six pixels is a click; crossing that
threshold promotes the gesture to a whole-widget drag and suppresses the click.
The browser player consumes only animation lanes that the native pipeline has
resolved from Creator parameter UUIDs and validated for bounds, ordering,
interpolation, merge mode, and finite values. It never reparses the model
container in JavaScript and never synthesizes a missing click pose.

## Native preparation

`inochi2d-pipeline` parses the container with bounded allocations, validates the
supported Creator schema, inspects texture headers before allocation, decodes
PNG/TGA textures, and re-encodes pixels with a deterministic PNG encoder. It
first keeps only smaller pixel-identical replacements. Source textures above
4096 pixels are then resized with aspect ratio preserved, and an over-budget
model receives bounded uniform adaptive texture passes until it is at most
8 MiB or preparation fails. It preserves JSON semantics, texture order, and
extended vendor bytes, then re-parses the emitted container.

Output is written to a new sibling staging directory and atomically renamed.
Existing output is never replaced. Reuse requires a byte-identical manifest and
revalidates canonical non-symlink artifacts by size and SHA-256. The manifest
contains content hashes, sizes, parameters, normalized model animations, compatibility, publication warnings,
source/output texture dimensions, lossy-resize warnings, and optimization
statistics; it contains no timestamp or machine-local source path.

## Hexo and deployment

The Hexo adapter verifies every local bundle path, size, SHA-256, fallback, and
publication acknowledgement before generating immutable routes. An inline
mobile check runs before the first dynamic import and on every PJAX completion.
One global owner tracks the controller, in-flight mount, animation loop, and
PJAX listener; a generation token discards mounts completed for a detached host.

`inochi2d-blog` writes an isolated generated config beneath `.inochi2d`, runs
Hexo clean/generate, launches a local preview, and verifies desktop rendering,
one-canvas PJAX behavior, layout, and mobile no-fetch. On Windows it launches the
installed Chrome and Edge channels. Only the explicit `deploy` command, without
`--dry-run`, can proceed to `hexo deploy`, and only after all prior gates pass.
An exception restores the previous generated config and propagates a non-zero
exit.
