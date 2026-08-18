# Upstream baseline

## Official browser SDK

- Repository: `https://github.com/Inochi2D/inochi2d`
- Commit: `f4b4917a59419e64f2704ac7b806e2bf09bca752`
- Source archive SHA-256:
  `314f6d6e77682a0638fd424d512f883dc0c0bb2113a4e202db894eae05bd16e7`
- SDK toolchain: `v0.9.0-testing`
- Toolchain archive SHA-256:
  `5adc0c991f68f5313f215e638c3470b857796ad57bd2344b28cddf707d3784c3`
- LLD: 20.x (locally 20.1.8)
- Binaryen: version 120
- Raw WASM SHA-256:
  `47520f0e494f2a6836c7d1783756fc115920b18e71cfd3c366f41d5a2f6ef852`
- Optimized WASM SHA-256:
  `e19dc3e63315242e5f0a6040db4606d0e92c90ae86f05785158ee9efe58ddce5`

The machine-readable source of truth is `tools/official-sdk/pin.json`; D
dependency versions are in `tools/official-sdk/dub.selections.json`.

The build applies local compatibility patches for legacy Creator parameter
bindings and ranges, fixed-vector composite/physics fields,
deformation/property storage, legacy `SimplePhysics` enum member names, stable
draw allocations, finite binding diagnostics, Creator 0.8 shared-property
composition and frame resets, and a minimal browser export surface. Browser
texture upload keeps the official SDK's decoded orientation. The physics
compatibility patches map Creator 0.8 spellings such as `SpringPendulum` and
`XY`, skip the previous-frame value of physics-driven parameters, and explicitly
invert the affine XY basis because pinned `numath` 0.5.0 does not provide a
working matrix inverse. The model file is not altered. These patches are project
implementation, not claims about official browser support.

## Historical Rust investigation

A separate historical Inox2D checkout may remain useful for comparison, but it
is not the browser backend in this alpha. No Cargo dependency on Inox2D or
`inox2d-opengl` remains.

Before upstream contact, compare current issues and contribution policy. Prepare
a minimal factual reproducer rather than copying this AI-assisted implementation,
and obtain explicit approval before posting an issue or pull request.
