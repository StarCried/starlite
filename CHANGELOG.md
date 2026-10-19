# Changelog

All notable changes will be recorded here. The project follows semantic
versioning; prereleases use the explicit npm `alpha` channel.

## Unreleased

- Add the default Weiguang Hexo preset: no configuration is needed, while
  `_config.yml` can disable it, override its dialogue/display settings or select
  a custom VRM without inheriting character-specific behavior.
- Acquire the separately licensed, pinned model and notices during generation,
  validate cached bytes and SHA-256, and reuse valid assets offline. Acquisition
  failures warn and omit the widget for that generation; a later generation
  retries without blocking the blog's normal output.
- Add Hexo host positioning through `position.right`, `bottom` and `zIndex`.
  The default preset retains the demonstration blog's actions, sentences and
  presentation; generic custom-model defaults remain unchanged.
- Add an optional corner performance panel to both renderers, forwarded by Hexo
  through `performance.show`. It defaults off, does not intercept pointer input,
  and distinguishes rendered FPS, frame intervals and CPU-side submission cost.
- Report usable humanoid, blink and eye-tracking capabilities plus structural
  model metrics; give controlled, actionable errors for malformed mappings and
  resources without echoing private resource URLs.
- Keep Inochi2D's directly served browser module imports resolvable, and check
  the actual distributed module graph rather than relying on a bundler.
- Use bounded VRM diagnostic ring buffers and compute diagnostic framing only
  when requested. Add runtime-size and measured-performance budgets, real-avatar
  compatibility evidence, Chrome/Edge CI coverage and reviewed dependency gates.

These changes are a local candidate, not part of the published
`0.1.0-alpha.2` packages. No new npm or GitHub release has been published.

## 0.1.0-alpha.2 - 2026-10-15

- Allow standard humanoid VRM 0/1 models without Blink expressions. Missing,
  empty, zero-weight or incomplete blink capability disables automatic blinking;
  malformed declared bindings remain errors. Complete left/right presets now
  blink together, while authored asymmetric blinks remain intact.
- Hide failed Hexo companions and retry up to three times in the background.
  Successful retries restore the model without replaying an entrance, retaining
  stale canvases or blocking the page. Hidden/offline/mobile guards remain active.
- Make page click-through the default for VRM blogs, while preserving explicit
  drag and click-ownership settings.
- Validate character-profile baseline actions against embedded and configured
  external animations before generation. Explicit settings take precedence over
  the profile, then automatic Idle selection; URL profiles retain their choice.
- Check local preview model/config paths before dependency installation or
  builds, with actionable guidance for Windows and WSL paths.
- Add an installation-free online demonstration and clarify optional model
  capabilities, version boundaries and user installation instructions.

## 0.1.0-alpha.1 - 2026-10-14

[Published release](https://github.com/StarCried/starlite/releases/tag/v0.1.0-alpha.1)
from source `a103ca9`, with all five npm packages on the `alpha` channel.
Post-release documentation does not change the tagged program artifacts.

- Renamed the project to StarLite, the Hexo adapter to hexo-starlite and
  runtime packages to @starcried/starlite-core, starlite-vrm and starlite-inochi2d.
  Consolidated package directories and changed the Hexo config key to starlite.
  Repository identities are StarCried/starlite and StarCried/starlite-dsh.
- Added the format-neutral playback contract, cancellable mounts, shared bubbles
  and per-animation sentence libraries.
- Added VRM 0/1 inspection, immutable bundle preparation, VRMA playback, limited
  pointer gaze and optional data-only character adaptation through Three.js.
- Added page click-through interaction, PJAX persistence, load preparation yields
  and spring rest-pose handling for animated host motion.
- Added the original bundled StarLiteIdle, automatic embedded-motion discovery,
  single-file VRM import and text-only bubbles for animation-free models.
- Simplified alpha installation, one-command local VRM preview and Hexo
  configuration documentation.

### Inochi2D implementation history

- Added a reproducible browser build of the official Inochi2D D SDK.
- Added a framework-free WebGL2 renderer and widget controller.
- Added blink, breath, pointer, click, drag, reset, fallback, reduced-motion,
  visibility, DPR, frame-rate, and context-loss behavior.
- Added a Hexo 7 adapter with hashed assets, mobile no-fetch bootstrap, and a
  PJAX-safe singleton.
- Added a native Windows/Linux model inspection and lossless compression
  pipeline for Creator `.inp` and `.inx` exports.
- Added the fail-closed `inochi2d-blog` inspection, preparation, verification,
  and deployment workflow with a built-in read-only preview server and
  interaction and measured performance gates.
- Added synthetic fixtures, unit tests, Chromium gates, CI validation, and a
  release dry run that never publishes packages or deploys a blog.
- Fixed model-space Y projection so Creator models render upright and added a
  public-model orientation regression.
- Pinned the native image pipeline to the latest release compatible with the
  declared Rust 1.85 toolchain.
- Fixed 30 FPS scheduling near display refresh deadlines and added 60 Hz and
  32.5 Hz timing regressions.
- Added strict extraction and browser playback of Creator model animations.
  Stationary press/release triggers the configured case-sensitive animation
  name (`Click` by default in the Hexo adapter); movement beyond the drag
  threshold remains a drag. Missing, malformed, unsupported, or mismatched
  animation data stops preparation or Hexo generation, with no parameter-pulse
  fallback.
- Matched Creator/SDK animation sampling for nearest, stepped, linear, and
  four-point cubic interpolation; retained vector parameter defaults and the
  official `-1` lead marker sentinel. Additive, non-`Forced`, and Bezier lanes
  remain explicit alpha blockers.
- Included the normalized manifest hash in immutable bundle directory names so
  pipeline upgrades cannot accidentally reuse stale animation metadata when
  the copied model bytes are unchanged.
- Added a restored-value draw-list probe for configured breath parameters.
  Models whose declared Breath bindings produce no visible output receive a
  subtle camera-scale idle fallback; effective model breathing is preserved.
- Added deterministic full third-party license bundles for the official D-SDK
  WASM and native Cargo dependency graph, with stale-output package gates.
- Fixed the official D-SDK browser migration so decoded textures retain their
  source orientation and legacy parameter ranges, composite colors,
  simple-physics output scales, and mesh deformation vectors deserialize
  correctly. The deformation fix prevents bound sleeves from remaining frozen
  while their separately transformed hands move.
- Added parameter-bound validation and clamping, a synthetic legacy
  compatibility fixture, and a full-range public Aka continuity regression.
- Increased the default desktop bottom clearance so the widget does not
  overlap Volantis' fixed return-to-top control at 1440 x 900.
- Defined the Inochi2D runtime and Hexo adapter as the normal browser alpha,
  while `inochi2d-blog` and its bundled native pipeline are an explicitly
  invoked experimental unsigned alpha. Installation has no native lifecycle
  script; integrity, authorization, or execution failures remain fail-closed.

Models and third-party animation libraries remain separately licensed; they
are not included in the npm packages.
