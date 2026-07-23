# Model-to-blog pipeline

The public workflow accepts a Creator-exported `.inp` or `.inx`, prepares a
smaller immutable bundle, installs it into Hexo's generated configuration,
validates the site, and optionally deploys it.

## 1. Inspect

Start with a config containing `schemaVersion`, `model`, and optionally
`pipelineBinary`:

```sh
inochi2d-blog inspect --config inochi2d-blog.config.json
```

Inspection is read-only. Review `compatibility`, `publication`, and
`source.sha256`. It reports malformed parameter axes/bindings, non-finite or
out-of-range values, unsupported textures/nodes/blends/automation, resource
limits, and declared usage rights.

## 2. Attest and prepare

Add the blog, PNG fallback, and publication fields from
`docs/configuration.md`. `sourceSha256` must equal the inspected bytes:

```sh
inochi2d-blog prepare --config inochi2d-blog.config.json
```

The native pipeline decodes each PNG/TGA and deterministically re-encodes PNG.
TGA becomes PNG only when smaller; PNG is replaced only when the re-encoding is
smaller. Pixel values are unchanged. The source file is never overwritten.

The bundle contains:

- `model.<sha-prefix>.inp`;
- `fallback.<sha-prefix>.png`;
- `manifest.json`.

The CLI places it under `.inochi2d/bundles/<source-prefix>-<model-prefix>`.
Existing immutable bundles are reused only when model and fallback hashes match.
Failed staging directories are removed.

## 3. Verify without deployment

```sh
inochi2d-blog verify --config inochi2d-blog.config.json
# equivalent full release rehearsal
inochi2d-blog deploy --dry-run --config inochi2d-blog.config.json
```

This writes `.inochi2d/.inochi2d.generated.yml`, runs Hexo clean/generate,
serves the generated `public` directory through the CLI's read-only local
server, and checks:

- one visibly contributing canvas at 1440 x 900;
- pointer pose change, click response, whole-page drag, and double-click reset;
- no horizontal overflow or page exceptions;
- one canvas after 20 PJAX completion events;
- no widget host, runtime JS, WASM, or model fetch at 390 x 844.

Windows runs both installed Chrome and Edge. Linux development runs Playwright
Chromium. These commands never call `hexo deploy`.

## 4. Deploy

```sh
inochi2d-blog deploy --config inochi2d-blog.config.json
```

This repeats preparation, generation, and browser gates before invoking the
blog's existing Hexo deploy command. Any missing dependency, authorization
problem, source change, pipeline error, corrupt manifest, failed generation,
browser error, or missing browser throws a non-zero error and prevents deploy.
The previous generated config is restored on failure.

The tool does not configure GitHub Pages, credentials, remotes, or a Hexo
deployer. Those remain the blog owner's existing configuration and approval
boundary.
