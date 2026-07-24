# Continuous integration

`.github/workflows/ci.yml` runs on pull requests and `main` pushes with
read-only repository permission. It installs Node 22, Rust 1.85 with rustfmt and
clippy, LLD 20 from the official LLVM apt repository, and a SHA-256-pinned
Binaryen 120 archive. It then runs dependency installation, Playwright Chromium
installation, root validation, browser tests, and `git diff --check`.

`.github/workflows/release-dry-run.yml` is manual. It builds the native pipeline
on Ubuntu and Windows, stages both binaries with a SHA-256 manifest, builds the
official WASM and npm packages, checks package contents, and creates npm
tarballs as short-lived artifacts. The native artifacts are deliberately
unsigned in this alpha; the manifest proves byte integrity, not publisher
identity.

Neither workflow has package-write or deployment credentials. There is no
`npm publish`, GitHub release, site upload, or `hexo deploy` step.

Both workflows also regenerate the exact D/Cargo dependency license inventory
in check mode. Stale or missing third-party license texts therefore fail before
an npm tarball can be accepted.

The official SDK build checks exact input and output hashes. A compiler, linker,
optimizer, archive, or source drift therefore fails CI and requires a reviewed
pin update rather than silently changing published bytes.
