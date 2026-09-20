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
and renderer diagnostics for local validation, including active clip and bounded
gaze angles. These are not performance claims.

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

Preparation requires all standard humanoid bones and rejects non-finite binary
geometry, unknown VRM versions and buffer views outside the declared buffer.

State interruptions settle the previous promise immediately and blend the current
visible pose into the new clip for 200 ms. Rapid switches keep one pose snapshot,
not a growing queue. Explicit stop/destroy restores neutral immediately.

### Embedded VRM textures and CSP

Three.js decodes embedded VRM images via temporary `blob:` URLs. Sites with a
Content Security Policy must allow `blob:` in `connect-src` (ImageBitmap fetch)
and `img-src` (image loader). Keep all other directives unchanged. The plugin
does not rewrite the site's policy. A texture decoding/loading failure raises
`model-error` and displays the configured fallback instead of an untextured
white model. Validate the result in the target browser before acceptance.

### Portrait framing

`camera: { yawDegrees: -12, pitchDegrees: 3, fovDegrees: 20, targetHeight: 0.53 }`
configures a mild three-quarter portrait with a longer lens. Omit it for the
standard frontal camera. `targetHeight` is a fraction of visible model height.
Fit uses the visible neutral pose once; hidden accessories do not affect the
frame and viewport resizing does not recenter around the current gesture.
`render.fitPadding` reserves space for hands. Check all clips visually when
choosing padding; the neutral bounds cannot predict an arbitrary animation.

### Pointer gaze and dialogue

Pointer following uses the actual head position and the portrait camera, with
VRM0/VRM1 coordinate conversion handled by three-vrm. Defaults are
`gaze: { maxYawDegrees: 25, maxPitchDegrees: 15, smoothingMs: 100 }`.
Pointer movement is normalized over the available viewport space on each side
of the eyes, so a small corner widget keeps responding across the article area.
These bound the look-at input angles; the model's own eye range maps still apply.
Authored look-at animation retains priority. Leaving the page returns gaze toward
the camera; `interactions.pointer: false` disables following.

Enter, click and idle dialogue use the same accessible bubble as Inochi2D.
Configure `dialogue.click` and `dialogue.idle` to enable those sentences; an
animation-only click configuration intentionally has no invented dialogue.
Hidden/paused models dismiss bubbles. Reduced-motion entry still displays text
and expires without starting a continuous render loop.
