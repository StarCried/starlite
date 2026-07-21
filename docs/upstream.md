# Upstream baseline

- Repository: `https://github.com/Inochi2D/inox2d.git`
- Revision: `df8413e6b0c525dbb880b4dca2bdf0a5d4b9aaba`
- Local checkout: `/home/pc/StarCried/inox2d`
- Rust target: `wasm32-unknown-unknown`

At this revision, `cargo build -p render-webgl --target
wasm32-unknown-unknown` succeeds. `trunk build --release` also succeeds after an
ignored `examples/render-webgl/assets/` directory is created. The upstream
README currently spells the directory as `render_webgl`, while the real path is
`render-webgl`; the repository does not ship the required puppet.

Both `inox2d` and `inox2d-opengl` dependencies in the WASM crate must use this
same Git revision. Update this file and the Cargo lockfile together.

On Ubuntu 26.04, install the distribution `binaryen` package. wasm-pack is
configured with `-Oz --all-features` because current Rust emits bulk-memory and
saturating float-to-int instructions that Binaryen otherwise rejects during
validation.
