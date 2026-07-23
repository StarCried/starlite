# Third-party notices

This project is licensed under BSD-2-Clause. Built artifacts also contain or
depend on third-party software under their own licenses.

## Browser WASM

- Inochi2D D SDK, commit
  `f4b4917a59419e64f2704ac7b806e2bf09bca752`: BSD-2-Clause.
- `numem` 1.6.11, `nurt` 0.2.3, `nulib` 0.4.7, `numath` 0.5.0, and
  `intel-intrinsics` 1.14.8: BSL-1.0.
- `gamut` 3.5.0: BSL-1.0 and MIT components.
- `miniz` 0.0.4: MIT.

Exact D dependency versions are fixed in
`tools/official-sdk/dub.selections.json`. The official SDK source, toolchain,
and generated WASM hashes are fixed in `tools/official-sdk/pin.json`.
The runtime npm package includes the exact upstream texts in
`THIRD_PARTY_LICENSES.txt`.

## Native pipeline and JavaScript packages

Rust and npm dependencies are fixed in `Cargo.lock` and `package-lock.json`.
Their package metadata and bundled license files remain authoritative. The Rust
dependency set includes MIT, Apache-2.0, BSD-3-Clause, BSL-1.0-compatible,
Unicode-3.0, Zlib, 0BSD, and Unlicense alternatives.
The CLI npm package includes the exact locked Cargo license and notice texts in
`THIRD_PARTY_LICENSES.txt`.

## Test models

No third-party puppet is distributed in the repository or npm packages.
Automated tests use synthetic, artwork-free fixtures. The Aka model from the
official example-models repository is an ignored local-only visual fixture and
is credited in `docs/validation.md`.
