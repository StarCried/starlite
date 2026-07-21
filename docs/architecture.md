# Architecture

The project keeps model/rendering concerns below a narrow byte-and-number API.

```text
Hexo config
  -> hexo-inox2d-widget (hashed routes, body_end bootstrap, PJAX singleton)
  -> inochi2d-web (fetch, fallback, lifecycle, interaction, parameter mixing)
  -> inox2d-web-wasm (INP parsing, parameter application, physics, WebGL2 draw)
  -> pinned Inox2D + inox2d-opengl revision
```

## Rust/WASM boundary

The Rust class accepts a canvas and model bytes. It never chooses a URL, sends a
request, or applies a CORS policy. `loadModel` initializes transforms, rendering,
parameters, physics, and WebGL resources. Parameters are validated when set;
missing optional puppet parameters are then disabled by the TypeScript layer.
Frame deltas are clamped to 1/15 second to prevent a background-tab gap from
causing an unbounded physics step.

Dropping the runtime releases Rust ownership immediately. Inox2D's OpenGL
renderer does not currently expose explicit deletion of every WebGL handle, so
the browser ultimately reclaims those handles with the context. This is a known
upstream API limitation, not a promise of synchronous GPU deletion.

The pinned renderer also keeps its lightweight camera-uniform refresh private.
`setCameraTransform` therefore calls the public resize path with the unchanged
viewport to guarantee correctness. Camera changes are throttled to rendered
frames, but the fallback still reallocates composite targets and remains a known
drag-performance risk; exposing camera refresh is an upstream proposal.

## Browser controller

The controller checks the mobile rule before creating a canvas, importing WASM,
or requesting a puppet. Automatic values are mixed in this order:

1. neutral pose;
2. breath and blink;
3. pointer-driven eye and head values;
4. drag and click pulses;
5. explicit values supplied through `setParameter`.

The loop uses `requestAnimationFrame` but skips frames to meet the configured FPS.
It pauses on page visibility loss and never schedules more than one pending frame.
Reduced-motion mode draws one neutral frame. Network, parsing, WebGL, and context
loss failures switch to a lazily requested static fallback.

## Hexo adapter

The adapter copies only runtime `.js`, `.wasm`, and `.css` files. A SHA-256 digest
of their paths and contents creates an immutable route directory. An inline
module checks the mobile media query before its first dynamic import. A global
state object owns one controller, one in-flight mount, and one PJAX listener.

No Volantis files or `node_modules` contents are patched. Disabling the root
configuration key makes both the generator and injector return no output.
