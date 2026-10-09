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
The preview checks every declared action, repeated mounts and 15 minutes idle; reports
are written under the explicitly supplied private asset directory's `qa` folder.

`readPreparedBundleSync` exposes the same manifest validation for synchronous
build systems such as Hexo. `readPreparedBundle` remains the Promise-based entry.
The version tests load actual artwork-free VRM0 and VRM1 GLBs and retarget an
actual VRMA clip through the pinned Pixiv loader; they do not replace the loader
with a mock. WebGL appearance and character behavior still need browser checks.

Preparation requires all standard humanoid bones and rejects non-finite binary
geometry, unknown VRM versions and buffer views outside the declared buffer.

State interruptions settle the previous promise immediately and blend the current
visible pose into the new clip for 400 ms with cubic ease-in/ease-out weights.
The weights stay between zero and one: they do not add rebound or preserve the
outgoing clip's velocity. Rapid switches keep one pose snapshot, not a growing
queue. Explicit stop/destroy restores neutral immediately.

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
The portrait target uses the visible neutral pose; hidden accessories do not
affect it. The camera is fitted only when the logical host dimensions change.
During motion, conservative bounds follow the skin's joint clusters and blended
morph offsets. Limbs that extend beyond the portrait grow the transparent canvas
in 32 CSS pixel increments, with an 8 pixel outline margin. The character keeps
its original screen position and pixel size; the camera does not zoom out.
Margins remain until the widget is destroyed, including after a return to Idle.
This transforms one box per influencing joint instead of reskinning every vertex
each frame. `render.fitPadding` reserves the initial edge margin.
`render.autoFit: false` disables gesture canvas expansion for hosts that supply
their own framing. `resetCamera()` preserves the portrait size unless the logical
host dimensions changed. Pointer gaze and drag inertia use the logical portrait,
so expanding the surface does not change their scale.

The host emits bubbling `model-viewport-change` events on initial sizing and every
surface change, with `{ left, top, width, height, baseWidth, baseHeight }` in CSS
pixels relative to the logical host. Native transparent windows must resize to
these bounds while compensating their position to preserve the logical portrait's
screen origin. Destroy emits the original logical bounds. Diagnostics expose the
same data as `framing.viewport`. Keep overflow visible around the logical host.
Check all clips visually, including physics and transitions, before acceptance.

### Moving the host

`setHostPosition(x, y)` accepts local screen positions in CSS pixels. The first
sample establishes a baseline. Subsequent movement feeds a bounded virtual world
translation into the VRM spring solver, including avatar-relative spring centers;
the translation is removed before rendering. This produces inertia in imported
hair/ears/tails without moving the character inside its canvas or adding fake
bone rotations. Web dragging calls it automatically. Native hosts must forward
window movement themselves. Pausing clears pending motion; resuming never applies
movement accumulated while hidden. Models without spring bones remain stationary.
The coordinates stay in memory and never cross a network or status protocol.

### Pointer gaze and dialogue

Pointer following uses the actual head position and the portrait camera, with
VRM0/VRM1 coordinate conversion handled by three-vrm. Defaults are
`gaze: { maxYawDegrees: 25, maxPitchDegrees: 15, smoothingMs: 100 }`.
Pointer movement is normalized over the available viewport space on each side
of the eyes, so a small corner widget keeps responding across the article area.
The normalized head adds up to 60% of those limits (15° yaw / 9° pitch by
default), then the eyes aim for the remaining angle. The additive head pose is
removed before each animation sample, so it cannot accumulate or contaminate
state transitions. Following applies to the base Idle loop and neutral preview.
Foreground gestures suspend head and eye following until they return to Idle.
Their authored eye direction is preserved; clips without look-at tracks use
neutral eyes, rather than retaining the previous pointer target.
Pointer events are captured before page handlers can stop bubbling.
These bound the look-at input angles; the model's own eye range maps still apply.
Leaving the page returns gaze toward the camera. `interactions.pointer: false`
disables following and preserves authored look-at instead.

Enter, click and idle dialogue use the same accessible bubble as Inochi2D.
Configure `dialogue.click` and `dialogue.idle` to enable those sentences; an
animation-only click configuration intentionally has no invented dialogue.
Hidden/paused models dismiss bubbles. Reduced-motion entry still displays text
and expires without starting a continuous render loop.

Keep `ambient.animations: ["Idle"]` for the continuous base loop. Occasional
gestures belong in `dialogue.idle`, with `animation: "Yawn"`, optional
`animations: ["Yawn", "Stretch"]`, sentence lines and interval limits. Click
dialogue uses the same pool selection. Without dialogue, use
`interactions.click: { animations: ["Wave", "Nod"] }` for animation-only clicks.
Each trigger plays the complete clip once, then blends its final pose directly
into the configured base loop over 400 ms with the same eased blend. Bubble
duration does not shorten a clip. Clicks during an entry or another foreground
gesture are ignored. A static clip remains a static pose; author entry/exit in
its VRMA for a gesture.
