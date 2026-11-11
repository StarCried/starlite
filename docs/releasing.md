# Maintaining and releasing StarLite

User installation belongs in the [Hexo README](../packages/hexo/README.md). This page is the maintainer workflow; it does not describe the status of a particular release.

## Sources of truth

- [Changesets configuration](../.changeset/config.json) owns the fixed public package group. The native `inochi2d-blog` CLI versions independently.
- Package manifests and the lockfile own versions and dependency ranges. `release version` also synchronizes the private root and examples. DSH records its own runtime source revision; its version need not equal this repository's.
- Each prepared directory contains `release-manifest.json`: source commit, group, channel, package identities, byte sizes and hashes. Publication consumes those files without rebuilding.
- Package changelogs come from Changesets. Current user guides do not carry a manually maintained “latest version”; old measurements remain [historical evidence](validation.md).

## Make and review a candidate

Use the [development environment](development.md), Node 24 and npm 11.21.0. Local build checks run under Linux/WSL with the pinned Rust/WASM toolchain. Install RustSec `cargo-audit` 0.22.2 using a separate stable toolchain; set `CARGO_AUDIT_BIN` if it is outside PATH. This does not change the repository's Rust version.

```sh
npm ci
npm run release -- doctor
npm run changeset
npm run release -- plan
npm run release -- version
```

Add a changeset for a user-visible package change, select the affected package and describe the behavior. The fixed group is released together. Tooling-only or prose-only work need not invent a package release. `plan` shows current identities and pending Changesets increments. `version` consumes changesets, updates package changelogs and synchronizes metadata; review and commit that diff before preparation. It never commits or publishes for you.

From the clean reviewed commit:

```sh
npm run release -- prepare --out /tmp/starlite-candidate
```

Preparation clones that exact commit into a new temporary checkout, installs from the lockfile, runs existing `validate`, browser and dependency gates, then packs only the fixed group. It refuses dirty source and an existing output directory. No private model or authoring file is included. Review the manifest, changelog notes, package instructions and relevant UI changes before authorizing publication.

For an independent CLI release, use `--group cli --native-dir /path/to/native`. That directory must contain `linux-x64/inochi2d-pipeline` and `win32-x64/inochi2d-pipeline.exe`, each beside a `SOURCE_REVISION` matching the candidate. The existing native package-content gate still applies.

## Publish the reviewed files

GitHub Actions is the normal path:

1. Run **Release prepare** on `main`, selecting `public` or `cli`. It builds the run's exact commit. Download and review the `starlite-release` artifact.
2. After approval, run **Release publish** with that successful preparation's run ID. The protected `npm-release` environment is the final approval point.
3. The publish job verifies the source/artifact identity and existing GitHub tag, publishes the same npm tarballs, verifies anonymous installation and both Hexo presets including offline cache reuse, then uploads the files to a GitHub draft and publishes the completed release. Public GitHub downloads are checked afterward.

These workflows declare OIDC permissions; adding them alone does **not** enable npm trusted publishing. Once the workflow is on GitHub, configure each npm package's trusted publisher for repository `StarCried/starlite`, workflow `release-publish.yml`, environment `npm-release`; configure that environment's required reviewer in GitHub. The job uses npm 11.21.0 because OIDC dist-tag recovery requires it. No stored npm publishing token is needed after this account-side setup.

If an explicitly authorized local publication is needed, use the same reviewed directory and checked-out source:

```sh
node tools/release-github.mjs preflight --out /tmp/starlite-candidate
npm run release -- publish --out /tmp/starlite-candidate
npm run release:consumer -- --out /tmp/starlite-candidate
node tools/release-github.mjs publish --out /tmp/starlite-candidate
node tools/release-github.mjs verify --out /tmp/starlite-candidate
```

Local npm publication uses the operator's normal npm login/2FA; GitHub uses `GH_TOKEN` / `GITHUB_TOKEN` or existing `gh` credentials. Do not place credentials in the artifact. The local workflow must have the same publication authorization as Actions.

## Retry and verify

Keep the prepared directory after a partial failure. Re-running publication skips identical published packages/assets, repairs a missing npm tag and continues an incomplete GitHub draft. Conflicting package bytes, a tag pointing at another source or an attempted channel rollback stop before further writes. Never overwrite an existing release or move its tag.

```sh
npm run release -- verify --out /tmp/starlite-candidate
npm run release:consumer -- --out /tmp/starlite-candidate
node tools/release-github.mjs verify --out /tmp/starlite-candidate
```

`verify` checks anonymous registry bytes and tags; the consumer command performs a fresh-cache registry installation, without workspace links or npm credentials. Verification JSON files belong to the release artifact, not a new per-release script or a “current result” paragraph copied through the docs.

`prepare` is the non-publishing rehearsal. Mutation commands reject unsupported `--dry-run` rather than silently changing files. A version rehearsal belongs in an isolated checkout; never run it in a user's blog or pretend an unpublished rehearsal version was released.

## CI scope

Pure Markdown documentation edits run local-link and version-consistency checks. Unknown files, code, dependency metadata, Changesets and CI changes retain the full gate. The always-running **CI / result** job requires whichever path was selected to succeed; use that aggregate check for branch protection. Dependency auditing remains scheduled and independently callable. See [CI](ci.md) for the concrete job inventory.
