# hexo-inox2d-widget

Hexo 7 adapter for `inochi2d-web`. It verifies local model bundles, emits
content-hashed runtime/model assets, injects a mobile no-fetch bootstrap, and
keeps one widget across PJAX navigation.

## Install

```sh
npm install hexo-inox2d-widget
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
