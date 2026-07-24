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
  `d906480b9c3abfac960b507fed034cc745490b90ed45198a453ba36055e29e4a`
- Optimized WASM SHA-256:
  `c5ce69973cfe5169a4787627420da3ed721d1571b6ae753f29a64c1abd25f903`

The machine-readable source of truth is `tools/official-sdk/pin.json`; D
dependency versions are in `tools/official-sdk/dub.selections.json`.

The build applies local compatibility patches for legacy Creator parameter
bindings and ranges, fixed-vector composite/physics fields,
deformation/property storage, stable draw allocations, finite binding
diagnostics, and a minimal browser export surface. Browser texture upload keeps
the official SDK's decoded orientation. These patches are project
implementation, not claims about official browser support.

## Historical Rust investigation

A separate historical Inox2D checkout may remain useful for comparison, but it
is not the browser backend in this alpha. No Cargo dependency on Inox2D or
`inox2d-opengl` remains.

Before upstream contact, compare current issues and contribution policy. Prepare
a minimal factual reproducer rather than copying this AI-assisted implementation,
and obtain explicit approval before posting an issue or pull request.
