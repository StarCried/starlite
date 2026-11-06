# StarLite configuration

[简体中文](configuration.md) · English

[Quick start](../packages/hexo/README.en.md) · [Install/update/remove](release-guide.en.md)

This page follows current source. Check release notes for features available in the npm version you install. Configure a blog in its root `_config.yml`; page-specific text belongs in Markdown front matter. Do not edit plugin files or create a resource ZIP.

## Language and examples

```yaml
language: en
starlite:
  locale: en       # optional override: en / zh-CN
  preset: weiguang # weiguang / bluefish
```

Omit `locale` to inherit Hexo's `language` (the first entry if it is an array). Chinese language tags use Chinese; other nonempty tags use English. An absent site language preserves Chinese defaults. An explicit locale accepts `en` or `zh-CN`. Locale changes menus, notices, and shipped example dialogue. It never changes user sentences, page text, animation names, or model metadata. Rebuild after changing it.

No `starlite` block means the default Weiguang example. Partial settings override only supplied fields. BlueFish is a separately licensed optional example; its asset publication must precede availability through npm. Only the selected example downloads. Set `model` or `bundle` to use a custom model instead, without example motions or dialogue. Set `enable: false` to avoid example acquisition and companion routes.

Read [Weiguang terms](weiguang-license.en.md) or [BlueFish terms](bluefish-license.en.md). Hosting a model requires permission and attribution; the code license does not grant asset rights.

## Import your own VRM

```yaml
starlite:
  model: ./models/avatar.vrm
  publication:
    confirm: true
    allowRedistribution: true
```

Keep the file outside `source/`. A `.vrm` path selects the VRM backend automatically. The plugin validates self-contained VRM 0/1 files, discovers embedded motions, and generates hashed assets. FBX, ordinary GLB, Unity `.anim`, external buffers, and external textures are not accepted. The public single-model limit is 10 MiB. Optional `publication.sourceSha256` pins a reviewed source file; mismatches fail generation.

Humanoid mappings, rather than Blender object names, identify bones. Required bones are hips, spine, head, and both upper/lower arms, hands, upper/lower legs, and feet. Shoulders, neck, chest, toes, fingers, and eyes are optional.

Automatic blink needs a standard Blink expression with effective morph bindings, or a valid left/right pair: VRM0 `blink_l / blink_r`, VRM1 `blinkLeft / blinkRight`. Renaming a shape key alone does not bind it. Missing blink disables blink only; malformed declared bindings still reject the file. Eye following needs valid VRM lookAt bindings; head following retains angle limits.

## Built-in and imported motions

Every standard humanoid VRM can use these reserved names:

| Name | Purpose |
| --- | --- |
| `StarLiteIdle` | Relaxed stance and breathing; fallback when no authored Idle exists |
| `StarLiteCuriousPeek` | Curious peek |
| `StarLiteHappyWave` | Friendly high wave |
| `StarLiteSleepyStartle` | Drowsy pause and lively wake-up |

The three gestures are available for optional mappings; importing a model does not automatically assign all events. They contain retargetable humanoid motion, no BlueFish artwork or question/sweat decorations. Preserve their source notices; the wave includes adapted motion with separate provenance. Retargeting cannot guarantee perfect hands or silhouette on every body proportion.

An authored `Idle` takes precedence over the built-in baseline. To force the program baseline, use `neutralAnimation: StarLiteIdle` and `ambient: {animations: [StarLiteIdle]}`. `ambient: {animations: []}` stops the baseline loop. Pose parameters calibrate `StarLiteIdle` while preserving its breathing. The three program gestures (`StarLiteCuriousPeek`, `StarLiteHappyWave`, and `StarLiteSleepyStartle`) start and end from the selected Idle reference pose, including an adjusted `StarLiteIdle`. Authored and imported clips keep their original poses.

Embedded glTF motions are discovered automatically. External VRMA can be configured:

```yaml
starlite:
  model: ./models/avatar.vrm
  publication:
    confirm: true
    allowRedistribution: true
  animations:
    - name: MyWave
      url: /motions/my-wave.vrma
  interactions:
    click:
      animations: [StarLiteHappyWave, MyWave]
  dialogue:
    idle:
      animations: [StarLiteCuriousPeek, StarLiteSleepyStartle]
      linesByAnimation:
        StarLiteCuriousPeek: ["What are you reading?"]
        StarLiteSleepyStartle: ["I'm awake! Remember to take a break too."]
      intervalMinMs: 60000
      intervalMaxMs: 120000
```

Place external VRMA under `source/motions/` if using that URL. Names are case-sensitive and unique across embedded and configured clips; do not use reserved built-in names for imported clips. Only reference available motions. Runtime `getAnimations()` lists names and durations.

## Dialogue

Bubbles can work without motion: use `lines` and omit animation fields. `durationMs` sets sentence display time. `enter` runs once per tab for the same model, `click` responds to clicks, and `idle` schedules occasional interactions; it does not mean the continuously breathing baseline.

```yaml
starlite:
  dialogue:
    click:
      animations: [StarLiteHappyWave, StarLiteCuriousPeek]
      linesByAnimation:
        StarLiteHappyWave: ["Hello!", "Nice to see you."]
        StarLiteCuriousPeek: ["Something interesting?"]
      durationMs: 6300
```

Each trigger selects a motion and then a matching sentence. `linesByAnimation` must cover the complete selected pool and contain no unrelated names. A pool has 1–20 distinct names. `lines` instead supplies shared sentences. On an example preset, a `lines` override replaces that scene's animation-bound text while keeping its motion pool; a partial `linesByAnimation` override changes only matching entries. Arrays replace instead of merging by index.

`dialogue.click: false` disables click text; `interactions.click` can still play motions. Disable both to disable both behaviors. `dialogue.enter: false` and `dialogue.idle: false` disable those scenes, without stopping baseline Idle. Visitor **Show bubbles** only hides text and leaves scheduled motions active.

## Page-specific sentences

In an article or standalone page's front matter:

```yaml
---
title: About me
starlite:
  - "Welcome to this page."
  - "Take your time."
---
```

Or specify options explicitly:

```yaml
starlite:
  lines:
    - "Hi there!"
    - "Let's wave!"
  animation: StarLiteHappyWave
  triggers: [click, idle]
  mode: replace
  order: sequential
```

Use a space after each YAML hyphen. Options default to:

- `animation`: the global entrance animation, or its first pool entry; no entrance motion means text only. This selects the page's click/occasional gesture, not a new entrance on navigation.
- `triggers`: `[click, idle]`; either event can be selected alone.
- `mode`: `replace`, replacing global click/occasional sentences while on that page; `merge` adds page sentences before global ones, preserving their motion bindings.
- `order`: `sequential`; click and occasional events share one cursor. `random` chooses a random entry.

Override defaults in `_config.yml` under `starlite.pageDialogue`. Precedence is page options, then site page-dialogue defaults, then built-in defaults. Pages without front matter keep the global library. Up to 128 nonempty plain-text sentences are accepted, each at most 1024 UTF-8 bytes. Text is not rendered as HTML. PJAX switches context without remounting or replaying entrance. Leaving the page restores the global library.

## Display, gaze, and performance

Generic custom-model defaults (example presets can differ):

| Setting | Default / meaning |
| --- | --- |
| `display.width / height` | 320 × 480 CSS pixels |
| `render.fps` | 30; 60 or `display` also supported |
| `render.maxDevicePixelRatio` | 1.5, allowed 1–1.5; 1 can reduce rendering cost with antialiasing retained |
| `performance.show` | false; rendered FPS, frame-interval p95, and CPU-side frame-work p95 |
| `camera` | yaw, pitch, field of view, and target height |
| `gaze` | max yaw 25°, max pitch 15°, smoothing 100 ms |
| `mobile` | `{show: false, breakpoint: 768}`; guard runs before runtime/model requests |
| `interactions.pointer` | true |
| `interactions.passThrough` | true in VRM Hexo; transparent areas and ordinary short clicks preserve native page clicks, including when body dragging is enabled |
| `interactions.drag` | true in VRM Hexo; the host handles body dragging. Set false to disable it. Renderer drag always remains false |
| `position` | `{right: 16, bottom: 0, zIndex: 20}`; fixed CSS pixel offsets, Hexo only |
| `neutralAnimation` | sample for stopped neutral pose; overrides profile and auto-detected Idle |

CPU frame time includes model update and WebGL submission, including driver waits; it is not GPU time or CPU utilization. A higher cap increases possible GPU cost. Hidden/paused models stop animation and physics; resume does not simulate the offline interval.

For wide gestures, set all four `render.viewportPadding` fields (`left`, `top`, `right`, `bottom`) in CSS pixels. The canvas margin stays fixed while playing. Use `position` to keep the character away from the page edge.

## Pose and pointer adjustments

Use the local adjustment preview after installing and building the source workspace:

```sh
npm run start --workspace @starcried/starlite-vrm-example -- --model /path/to/avatar.vrm
```

Open `/adjust?lang=en`; `--compare-model /path/to/second.vrm` adds another model. Sliders preview without rewriting the model. Copy the result into `_config.yml`:

```yaml
starlite:
  adjustments:
    idle:
      armLiftDegrees: 10
      palmTwistDegrees: -8
      wristLiftDegrees: 6
      handCurl: 0.2
      elbowBendDegrees: 5
    gaze:
      headStrength: 0.8
      eyeStrength: 1
      smoothingMs: 150
```

| Parameter | Range and behavior |
| --- | --- |
| `idle.armLiftDegrees` | −30° to 45°, mirrored upper-arm lift |
| `idle.palmTwistDegrees` | −45° to 45°, symmetric inward/outward palm twist |
| `idle.wristLiftDegrees` | −45° to 45°, hand bending without moving the arm |
| `idle.handCurl` | 0 open to 1 closed; omit to preserve authored fingers; mapped fingers only |
| `idle.elbowBendDegrees` | −20° to 45°, forearm bend correction |
| `gaze.headStrength / eyeStrength` | 0–2, default 1; zero disables that following component while limits remain |
| `gaze.smoothingMs` | 20–1000 ms; lower follows faster |

Omit a field to preserve its original behavior. `{}` resets adjustments. Missing eye/finger bindings are not invented. The preview selects `StarLiteIdle` when exporting pose changes; gaze-only changes preserve the model's baseline.

## Failure handling and visitor settings

Loading or failure hides the character and preserves blog interaction. Browser retries are bounded to 2/5/15 seconds; successful loading restores it. Mobile, offline, and visibility guards remain active. See [network and recovery details](release-guide.en.md#downloads-cache-and-recovery).

Move the pointer near a VRM character to reveal **− / + / bubbles / hide** beneath it; the toolbar disappears after leaving and also supports keyboard focus. Resizing keeps the foot anchor and buttons fixed, independent of animation. The full right-click menu still provides frame rate, pointer tracking, pause, **Reset size**, and **Reset position**. Shift + right-click preserves the browser menu.

With the default `passThrough: true`, transparent areas and ordinary short clicks preserve native page events; no synthetic click is sent. A primary mouse press on an opaque body pixel becomes a drag only after moving more than 6 CSS pixels. Releasing a drag triggers neither a page click nor the character's click response. Form controls, toolbar controls, and modifier-key gestures keep their usual behavior. A page's custom `pointerdown` action cannot be undone after dragging starts.

An active drag can cross embedded comment frames; releasing it restores their normal interaction. Mouse events inside a cross-origin iframe do not reach the blog, so start from a body area outside that frame if the character already overlaps it. Ordinary clicks still go directly to the embedded page.

Position, size, and bubble preferences are saved locally in that browser. **Reset position** clears the visitor's dragged position and reapplies blog placement; **Reset size** targets 100%, subject to the current viewport limits. Narrow or short viewports reduce the base size automatically, and enlargement is limited by visible space around the anchor to keep the portrait and toolbar on screen. Hiding bubbles leaves motions active; **Show character** at the bottom right restores a temporarily hidden character.

VRM Hexo allows body dragging and page click-through together. It handles dragging in the host while always passing `drag: false` to the renderer. To disable only body dragging:

```yaml
starlite:
  interactions:
    passThrough: true
    drag: false
```

## Environment fill colours

VRM supports explicit light/dark theme fill colours and brightness in `_config.yml`. Omit the option to keep the original lighting. No page or screen pixels are captured.

```yaml
starlite:
  environmentLighting:
    color: "#ffe6cc"      # Light mode; quote six-digit RGB in YAML
    darkColor: "#adc6ff"  # Optional; omit to use color in both modes
    strength: 1           # 0–2 (0%–200%); default 1 (100%); 0 retains original lighting
    brightness: 1.0       # Optional light-mode lighting gain, 0.8–1.1
    darkBrightness: 0.9   # Optional dark-mode lighting gain, 0.8–1.1
```

Only the existing ambient fill is tinted; the key light stays white. Brightness adjusts both existing lights' intensities, blended by `strength`: a gain of `1` applies no additional overall brightness scaling, lower values dim and higher values brighten. Colour adaptation can still rebalance the neutral key and coloured fill. `strength: 0` restores the original lighting. This is a lighting-energy hint, not a guarantee of screen-pixel brightness or exposure. Materials may respond differently across models. Theme changes blend smoothly without reloading the model or restarting animation.

When a mode's brightness is omitted, the runtime derives a bounded automatic gain from that mode's colour. It never inherits the other mode's explicit gain. For example, setting only `darkBrightness` keeps automatic brightness in light mode. Omitting `darkColor` reuses `color` in dark mode while still allowing a separate `darkBrightness`. Remove the corresponding brightness field to restore that mode's automatic calculation.

`strength: 1` is the standard effect; values from `1` to `2` amplify adaptation linearly. Brightness inputs remain within `0.8–1.1`: at 100% strength the overall lighting gain spans `0.8–1.1`, and at 200% it can reach `0.6–1.2` for an exaggerated effect. Explicit existing values such as `strength: 0.2` are preserved; only omitted strength defaults to 100%. Omitting the entire `environmentLighting` option still disables the feature.

Theme detection checks `html`, then `body`, for `data-theme`, `data-color-mode`, `data-user-color-scheme` (`dark` / `light`), and the classes `dark` / `light` or `dark-mode` / `light-mode`. With no explicit theme, it follows the system `prefers-color-scheme`. For other theme conventions, have the theme switch also set `document.documentElement.dataset.theme = "dark"` or `"light"`. A single `color` plus optional `strength` does not install theme listeners; a separate theme colour or either mode's brightness does. This option is VRM-only.
