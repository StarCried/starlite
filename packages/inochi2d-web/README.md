# inochi2d-web

Unofficial, framework-free Inochi2D WebGL2 widget runtime using a reproducible
browser build of the official Inochi2D D SDK.

## Install and mount

```sh
npm install inochi2d-web
```

```ts
import {
  mountInochi2DWidget,
  type WidgetConfig,
} from "inochi2d-web";
import "inochi2d-web/widget.css";

const host = document.querySelector<HTMLElement>("#inochi2d-widget");
if (!host) throw new Error("missing widget host");
const manifest = await fetch("/models/manifest.json").then(
  (response) =>
    response.json() as Promise<{
      animations?: WidgetConfig["animations"];
    }>,
);
if (!manifest.animations) throw new Error("model manifest has no animations");

const widget = await mountInochi2DWidget(host, {
  model: "/models/puppet.inp",
  fallback: "/models/puppet.png",
  animations: manifest.animations,
  render: {
    fps: 30,
    maxDevicePixelRatio: 1.25,
    autoFit: true,
    fitPadding: 0.9,
  },
  mobile: { show: false, breakpoint: 768 },
  ambient: {
    parameters: [
      {
        id: "Tail - Left/Right Swing",
        minimum: -0.55,
        maximum: 0.55,
        periodMs: 4200,
      },
    ],
  },
  dialogue: {
    enter: { animation: "Greeting", lines: ["Welcome!"] },
    idle: {
      animation: "IdleTalk",
      lines: ["Still here?", "Take your time."],
      intervalMinMs: 30_000,
      intervalMaxMs: 60_000,
    },
    click: { animation: "Click", lines: ["Hello!"] },
  },
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
WASM, or model fetch. Pipeline-validated, model-authored `Forced` animation
lanes can be played by exact name; configured ambient clips use the Creator
`leadIn`/`leadOut` loop region. The official runtime also advances model-owned
`SimplePhysics` nodes and supports MeshGroup, Camera, ColorBurn, and Cubic
bindings in the pinned compatibility profile. `render.autoFit` centers and
contains neutral SDK draw bounds without model-specific scale constants.
WebGL1, BC7, model automation, additive/Bezier/crossfade animation behavior,
microphone/camera input, and Firefox/Safari compatibility promises are outside
this release.

This package is AI-assisted, human-reviewed, BSD-2-Clause licensed, and not
affiliated with the Inochi2D project. It contains no puppet.

Read the
[configuration guide](https://github.com/StarCried/inochi2d-web/blob/main/docs/configuration.md),
[model policy](https://github.com/StarCried/inochi2d-web/blob/main/docs/model-policy.md),
and [security policy](https://github.com/StarCried/inochi2d-web/blob/main/SECURITY.md)
before publishing a model.
