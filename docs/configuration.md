# Configuration

## Fully automatic CLI

Copy the packaged `inochi2d-blog.config.example.json`. Paths are relative to the
config file unless absolute:

```json
{
  "schemaVersion": 1,
  "blogRoot": "../my-hexo-blog",
  "model": "../models/public-puppet.inp",
  "fallback": "../models/public-puppet.png",
  "publication": {
    "confirm": true,
    "allowRedistribution": true,
    "sourceSha256": "64 lowercase or uppercase hexadecimal characters",
    "attribution": "Required when model metadata requires it"
  },
  "hexoConfig": "_config.yml",
  "previewPort": 4192,
  "previewPath": "/",
  "widget": {
    "render": {
      "fps": 30,
      "maxDevicePixelRatio": 1.25,
      "autoFit": true,
      "fitPadding": 0.9
    },
    "mobile": {
      "show": false,
      "breakpoint": 768
    },
    "ambient": {
      "parameters": [
        {
          "id": "Tail - Left/Right Swing",
          "minimum": -0.55,
          "maximum": 0.55,
          "periodMs": 4200,
          "phase": 0
        }
      ]
    },
    "dialogue": {
      "enter": {
        "animation": "Greeting",
        "lines": [
          "Welcome!"
        ],
        "delayMs": 500,
        "durationMs": 5000
      },
      "idle": {
        "animation": "IdleTalk",
        "lines": [
          "Still here?",
          "Take your time."
        ],
        "intervalMinMs": 30000,
        "intervalMaxMs": 60000,
        "durationMs": 5000
      },
      "click": {
        "animation": "Click",
        "lines": [
          "Hello!"
        ],
        "durationMs": 5000
      }
    },
    "interactions": {
      "pointer": true,
      "drag": true
    }
  }
}
```

`inspect` needs only `schemaVersion`, `model`, and an optional
`pipelineBinary` or `pipeline` selection. It is read-only and prints the source
SHA-256, compatibility, parameters, metadata, and rights warnings. `preview`
additionally needs
`blogRoot` and `fallback`, but does not require `publication`. It prepares and
generates only below `.inochi2d/preview`, runs the browser gates, listens only
on `127.0.0.1`, and deletes that temporary run after Ctrl+C. Publication
metadata is shown as a warning; compatibility, model integrity, size, animation,
parameter, Hexo, and browser failures still stop the command. `prepare`,
`verify`, and `deploy` require every field above and retain all publication
gates.

- `publication.confirm` acknowledges an intentional public operation.
- `allowRedistribution` asserts that the operator has checked model rights.
- `sourceSha256` binds that decision to the exact inspected input bytes.
- `pipelineBinary` may point to a local native binary. Otherwise the package
  verifies and uses its experimental unsigned Windows/Linux x64 binary. No
  native program runs during npm installation. If system policy blocks the
  bundled executable, keep the block in place and point this field to a trusted
  build made from the repository source; the CLI otherwise exits without
  generating or deploying the blog.
- On Windows only, `pipeline` can explicitly select WSL compression instead:
  `{"backend":"wsl","distribution":"Ubuntu","binary":"/absolute/linux/path"}`.
  `pipeline` and `pipelineBinary` are mutually exclusive. Run the CLI from
  Windows, keep `blogRoot`, `model`, and `fallback` as Windows paths, and use a
  normalized absolute POSIX path for `pipeline.binary`. Inspection and
  compression run through the named distribution; Hexo, Chrome, and Edge
  remain Windows processes. Invalid configuration, path translation, a missing
  distribution/binary, or a non-zero WSL process stops the workflow before
  Hexo generation. There is no automatic backend selection or fallback.
- `hexoConfig` defaults to `_config.yml`.
- `previewPort` defaults to 4192 and must be between 1024 and 65535.
- `widget` is merged into the generated `inochi2d_widget` Hexo config, but the
  CLI always forces `enable: true`, `mobile.show: false`, and its verified
  immutable bundle.
- Every configured ambient or scene animation name is exact and case-sensitive.
  Inspection, preparation, and generation stop if any referenced animation is
  not present and valid in both the source model and prepared output.
- Procedural `ambient.parameters` are also exact and case-sensitive. The CLI
  validates each target against both the inspected and prepared rig, rejects
  duplicate/overlapping axes, and rejects collisions with a configured ambient
  animation lane.
- Dialogue lines are rendered as plain text. Each enabled scene requires 1-128
  non-empty lines; each line is limited to 1024 UTF-8 bytes. Durations must be
  500-60000 ms, entry delay 0-120000 ms, and idle intervals
  5000-3600000 ms with the maximum not below the minimum.
- `dialogue.click` owns click playback when enabled. The older
  `interactions.click` form remains available for animation-only clicks. Both
  may be present only when their exact animation names match; the dialogue
  scene owns the click in that compatibility case.

The blog must install compatible `hexo`, `hexo-inox2d-widget`, and `playwright`
packages. Chrome and Edge must be installed for Windows release gates.

Start the isolated local workflow with:

```sh
inochi2d-blog preview --config inochi2d-blog.config.json
```

The generated local-preview token is an internal, one-run capability. It is
accepted only when the same child process writes below `.inochi2d/preview`; it
cannot authorize a normal `public` directory and is not a publication
attestation.

## Direct Hexo plugin

An already prepared local bundle can be configured without the deploy CLI:

```yaml
inochi2d_widget:
  enable: true
  bundle: .inochi2d/bundles/sourcehash-modelhash-manifesthash
  publication:
    confirm: true
    allowRedistribution: true
    sourceSha256: 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
  display:
    width: 260
    height: 360
  render:
    fps: 30
    maxDevicePixelRatio: 1.25
    autoFit: true
    fitPadding: 0.9
  mobile:
    show: false
    breakpoint: 768
  ambient:
    parameters:
      - id: Tail - Left/Right Swing
        minimum: -0.55
        maximum: 0.55
        periodMs: 4200
  dialogue:
    enter:
      animation: Greeting
      lines:
        - Welcome!
      delayMs: 500
      durationMs: 5000
    idle:
      animation: IdleTalk
      lines:
        - Still here?
        - Take your time.
      intervalMinMs: 30000
      intervalMaxMs: 60000
      durationMs: 5000
    click:
      animation: Click
      lines:
        - Hello!
      durationMs: 5000
  interactions:
    pointer: true
    drag: true
```

Externally hosted assets can use `model` and `fallback` instead of `bundle`.
Relative URLs are prefixed with Hexo's configured `root`; a cross-origin model
server must permit CORS. Local bundle mode is safer because the adapter verifies
the manifest and every artifact.

Local bundle mode enables `render.autoFit` unless the operator explicitly sets
it. The runtime derives neutral model-space bounds from the official SDK draw
list, centers them, and contains them within `fitPadding` (0.1-1.0) of the
widget. Set `autoFit: false` with `initialScale` for an intentionally
hand-composed camera.

### Motion profiles and calibration

Idle parameter mappings accept a string, multiple strings, or a descriptor with
`id`, optional `axis`, `scale`, and `offset`. The adapter first infers
conservative semantic channels from conventional Aka and Mannequin names.
Values explicitly supplied under `widget.parameters` (CLI) or
`inochi2d_widget.parameters` (direct Hexo) replace the inferred value for that
channel. This keeps a supplied model zero-config when its naming is
conventional, while preserving exact per-model control.

For example, a model whose gaze and head response feels too large can override
only those channels:

```json
{
  "widget": {
    "parameters": {
      "eyeX": [
        { "id": "Left Eye - Gaze", "axis": "x", "scale": 0.28 },
        { "id": "Right Eye - Gaze", "axis": "x", "scale": 0.28 }
      ],
      "headX": [
        { "id": "Head - Pitch/Yaw", "axis": "x", "scale": 0.24 },
        { "id": "Body - Yaw", "scale": 0.08 }
      ]
    }
  }
}
```

Use a negative scale to reverse an axis, `offset` to translate its neutral
value, and `null` to disable an inferred channel. The built-in Mannequin
profile deliberately keeps horizontal pointer amplitudes below its vertical
response (`0.4` gaze, `0.35` head, and `0.12` body yaw) because generated rigs
often bind irises and face-color layers strongly on X. It does not exercise
every rig to its extremes.

Model authors are encouraged, but not required, to use a neutral value of zero,
a useful symmetric range near `-1..1`, and conventional semantic names. This is
a zero-configuration convention, not a requirement to distort the rig or put
every extreme pose at a plugin-defined value. Exact animation names such as
`Click` remain intentionally explicit because authored actions cannot be
inferred safely. See both profiles in `examples/vanilla/src/main.ts`.

Click motion comes only from the Creator animation stored in the model.
`dialogue.click.animation` selects its exact name and pairs it with a random
plain-text line. For animation without a bubble,
`interactions.click.animation` selects the clip instead. Set
`interactions.click: false` to disable click playback. There is deliberately no
parameter mapping or synthesized movement fallback: an enabled but missing
animation is a generation error, so an untested pose cannot enter a production
blog.

## Model-authored motion and scene behavior

`ambient.animations` starts up to eight model-authored Creator clips and keeps
them running in the background. Clips use their Creator `leadIn`/`leadOut` loop
region. `ambient.parameters` provides up to sixteen deterministic sine
oscillators for rigs such as Mannequin that expose tail parameters but do not
embed an animation clip. Each oscillator declares an exact parameter, optional
vector axis, minimum/maximum, 500-120000 ms period, and optional 0-1 phase.
Ambient sources may not target the same parameter axis; conflicting lanes stop
configuration. A foreground enter/idle/click scene temporarily wins when it
targets the same lane, then the ambient source resumes at its continuing phase.
No oscillator is synthesized for an unknown rig: the Hexo adapter only infers
the two conventional Mannequin tail names, and explicit unknown names fail the
automatic workflow.

The three initial dialogue scenes are:

- `dialogue.enter`: starts after the model has loaded and drawn its first
  successful frame, then waits for the optional `delayMs`.
- `dialogue.idle`: starts at a random time between `intervalMinMs` and
  `intervalMaxMs`, and is deferred by user interaction or page hiding.
- `dialogue.click`: starts immediately on a valid click and has priority over
  an entry or idle scene.

Each scene plays its configured exact animation and displays one random
sentence from `lines` in a bubble positioned above the dragged model (or below
it when the viewport has no room). The bubble is viewport-clamped, announced as
polite status text, and populated with `textContent`, not HTML. There is no
animation-name fallback. Under `prefers-reduced-motion`, no loop or scene
animation is advanced; the entry sentence is shown with the neutral static
pose, while idle and click motion remain disabled.

Hair, sleeves, accessories, and similar secondary motion come only from
`SimplePhysics` nodes authored in the model. The official SDK update is advanced
once per rendered frame after pointer/animation parameters are applied, so
those nodes can react to head, body, and arm movement. The frame delta is capped
after a background-tab pause so the model is not given one unstable multi-second
physics step. There is no physics configuration and no synthetic web fallback:
a model without the relevant drivers simply has no such secondary motion.

The browser runtime verifies that the configured breath target actually changes
the official draw list. Declared-but-inert bindings automatically use a subtle
whole-model breathing fallback; set `parameters.breath: null` to request a
strictly non-breathing idle pose.

To disable the widget, set `inochi2d_widget.enable: false` and regenerate. No
theme or `node_modules` file is patched.

## Runtime API

```ts
const controller = await mountInochi2DWidget(element, config);
controller.pause();
controller.resume();
controller.setParameter("MouthOpen", 0.5);
controller.setParameter("Head:: Yaw-Pitch", [0.2, -0.1]);
controller.resetCamera();
controller.destroy();
```
