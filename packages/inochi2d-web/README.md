# inochi2d-web

Unofficial, framework-free Inochi2D WebGL2 widget runtime using a reproducible
browser build of the official Inochi2D D SDK.

## Install and mount

```sh
npm install inochi2d-web
```

```ts
import { mountInochi2DWidget } from "inochi2d-web";
import "inochi2d-web/widget.css";

const host = document.querySelector<HTMLElement>("#inochi2d-widget");
if (!host) throw new Error("missing widget host");

const widget = await mountInochi2DWidget(host, {
  model: "/models/puppet.inp",
  fallback: "/models/puppet.png",
  render: { fps: 30, maxDevicePixelRatio: 1.25 },
  mobile: { show: false, breakpoint: 768 },
});

// Lifecycle and manual parameter control remain available to the host page.
widget.pause();
widget.resume();
widget.setParameter("Head:: Yaw-Pitch", [0.2, -0.1]);
widget.resetCamera();
widget.destroy();
```

The model URL must return a compatible Creator `.inp`/`.inx`; cross-origin
servers must allow CORS. Use the companion native pipeline and
`inochi2d-blog` before accepting untrusted models or publishing model bytes.

## Alpha contract

The alpha targets desktop Chrome and Edge. Mobile is hidden before any runtime,
WASM, or model fetch. WebGL1, BC7, MeshGroup, built-in animations,
microphone/camera input, and Firefox/Safari compatibility promises are outside
this release.

This package is AI-assisted, human-reviewed, BSD-2-Clause licensed, and not
affiliated with the Inochi2D project. It contains no puppet.

Read the
[configuration guide](https://github.com/StarCried/inochi2d-web/blob/main/docs/configuration.md),
[model policy](https://github.com/StarCried/inochi2d-web/blob/main/docs/model-policy.md),
and [security policy](https://github.com/StarCried/inochi2d-web/blob/main/SECURITY.md)
before publishing a model.
