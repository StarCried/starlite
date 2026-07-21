# Inochi2D Web Project Instructions

## Scope and Architecture

- `crates/inox2d-web-wasm` is the narrow Rust/wasm-bindgen bridge. It owns parsing, model state, rendering, physics stepping, camera updates, and explicit release of Rust-side state.
- `packages/inochi2d-web` is the framework-free browser controller. It owns network access, lifecycle, motion synthesis, interaction mixing, DPR/FPS policy, and fallback presentation.
- `packages/hexo-inox2d-widget` is the Hexo 7 adapter. It owns configuration normalization, hashed asset routes, injection, and PJAX-safe singleton bootstrapping.
- `examples` may depend on packages, but packages must never depend on examples.

## Public and Private Assets

- Never add StarCried source art, Creator projects, private `.inp` files, credentials, or blog content.
- Automated fixtures must be synthetic and redistributable. Third-party puppets are manual-test inputs only and require an attribution record.
- Generated wasm-bindgen files and package build output are reproducible artifacts and stay untracked.

## Compatibility Contract

- Version 0.1 targets current desktop Chrome and Edge with WebGL2.
- Mobile defaults to hidden. The Hexo bootstrap must return before importing JavaScript or fetching WASM/model data.
- Do not add WebGL1, camera tracking, microphone/lip-sync, MeshGroup, BC7, or built-in animation support without an approved scope change.

## Validation

- Run narrow package or crate checks first, then the root validation scripts.
- Tests must cover failed model fetch/parse, lifecycle pause/resume, reduced motion, context loss, and idempotent PJAX mounting.
- Keep the Git-pinned Inox2D revision documented in `docs/upstream.md` and update it with the Cargo dependency.

## External Actions

- Local commits and branches are allowed. Creating remotes, opening issues or pull requests, publishing npm packages, and deploying a blog require separate user approval.
