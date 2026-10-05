# hexo-model-companion

Hexo 7 adapter for `inochi2d-web`. It verifies local model bundles, emits
content-hashed runtime/model assets, injects a mobile no-fetch bootstrap, and
keeps one widget across PJAX navigation.

## Install

```sh
npm install hexo-model-companion
```

For a bundle already produced by `inochi2d-blog` or `inochi2d-pipeline`, add:

```yaml
inochi2d_widget:
  enable: true
  bundle: .inochi2d/bundles/sourcehash-modelhash-manifesthash
  publication:
    confirm: true
    allowRedistribution: true
    sourceSha256: 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
  render:
    fps: 30
    maxDevicePixelRatio: 1.25
    autoFit: true
    fitPadding: 0.9
  mobile:
    show: false
    breakpoint: 768
  ambient:
    parameters:
      - id: Tail - Left/Right Swing
        minimum: -0.55
        maximum: 0.55
        periodMs: 4200
  dialogue:
    enter:
      animation: Greeting
      lines:
        - Welcome!
    idle:
      animation: IdleTalk
      lines:
        - Still here?
      intervalMinMs: 30000
      intervalMaxMs: 60000
    click:
      animation: Click
      lines:
        - Hello!
  interactions:
    pointer: true
    drag: true
```

Then run `npx hexo clean && npx hexo generate`. The adapter does not patch the
theme or `node_modules`. Disable it by setting `enable: false` and regenerating.
Use `inochi2d-blog deploy --dry-run` for the guarded model-to-blog workflow;
the adapter by itself does not inspect an original Creator file or grant model
redistribution rights.

All configured animation names are exact and case-sensitive. A missing ambient
or dialogue clip, invalid sentence library, or conflicting legacy click
configuration stops Hexo generation instead of silently dropping the feature.
Verified local bundles default to automatic SDK-bound fitting. Conventional
Mannequin motion channels and its two tail-swing parameters are inferred from
the manifest with conservative pointer amplitudes; explicit Hexo
`parameters` values override each semantic channel. A neutral value near zero,
a useful `-1..1` range, and conventional names are recommended for zero-config
models, but are not required. Per-model descriptors can select an axis, scale,
offset, multiple targets, or `null` to disable an inferred channel.

This unofficial alpha is AI-assisted, human-reviewed, BSD-2-Clause licensed,
and not affiliated with the Inochi2D project. Read the full
[configuration guide](https://github.com/StarCried/inochi2d-web/blob/main/docs/configuration.md)
and [model policy](https://github.com/StarCried/inochi2d-web/blob/main/docs/model-policy.md)
before publishing a model.

## VRM backend

The configuration key remains `inochi2d_widget`. Omitting `backend` selects
Inochi2D. Set `backend: vrm` for a bundle produced by `vrm-web/prepare`:

```yaml
inochi2d_widget:
  enable: true
  backend: vrm
  bundle: ./private-prepared-blog-model
  fallback: images/companion.png
  publication:
    confirm: true
    allowRedistribution: true
    sourceSha256: <reviewed source SHA-256 from manifest>
  ambient:
    animations: [Idle]
  interactions:
    pointer: true
    click: { animation: Click }
  mobile:
    show: false
  render:
    fps: 30
    maxDevicePixelRatio: 1.5
```

VRM bundles contain the model, named external VRMA files and an optional
character profile. All declared files are checked against their SHA-256 and
contained paths. The manifest must independently permit redistribution;
configuration confirmation cannot override a private manifest. The blog model
limit is 8 MiB. Static fallback URLs remain site-owned configuration. Only the
selected renderer is emitted; VRM pages do not ship the Inochi2D WASM.

The bootstrap waits until the document has been parsed, then an idle opportunity
(up to 2 seconds on browsers with requestIdleCallback). Pending third-party
statistics or other resources do not block the widget. Mobile exits before dynamic import or
model fetch. PJAX reattaches the original host even when a theme replaces its
parent, preserving the canvas, pending load and controller. Switching to a mobile
viewport cancels loading and removes the model; returning to desktop can mount it.
Entry dialogue plays once per model per tab session, including across full page
navigation (when sessionStorage is available). Ordinary PJAX does not reload the
model or restart dialogue. Both
backend entries implement `mountModelWidget`; dialogue scheduling, bubble presentation and the
controller contract are shared, while parameter tracks remain Inochi2D-only.

Use `examples/hexo-vrm` for isolated validation with synthetic VRM 1.0 geometry.
The real blog and private character are not part of the example or package.

### Embedded VRM textures and CSP

Three.js decodes embedded VRM images via temporary `blob:` URLs. Sites with a
Content Security Policy must allow `blob:` in `connect-src` (ImageBitmap fetch)
and `img-src` (image loader). Keep all other directives unchanged. The plugin
does not rewrite the site's policy. A texture decoding/loading failure raises
`model-error` and displays the configured fallback instead of an untextured
white model. Validate the result in the target browser before acceptance.

For VRM, `camera` and `gaze` pass through to the renderer. See `vrm-web` for
angle limits. Enter/idle/click sentences use the same `dialogue` configuration
for both backends; defining a click animation alone does not enable sentences.
