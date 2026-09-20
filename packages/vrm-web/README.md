# vrm-web

Local-first WebGL2 VRM 0 / VRM 1 backend for the shared model-widget contract.
The ESM browser entry bundles Three.js, three-vrm and three-vrm-animation.
Import `dist/widget.css` and call `mountModelWidget(host, config, { signal })`.

```js
const controller = await mountModelWidget(host, {
 backend: "vrm", model: "/model.vrm", fallback: "/portrait.png",
 animations: [{ name: "Idle", url: "/Idle.vrma" }],
 render: { fps: 30, maxDevicePixelRatio: 1.5 },
 mobile: { show: false },
});
void controller.playAnimation("Idle", { mode: "loop" });
```

Loading has streaming byte limits and rejects external glTF resource references.
A model with no animations can be previewed. Missing clip names reject; there is
no synthesized Idle animation. Loop promises settle on interruption or stop.
Pause and document hiding stop sampling and physics; resuming does not catch up
elapsed offline time. Destroy aborts loading, settles playback and releases GPU
resources. `prefers-reduced-motion` presents a stationary model.

An optional data-only Weiguang profile supplies neutral pose, named expressions,
custom blink morphs, ear rest poses and accessory visibility. Ordinary VRM models
have no dependency on that profile. Never merge custom morphs indiscriminately.
The common interface does not emulate Inochi2D parameters for VRM bones.

The backend additionally exposes expression inspection and selection, plus frame
and renderer diagnostics for local validation. These are not performance claims.

## Private preview

Build `model-widget-core` and this package, then run the private example with
`node examples/vrm/server.mjs --assets /path/to/companion-assets` from the workspace.
Only loopback is served. Assets remain outside the repository and package.
The preview has eight-action, repeated mount and 15-minute idle checks; reports
are written under the explicitly supplied private asset directory's `qa` folder.

`readPreparedBundleSync` exposes the same manifest validation for synchronous
build systems such as Hexo. `readPreparedBundle` remains the Promise-based entry.
The version tests load actual artwork-free VRM0 and VRM1 GLBs and retarget an
actual VRMA clip through the pinned Pixiv loader; they do not replace the loader
with a mock. WebGL appearance and character behavior still need browser checks.
