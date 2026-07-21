# inochi2d-web

An experimental, framework-free WebGL2 runtime and Hexo adapter for
[Inox2D](https://github.com/Inochi2D/inox2d) puppets.

This repository is intentionally split into three layers:

- `inox2d-web-wasm`: a small Rust/wasm-bindgen rendering boundary;
- `inochi2d-web`: browser loading, animation, interaction, and lifecycle logic;
- `hexo-inox2d-widget`: Hexo 7 asset generation and safe page injection.

The 0.1 alpha targets current desktop Chrome and Edge with WebGL2. Mobile is
hidden by default, reduced-motion renders a neutral still frame, and all load or
context errors fall back to a static image. WebGL1, BC7, MeshGroup, built-in
animations, voice input, and camera tracking are outside this version's scope.

## Local development

Requirements: Node.js 22+, Rust stable, the `wasm32-unknown-unknown` target,
`wasm-pack` 0.15.0, `wasm-bindgen-cli` 0.2.126, Trunk 0.21.14, and
Binaryen (`wasm-opt`) 120.

```sh
npm ci
npm run validate
```

The default build fetches the pinned Inox2D Git revision recorded in
[`docs/upstream.md`](docs/upstream.md). Generated WASM and JavaScript output is
not committed.

No StarCried character source art or private puppet is part of this repository.
See [`docs/model-policy.md`](docs/model-policy.md) before adding any model.
Automated rendering uses only the artwork-free source fixture in `fixtures/`.
