# inochi2d-blog

Fail-closed, local orchestration from a Creator-exported `.inp` or `.inx` to an
immutable Hexo bundle and optional deployment.

Install it in the Hexo blog together with the adapter and browser validator:

```sh
npm install inochi2d-blog hexo-inox2d-widget playwright
```

Copy `inochi2d-blog.config.example.json`, set the original model, fallback, blog
root, and publication attestation, then run:

```sh
inochi2d-blog inspect --config inochi2d-blog.config.json
inochi2d-blog deploy --dry-run --config inochi2d-blog.config.json
inochi2d-blog deploy --config inochi2d-blog.config.json
```

`inspect` is read-only and reveals the source SHA-256 and blockers. The other
commands require explicit redistribution confirmation tied to that exact hash.
The real deploy runs only after native preparation, Hexo clean/generate,
desktop rendering and interaction, PJAX, layout, and mobile no-fetch gates all
pass. The CLI previews the generated `public` directory with its own read-only
local server, so the blog does not need `hexo-server`. Any error stops before
`hexo deploy` and restores the prior generated config. Its performance gate
measures 90 rendered frames at DPR 1.25 and blocks deployment below 29.5 FPS or
above 33 ms p95 render duration.

Read the repository
[pipeline](https://github.com/StarCried/inochi2d-web/blob/main/docs/pipeline.md)
and
[configuration](https://github.com/StarCried/inochi2d-web/blob/main/docs/configuration.md)
guides. The blog must provide compatible Hexo,
`hexo-inox2d-widget`, and Playwright installations; Windows gates use installed
Chrome and Edge.

This package is unofficial, AI-assisted, human-reviewed, BSD-2-Clause licensed,
and not affiliated with the Inochi2D project. It does not grant model
redistribution rights.
