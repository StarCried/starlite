# Model-to-blog pipeline

The public workflow accepts a Creator-exported `.inp` or `.inx`, prepares a
smaller immutable bundle, installs it into Hexo's generated configuration,
validates the site, and optionally deploys it.

## Native trust boundary

The browser runtime and Hexo adapter do not require a native executable. The
optional automatic preparation workflow does: `inochi2d-blog` bundles an
experimental, unsigned Windows/Linux x64 `inochi2d-pipeline`.

- npm installation has no install/postinstall execution.
- Only an explicit `inspect`, `prepare`, `verify`, or `deploy` command starts
  the native pipeline.
- The packaged executable's byte length and SHA-256 must match its manifest
  before it is started.
- An operating-system, antivirus, authorization, integrity, or generation
  failure returns non-zero and prevents every later generation/deploy step.
- Do not disable security controls to run it. Build the Rust pipeline from
  source and set `pipelineBinary` when a locally trusted executable is required.
- Windows can explicitly configure `pipeline.backend` as `wsl` with a named
  distribution and absolute Linux pipeline path. Only inspection/compression
  then run through `wsl.exe --exec`; the CLI, Hexo, Chrome, and Edge stay on
  Windows. Path translation and execution are argument-based without a shell.
  WSL is never selected automatically and never falls back to a native binary.

## 1. Inspect

Start with a config containing `schemaVersion`, `model`, and optionally
`pipelineBinary` or the mutually exclusive `pipeline` object:

```sh
inochi2d-blog inspect --config inochi2d-blog.config.json
```

Inspection is read-only. Review `compatibility`, `publication`, and
`source.sha256`. It reports malformed parameter axes/bindings, non-finite or
out-of-range values, unsupported textures/nodes/blends/automation, resource
limits, normalized model animations, and declared usage rights.

## 2. Attest and prepare

Add the blog, PNG fallback, and publication fields from
`docs/configuration.md`. `sourceSha256` must equal the inspected bytes:

```sh
inochi2d-blog prepare --config inochi2d-blog.config.json
```

The native pipeline first inspects PNG/TGA headers without allocating their full
pixel buffers. It then decodes within bounded source limits and
deterministically re-encodes PNG. TGA becomes PNG only when smaller; PNG is
replaced only when the re-encoding is smaller. These initial replacements are
pixel-identical. A source texture above 4096 pixels is resized with aspect ratio
preserved, and an output still above 8 MiB receives up to four uniform adaptive
texture passes. Every changed dimension sets `optimization.lossless` to false
and is recorded in the manifest. The source file is never overwritten.

The bundle contains:

- `model.<sha-prefix>.inp`;
- `fallback.<sha-prefix>.png`;
- `manifest.json`.

`manifest.json` contains the validated Creator animation clips required by the
browser, the complete parameter profile used for safe Hexo inference, source
and output texture dimensions, and adaptive resize statistics. The CLI defaults
to the exact name `Click`; it stops before writing a bundle or generated Hexo
config when that animation is absent or unsupported.
The name can be changed with `widget.interactions.click.animation`, or click
playback can be disabled explicitly with `false`.

The Hexo adapter uses the verified parameter profile to infer conventional
Aka/Creator and Mannequin pointer/blink/breath channels. It also infers
Mannequin's two tail oscillators and enables neutral SDK draw-bound fitting for
verified bundles. Explicit user configuration takes precedence. A configured
procedural parameter that is absent from either the source or prepared model,
or overlaps a configured ambient animation lane, stops before generation.

The alpha animation profile accepts non-additive Creator clips whose lanes use
the `Forced` merge mode and `Nearest`, `Stepped`, `Linear`, or `Cubic`
interpolation. Scalar and vector parameter lanes are normalized by UUID, and
the complete parameter default is retained so an untouched vector axis is not
reset to zero. Creator's `-1` lead-in/lead-out sentinel is preserved, but click
playback is a one-shot over the full clip length and does not implement
transition looping. `Bezier`, additive, or other merge modes are explicit
compatibility blockers rather than approximated.

The CLI places it under
`.inochi2d/bundles/<source-prefix>-<model-prefix>-<manifest-prefix>`. Including
the normalized manifest identity prevents a newer pipeline from accidentally
reusing an older animation/configuration manifest when the copied model bytes
are unchanged. Existing immutable bundles are reused only when model and
fallback hashes match.
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
- pointer pose change, configured model-animation response, whole-page drag,
  and double-click reset;
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
The previous generated config is restored on failure. If the native executable
cannot start, the CLI reports the unsigned-alpha boundary and stops before
writing the generated Hexo config.

The tool does not configure GitHub Pages, credentials, remotes, or a Hexo
deployer. Those remain the blog owner's existing configuration and approval
boundary.
