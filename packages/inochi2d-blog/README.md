# inochi2d-blog

Optional Inochi2D-specific tooling in the StarLite workspace. It is not needed
for VRM-only users. New StarLite package names are local candidates, not yet
published registry packages; see [installation instructions](https://github.com/StarCried/starlite/blob/feat/dual-model-backends/docs/release-guide.md).


Fail-closed, local orchestration from a Creator-exported `.inp` or `.inx` to an
immutable Hexo bundle and optional deployment.

> **Experimental unsigned native alpha:** this package bundles
> `inochi2d-pipeline` for Windows/Linux x64 without a code-signing certificate.
> Installation never executes it; only an explicit CLI command does so, after
> its SHA-256 manifest is verified. Keep any operating-system or endpoint
> security block in place. A blocked executable stops the workflow before Hexo
> generation or deployment; use `pipelineBinary` to select a trusted self-built
> copy if needed. Windows users may instead select the explicit WSL backend
> described below; it never falls back to another backend.

Install it in the Hexo blog together with the adapter and browser validator:

```sh
# Install the locally built candidate tarballs described in docs/release-guide.md.
npm install ./inochi2d-blog-0.1.0-alpha.1.tgz ./hexo-starlite-0.1.0-alpha.1.tgz ./starcried-starlite-core-0.1.0-alpha.1.tgz ./starcried-starlite-inochi2d-0.1.0-alpha.1.tgz ./starcried-starlite-vrm-0.1.0-alpha.1.tgz playwright
```

Copy `inochi2d-blog.config.example.json`, set the original model, fallback, blog
root, and widget behavior. Start with an isolated local preview; it does not
need a redistribution attestation:

```sh
inochi2d-blog inspect --config inochi2d-blog.config.json
inochi2d-blog preview --config inochi2d-blog.config.json
```

`preview` compresses the original model into a one-run directory below
`.inochi2d/preview`, generates Hexo there, runs the browser gates, and serves
only on `127.0.0.1` until Ctrl+C. It cannot deploy and deletes the run
afterward. Rights metadata is a warning in this local-only mode; every technical
compatibility, integrity, size, model-feature, Hexo, and browser error still
stops the command.

When a Windows policy blocks the unsigned pipeline, copy
`inochi2d-blog.config.wsl.example.json` and configure:

```json
{
  "pipeline": {
    "backend": "wsl",
    "distribution": "Ubuntu",
    "binary": "/home/USER/path/to/inochi2d-pipeline"
  }
}
```

Run `inochi2d-blog` itself from Windows. `blogRoot`, `model`, and `fallback`
remain Windows paths; only `pipeline.binary` is a normalized absolute Linux
path inside the selected distribution. The CLI translates only those declared
path arguments, invokes model inspection/compression through `wsl.exe --exec`,
then runs Hexo and installed Chrome/Edge on Windows. A missing distribution,
invalid path, unavailable binary, non-zero exit, or malformed output stops
before Hexo generation. The WSL backend is opt-in and has no automatic native
fallback.

After inspection, add the publication attestation tied to the exact source
hash before any production workflow:

```sh
inochi2d-blog deploy --dry-run --config inochi2d-blog.config.json
inochi2d-blog deploy --config inochi2d-blog.config.json
```

`inspect` is read-only and reveals the source SHA-256 and blockers. `prepare`,
`verify`, and `deploy` require explicit redistribution confirmation tied to
that exact hash.
The real deploy runs only after native preparation, Hexo clean/generate,
desktop rendering and interaction, PJAX, layout, and mobile no-fetch gates all
pass. The CLI previews the generated `public` directory with its own read-only
local server, so the blog does not need `hexo-server`. Any error stops before
`hexo deploy` and restores the prior generated config. Its performance gate
measures 90 rendered frames at DPR 1.25 and blocks deployment below 29.5 FPS or
above 33 ms p95 render duration.

The generated widget configuration preserves model-authored ambient loops,
procedural parameter loops, enter/idle/click scene libraries, and their exact
names. Every referenced clip and procedural parameter must exist in both the
inspected source and prepared bundle; otherwise the workflow stops before Hexo
generation. Preparation performs lossless texture optimization first, then
records any WebGL/8 MiB adaptive resize as lossy. Model-owned `SimplePhysics`
is loaded and advanced by the browser runtime without a synthetic hair/sleeve
fallback.

Read the repository
[pipeline](https://github.com/StarCried/starlite/blob/feat/dual-model-backends/docs/pipeline.md)
and
[configuration](https://github.com/StarCried/starlite/blob/feat/dual-model-backends/docs/configuration.md)
guides. The blog must provide compatible Hexo,
`hexo-starlite`, and Playwright installations; Windows gates use installed
Chrome and Edge.

This package is unofficial, AI-assisted, human-reviewed, BSD-2-Clause licensed,
and not affiliated with the Inochi2D project. It does not grant model
redistribution rights.
