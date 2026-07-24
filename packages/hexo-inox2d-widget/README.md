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
  mobile:
    show: false
    breakpoint: 768
```

Then run `npx hexo clean && npx hexo generate`. The adapter does not patch the
theme or `node_modules`. Disable it by setting `enable: false` and regenerating.
Use `inochi2d-blog deploy --dry-run` for the guarded model-to-blog workflow;
the adapter by itself does not inspect an original Creator file or grant model
redistribution rights.

This unofficial alpha is AI-assisted, human-reviewed, BSD-2-Clause licensed,
and not affiliated with the Inochi2D project. Read the full
[configuration guide](https://github.com/StarCried/inochi2d-web/blob/main/docs/configuration.md)
and [model policy](https://github.com/StarCried/inochi2d-web/blob/main/docs/model-policy.md)
before publishing a model.
