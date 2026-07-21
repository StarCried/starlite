# Configuration

Install the two local alpha packages, then add this root key to Hexo's
`_config.yml`:

```yaml
inochi2d_widget:
  enable: true
  model: models/starcried-public.inp
  fallback: images/starcried-static.webp
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
  parameters:
    breath: Breath
    eyeOpenLeft: EyeOpenL
    eyeOpenRight: EyeOpenR
    eyeX: EyeX
    eyeY: EyeY
    headX: HeadX
    headY: HeadY
    bodyX: BodyX
    click: HeadZ
  interactions:
    pointer: true
    click: true
    drag: true
    clickAmplitude: 0.35
    dragModelUnitsPerPixel: 4
```

Relative URLs are prefixed with Hexo's configured `root`; absolute and
cross-origin URLs are preserved. A cross-origin model server must opt into CORS.
Both `model` and `fallback` are required when enabled.

To roll back, set `inochi2d_widget.enable: false` and regenerate the site. The
adapter will inject no markup and generate no widget asset routes. Remove stale
deployed hashed asset directories according to the hosting platform's normal
cleanup policy.

The generic package exposes:

```ts
const controller = await mountInochi2DWidget(element, config);
controller.pause();
controller.resume();
controller.setParameter("MouthOpen", 0.5);
controller.setParameter("Head:: Yaw-Pitch", [0.2, -0.1]);
controller.resetCamera();
controller.destroy();
```

Bundlers must keep `generated/runtime.js` beside `generated/runtime_bg.wasm`.
The Vanilla example includes a Vite build hook demonstrating this copy step;
the Hexo adapter preserves the directory automatically.
