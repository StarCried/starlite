# Alpha status and approval gates

Implemented locally:

- pinned-SHA Rust/wasm-bindgen renderer with PNG/TGA support inherited from Inox2D;
- framework-free lifecycle, interaction, fallback, mobile, and reduced-motion policy;
- Hexo 7 content-hashed assets and PJAX-safe singleton bootstrapping;
- Vanilla and minimal Hexo builds plus Chromium request-level smoke tests;
- a source-generated, artwork-free synthetic INP used by Rust and browser tests;
- raw runtime assets under the 1.5 MiB budget.

Not yet complete because a publishable puppet does not exist:

- visual and performance measurements with the public StarCried puppet;
- Windows Chrome and Edge checks on the real Volantis pages;
- 8 MiB puppet and texture-atlas budget verification.
- lightweight camera-uniform refresh upstream (the current correct fallback
  reuses `resize` and is more expensive while dragging).

Separate approval is still required before creating public GitHub repositories,
opening the upstream issue/PR, publishing npm packages, copying a public puppet,
creating a clean blog worktree, or deploying the blog.
