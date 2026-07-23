# Architecture

```text
Creator .inp/.inx
  -> inochi2d-pipeline
     bounds + compatibility + rights report + lossless compression + manifest
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
exports remain: memory, initialization, three allocator functions, and the 25
puppet/parameter/texture/draw-list calls used by TypeScript. This permits link
garbage collection and limits the browser-callable surface.

Rust is not part of the browser runtime. The TypeScript renderer uploads decoded
textures, validates finite command and vertex data, maintains stencil/mask and
blend state, and draws the SDK command list into a transparent WebGL2 canvas.
The SDK does not choose URLs or CORS policy.

## Browser controller

The controller checks the mobile rule before importing runtime code or fetching
WASM/model bytes. It mixes values in this order:

1. neutral pose;
2. breath and blink;
3. pointer-driven eyes and head;
4. click and drag feedback;
5. explicit values supplied through `setParameter`.

`requestAnimationFrame` is throttled to the configured FPS. The loop pauses on
visibility loss, reduced motion draws one neutral frame, and WebGL/model/network
failures switch to a lazily loaded static fallback. Dragging moves the widget
across the viewport rather than clipping motion inside the canvas; double-click
restores its configured corner.

## Native preparation

`inochi2d-pipeline` parses the container with bounded allocations, validates the
supported Creator schema, decodes PNG/TGA textures, and re-encodes pixels with a
deterministic PNG encoder. A replacement occurs only when pixels are unchanged
and the result is smaller. It preserves JSON semantics, texture order, and
extended vendor bytes, then re-parses the emitted container.

Output is written to a new sibling staging directory and atomically renamed.
Existing output is never replaced. The manifest contains content hashes, sizes,
parameters, compatibility, publication warnings, and optimization statistics;
it contains no timestamp or machine-local source path.

## Hexo and deployment

The Hexo adapter verifies every local bundle path, size, SHA-256, fallback, and
publication acknowledgement before generating immutable routes. An inline
mobile check runs before the first dynamic import. One global owner tracks the
controller, in-flight mount, animation loop, and PJAX listener.

`inochi2d-blog` writes an isolated generated config beneath `.inochi2d`, runs
Hexo clean/generate, launches a local preview, and verifies desktop rendering,
one-canvas PJAX behavior, layout, and mobile no-fetch. On Windows it launches the
installed Chrome and Edge channels. Only the explicit `deploy` command, without
`--dry-run`, can proceed to `hexo deploy`, and only after all prior gates pass.
An exception restores the previous generated config and propagates a non-zero
exit.
