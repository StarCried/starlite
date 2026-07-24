# Configuration

## Fully automatic CLI

Copy the packaged `inochi2d-blog.config.example.json`. Paths are relative to the
config file unless absolute:

```json
{
  "schemaVersion": 1,
  "blogRoot": "../my-hexo-blog",
  "model": "../models/public-puppet.inp",
  "fallback": "../models/public-puppet.png",
  "publication": {
    "confirm": true,
    "allowRedistribution": true,
    "sourceSha256": "64 lowercase or uppercase hexadecimal characters",
    "attribution": "Required when model metadata requires it"
  },
  "hexoConfig": "_config.yml",
  "previewPort": 4192,
  "previewPath": "/",
  "widget": {
    "render": {
      "fps": 30,
      "maxDevicePixelRatio": 1.25,
      "initialScale": 0.15
    },
    "mobile": {
      "show": false,
      "breakpoint": 768
    },
    "interactions": {
      "pointer": true,
      "click": {
        "animation": "Click"
      },
      "drag": true
    }
  }
}
```

`inspect` needs only `schemaVersion`, `model`, and an optional
`pipelineBinary`. It is read-only and prints the source SHA-256, compatibility,
parameters, metadata, and rights warnings. `prepare`, `verify`, and `deploy`
require every field above.

- `publication.confirm` acknowledges an intentional public operation.
- `allowRedistribution` asserts that the operator has checked model rights.
- `sourceSha256` binds that decision to the exact inspected input bytes.
- `pipelineBinary` may point to a local native binary. Otherwise the package
  verifies and uses its experimental unsigned Windows/Linux x64 binary. No
  native program runs during npm installation. If system policy blocks the
  bundled executable, keep the block in place and point this field to a trusted
  build made from the repository source; the CLI otherwise exits without
  generating or deploying the blog.
- `hexoConfig` defaults to `_config.yml`.
- `previewPort` defaults to 4192 and must be between 1024 and 65535.
- `widget` is merged into the generated `inochi2d_widget` Hexo config, but the
  CLI always forces `enable: true`, `mobile.show: false`, and its verified
  immutable bundle. `widget.interactions.click.animation` is case-sensitive
  and defaults to `Click`; inspection, preparation, and generation stop if that
  animation is not present and valid in the source model and output bundle.

The blog must install compatible `hexo`, `hexo-inox2d-widget`, and `playwright`
packages. Chrome and Edge must be installed for Windows release gates.

## Direct Hexo plugin

An already prepared local bundle can be configured without the deploy CLI:

```yaml
inochi2d_widget:
  enable: true
  bundle: .inochi2d/bundles/sourcehash-modelhash-manifesthash
  publication:
    confirm: true
    allowRedistribution: true
    sourceSha256: 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
  display:
    width: 260
    height: 360
  render:
    fps: 30
    maxDevicePixelRatio: 1.25
    initialScale: 0.15
  mobile:
    show: false
    breakpoint: 768
  interactions:
    pointer: true
    click:
      animation: Click
    drag: true
```

Externally hosted assets can use `model` and `fallback` instead of `bundle`.
Relative URLs are prefixed with Hexo's configured `root`; a cross-origin model
server must permit CORS. Local bundle mode is safer because the adapter verifies
the manifest and every artifact.

Idle parameter mappings accept a string, multiple strings, or a descriptor with
`id`, optional `axis`, `scale`, and `offset`. See the Aka profile in
`examples/vanilla/src/main.ts` for a two-axis Creator model.

Click motion comes only from the Creator animation stored in the model.
`interactions.click.animation` selects its exact name. Set
`interactions.click: false` to disable click playback. There is deliberately no
parameter mapping or synthesized movement fallback: an enabled but missing
animation is a generation error, so an untested pose cannot enter a production
blog.

The browser runtime verifies that the configured breath target actually changes
the official draw list. Declared-but-inert bindings automatically use a subtle
whole-model breathing fallback; set `parameters.breath: null` to request a
strictly non-breathing idle pose.

To disable the widget, set `inochi2d_widget.enable: false` and regenerate. No
theme or `node_modules` file is patched.

## Runtime API

```ts
const controller = await mountInochi2DWidget(element, config);
controller.pause();
controller.resume();
controller.setParameter("MouthOpen", 0.5);
controller.setParameter("Head:: Yaw-Pitch", [0.2, -0.1]);
controller.resetCamera();
controller.destroy();
```
