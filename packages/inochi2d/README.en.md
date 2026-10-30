# @starcried/starlite-inochi2d

[简体中文](README.md) · English

StarLite's optional Inochi2D WebGL2 backend, using a reproducible official D SDK build. Supports embedded motions, parameters, physics, and shared dialogue. This project is not affiliated with the official Inochi2D project.

```sh
npm install @starcried/starlite-inochi2d@alpha
```

## Mount

Prepare an authorized `.inp`/`.inx` with the model pipeline. In a bundled web application, provide a host element and use the prepared manifest:

```js
import { mountInochi2DWidget } from "@starcried/starlite-inochi2d";
import "@starcried/starlite-inochi2d/widget.css";

const host = document.querySelector("#starlite");
if (!host) throw new Error("Missing StarLite host");
const response = await fetch("/models/manifest.json");
if (!response.ok) throw new Error("Cannot load model manifest");
const manifest = await response.json();
const controller = await mountInochi2DWidget(host, {
  locale: "en",
  model: "/models/puppet.inp",
  fallback: "/models/puppet.png",
  animations: manifest.animations,
  render: { fps: 30, maxDevicePixelRatio: 1.25, autoFit: true },
});
```

Motion names match the model exactly and are case-sensitive. Missing click motions are not invented. Playback and lifecycle follow the shared controller contract; `setParameter()` remains Inochi2D-specific. Call `controller.destroy()` when unmounting.

Hosts can reuse `QuickSettingsMenu` with `locale: "en"`. `setDisplaySize`, `setFrameRate`, `setPointerEnabled`, and `setBubblesVisible` apply immediately; hiding text does not stop bound motions. VRM humanoid motions are not supported by this backend.

Alpha targets desktop Chrome/Edge. A standalone site must gate a dynamic import before loading runtime to avoid mobile downloads; the static import above downloads JavaScript. Cross-origin model hosting needs appropriate CORS.

[Shared contracts](https://github.com/StarCried/starlite/blob/main/packages/core/README.en.md) · [Hexo adapter](https://github.com/StarCried/starlite/blob/main/packages/hexo/README.en.md) · [Legacy pipeline details (Chinese)](https://github.com/StarCried/starlite/blob/main/docs/configuration.md#inochi2d-专用配置与-cli)

BSD-2-Clause. No models or third-party motions are included.
