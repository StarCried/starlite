# @starcried/starlite-vrm

[简体中文](README.md) · English

StarLite's WebGL2 backend for VRM 0/1, embedded glTF animations, external VRMA, limited pointer following, blink, and shared dialogue. The browser entry bundles Three.js, three-vrm, and three-vrm-animation.

```sh
npm install @starcried/starlite-vrm@alpha
```

## Mount

Provide `<div id="starlite"></div>` and use a bundler:

```js
import { mountModelWidget } from "@starcried/starlite-vrm";
import "@starcried/starlite-vrm/widget.css";

const host = document.querySelector("#starlite");
if (!host) throw new Error("Missing StarLite host");
const controller = await mountModelWidget(host, {
  backend: "vrm",
  locale: "en",
  model: "/model.vrm",
  fallback: "/portrait.png",
  dialogue: { click: { lines: ["Hello!", "I'm here."] } },
  interactions: { pointer: true },
  render: { fps: 30, maxDevicePixelRatio: 1.5 },
});
```

No motion file is required. The runtime uses an authored `Idle` when available, otherwise `StarLiteIdle` supplies a relaxed stance and breathing. Current source also provides optional `StarLiteCuriousPeek`, `StarLiteHappyWave`, and `StarLiteSleepyStartle` gestures for humanoid models. These are reserved names, not character artwork. Assign gestures explicitly; preserve motion provenance in the package notices. New source features may require a release newer than the current npm alpha.

Use `animations: [{name: "Wave", url: "/Wave.vrma"}]` for your own VRMA. `ambient` chooses a baseline loop; `neutralAnimation` chooses the stopped pose. An empty ambient list stops baseline playback. Blink needs effective standard Blink bindings or a full left/right pair; absence disables blink only. Eye following needs valid VRM lookAt. Models must be self-contained.

`inspectVrm(bytes).animations` lists embedded motion names and durations. Pass names in `embeddedAnimations` to reference them from configuration. `getAnimations()` lists loaded embedded, external, and built-in motions. Names must be unique and case-sensitive. Data-only character configuration can be embedded as `extras.starlite.profile`.

Call `destroy()` when unmounting. Hidden models stop animation and physics; resume does not catch up hidden time. A bubble scene may omit animation entirely. `linesByAnimation` must match its selected pool.

## Live adjustments and diagnostics

```js
controller.setModelAdjustments({
  idle: { armLiftDegrees: 10, palmTwistDegrees: 5, wristLiftDegrees: 8, handCurl: 0.2, elbowBendDegrees: 8 },
  gaze: { headStrength: 0.8, eyeStrength: 1, smoothingMs: 120 },
});
```

This replaces current adjustments; `{}` restores originals without reloading or restarting motion. Pose correction affects only `StarLiteIdle`. Upper-arm lift: −30–45°; palm twist and wrist lift: −45–45°; elbow correction: −20–45°; hand curl: 0–1, omitted to keep authored fingers. Head/eye strength is 0–2; smoothing is 20–1000 ms. Missing mappings cannot be created by sliders.

`performance: {show: true}` or `setPerformanceVisible(true)` enables local FPS and timing diagnostics. CPU-side frame cost is not measured GPU execution or CPU utilization. Node's `@starcried/starlite-vrm/inspect` returns capabilities and logical metrics; errors expose controlled codes without private paths or external URIs.

[Configuration](https://github.com/StarCried/starlite/blob/main/docs/configuration.en.md) · [Hexo adapter](https://github.com/StarCried/starlite/blob/main/packages/hexo/README.en.md) · [Shared API](https://github.com/StarCried/starlite/blob/main/packages/core/README.en.md)

Allow appropriate `img-src blob:` and `connect-src blob:` for embedded textures in CSP. To avoid downloading JavaScript on mobile, gate a dynamic import before loading runtime; the static import above does not do that.

Program code: BSD-2-Clause. Models and motion sources retain their own licenses.

### Environment fill light

Optional `environmentLighting: { color: "#b7cfff", strength: 1 }` adds environmental colour using the existing lights. Use six-digit RGB and strength 0–2 (default 1, or 100%). The ordinary range is 0–100%; 100–200% exaggerates colour and brightness response. Part of the side-key energy moves into the ambient fill; the key remains white, model materials/textures stay unchanged, and no lights are added.

At 100% strength, inferred brightness targets are 80% for black, approximately 100% for middle grey and 110% for white. Optional `brightness: 0.95` explicitly sets a target in 0.8–1.1. Strength controls colour and brightness together: at 20%, the effective light multiplier is approximately 90.24%–104.88%; at 200%, it expands to 60%–120%. These bounds describe light energy, not each material's screen-pixel brightness. Chroma is luminance-normalized to avoid double darkening, and near-black colour noise is suppressed.

`controller.setEnvironmentLighting(...)` smoothly updates colours and both light intensities together. `null` or strength 0 restores the original lighting. While paused, a change redraws the still pose without advancing animation. Omitting the option keeps the original lighting; the runtime never captures the screen, and the host supplies the colour.
