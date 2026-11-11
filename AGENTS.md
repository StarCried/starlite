# StarLite project instructions

## Boundaries

- `packages/core`: format-neutral playback, lifecycle, dialogue and shared controls; no renderer imports.
- `packages/vrm`: VRM inspection/preparation, rendering and character profiles.
- `packages/inochi2d`, `tools/official-sdk` and `crates/inochi2d-pipeline`: Inochi2D runtime, pinned SDK build and model pipeline.
- `packages/hexo`: configuration, resources, injection and page lifecycle.
- `packages/inochi2d-blog`: independent native CLI. Examples depend on packages, never the reverse.
- Windows/DSH integration belongs to `StarCried/starlite-dsh`.

## Working guidance

Read [engineering contracts](docs/engineering-contracts.md) when changing rendering, input, model preparation or host integration. It contains the non-obvious compatibility and lifecycle constraints; keep requirements there rather than adding session history here.

- Never commit private character art, authoring projects, credentials or real blog content. Tests use synthetic redistributable fixtures. Program motion provenance and independently licensed example models must stay distinct.
- Preserve public configuration keys and saved preferences when renaming UI labels. Product names are StarLite, StarLite for Hexo and StarLite for DSH.
- Keep a behavior change, its affected tests and user documentation together. Run the narrow package check first; use [development](docs/development.md) for setup and [releasing](docs/releasing.md) for candidate checks.
- Current user guides explain behavior. Put historical results in release artifacts; [validation](docs/validation.md) indexes older evidence. Do not present old GPU/device measurements as a fresh test.

## Releases

Use `npm run release -- doctor` and the [release guide](docs/releasing.md). Changesets owns release groups and versions; the maintained command synchronizes related metadata. Do not hand-edit repeated version fields or create per-release copies of scripts.

Publishing, remote pushes and real blog deployments follow the user's authorization. A local release rehearsal does not publish. Keep released tags and package bytes immutable.
