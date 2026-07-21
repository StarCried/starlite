# Proposed CI (approval required)

No workflow is enabled yet. After approval and remote-repository creation, the
initial GitHub Actions workflow should:

1. use Node.js 22 and Rust stable with rustfmt, clippy, and
   `wasm32-unknown-unknown`;
2. install Ubuntu's `binaryen` package, wasm-pack 0.15.0, and the matching
   wasm-bindgen CLI 0.2.126;
3. run `npm ci` followed by `npm run validate`;
4. install Playwright Chromium and run `npm run test:browser`;
5. finish with `git diff --check`.

The job should have read-only contents permission and a 30-minute timeout. CI
creation is intentionally held behind the project's explicit external/CI change
approval gate.
