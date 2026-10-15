# StarLite 配置

普通启动见 [Hexo README](../packages/hexo/README.md)，可直接复制[完整 YAML 示例](examples/hexo-vrm.yml)。

## VRM 模型约定

输入为自包含的 VRM 0／1：贴图和 buffer 必须在文件内，不接受 FBX、普通 GLB 或 Unity `.anim`。人形骨骼按 VRM Humanoid 映射识别，Blender 对象名称无需按英文重命名。必需映射为 `hips / spine / head` 及两侧 `UpperArm / LowerArm / Hand / UpperLeg / LowerLeg / Foot`；手指、肩、颈、胸、脚趾和眼骨可选。

眨眼需要有实际 morph 绑定的标准 Blink：VRM0 的 `blink` 或一对 `blink_l / blink_r`，VRM1 的 `blink` 或一对 `blinkLeft / blinkRight`。仅重命名形态键不够；形态键自身名称可自定。眼球跟随需要正确配置 VRM lookAt（眼骨或视线表达）；头部跟随有角度限制。

程序仅自带 `StarLiteIdle`，为无动作模型提供基础站姿和轻呼吸。有自己的 `Idle` 时优先使用；其他动作均由用户提供。模型内嵌 glTF 动作自动列出；名字建议为唯一英文，区分大小写，`StarLiteIdle` 为保留名。

## Hexo：直接放入 VRM

`backend: vrm`、`model: ./models/avatar.vrm` 指向博客根目录内的普通文件，插件检查后生成哈希资源；无需自定义 ZIP 或 manifest。模型应放在 `source/` 外。

博客在加载期间及失败时隐藏角色，不展示静态替代图片，也不拦截下层页面点击。加载、运行时渲染或 WebGL 上下文失败后，分别等待 2、5、15 秒，最多后台重试三次；成功后自动恢复。重试沿用页面空闲调度，离线或页面隐藏时暂停，恢复联网／显示后继续；手机默认不重试。次数在当前文档中共用，不因 PJAX、切换可见性或恢复联网而重置，耗尽后保持隐藏，刷新页面可重新尝试。同一标签页已完成首次入场时，重试不会再次入场。

`fallback` 仍属于底层播放器配置，独立使用运行时可显示自定义图片；Hexo 隐藏失败状态，不显示该图片。

公开生成需要 `publication.confirm: true` 和 `publication.allowRedistribution: true`，表示已核实模型、贴图、内嵌动作的托管权。源码哈希自动绑定；可选 `publication.sourceSha256` 固定已审阅文件，变化时拒绝生成。这些开关不是许可证或技术防提取措施。

| 配置 | 含义与默认值 |
| --- | --- |
| `display.width / height` | CSS 画布尺寸；VRM 默认 320 × 480。 |
| `render.fps` | 默认 30，可选 60；`display` 跟随刷新率，GPU 成本可能增加。 |
| `render.maxDevicePixelRatio` | 默认 1.5，范围 1–1.5；博客可先用 1，保持抗锯齿。 |
| `camera` | `yawDegrees`、`pitchDegrees`、`fovDegrees`、`targetHeight`。 |
| `gaze` | 默认最大水平 25°、垂直 15°，平滑 100 ms；动作接管视线时暂停光标覆盖。 |
| `mobile` | 默认 `show: false`、`breakpoint: 768`，在运行时导入前判断。 |
| `interactions.pointer` | 光标跟随，默认开启。 |
| `interactions.passThrough` | 博客建议 true，让下层页面同时处理点击。 |
| `interactions.drag` | 穿透时必须 false。 |
| `ambient.animations` | 最多一个基础循环；省略时使用模型 Idle 或程序默认 Idle，显式空数组停用循环。 |
| `neutralAnimation` | 停止动作后采用该动作首帧的基础站姿。 |
| `profile` | 可选数据型微光适配；标准 VRM 无需配置。也可嵌入 `extras.starlite.profile`。 |

大幅动作可用 `render.viewportPadding: {left, top, right, bottom}`（CSS px）保留固定余量，四项均须填写；不随动作动态改变画布大小。位置可放入站点原有 CSS：

```css
[data-starlite-widget-host],
[data-starlite-widget-host].model-vrm-widget {
  right: 48px;
  bottom: 32px;
}
```

## 动作和气泡

基础 `Idle` 循环不触发句子。`dialogue.enter` 为首次入场，`dialogue.idle` 为偶发互动，`dialogue.click` 为点击回应。只要文字、不播放动作时：

```yaml
dialogue:
  click:
    lines: ["你好。", "我在这里。"]
    durationMs: 7200
```

有动作时再加 `animation: Wave`；多个候选使用 `animations: [Wave, Nod]`。用 `linesByAnimation` 将每个动作绑定多句文字，键必须完整覆盖动作池，不含池外名称；普通 `lines` 则为共用句库。先选动作，再选对应句子。动作必须在内嵌目录或外部动作清单中存在。

VRM 点击不会打断已有前景动作；首次入场在同一标签页仅触发一次。时间单位为毫秒，默认气泡持续 4000 ms，长文可增加 `durationMs`。文字以纯文本显示，两个后端共用 core 的气泡与调度。作者自己的 `dialogue.json`（例如 scene 列表）不是此公共配置格式，须先转换。

## 外部动作与高级资源目录

外部 VRMA 可放在博客 `source/motions/`，并配置 `animations: [{name: Wave, url: motions/Wave.vrma}]`。也可使用 [prepare-vrm.cjs](examples/prepare-vrm.cjs) 将模型、外部动作和 profile 准备为有哈希清单的目录，再填写 `bundle`；这是高级构建输入，不是用户导入所需的自定义分发包。配置 bundle 后以清单中的外部动作列表为准。

底层准备工具上限：模型 64 MiB、单个 VRMA 16 MiB、动作总量 64 MiB、最多 64 个，profile 1 MiB。Hexo 公开本地资源另限制模型 10 MiB。工具只检查与复制，不自动缩图、减面或转换动作。配置的外部动作在 ready 前准备好，尚未按需加载。

远程 URL 模式使用 `model: https://...`、`fallback` 和可选动作 URL，须满足 CORS；没有本地资源的构建哈希校验。发布建议使用本地 VRM 或高级清单目录。

## 直接使用 VRM 运行时

```ts
import { mountModelWidget } from "@starcried/starlite-vrm";
import "@starcried/starlite-vrm/widget.css";

const controller = await mountModelWidget(element, {
  backend: "vrm",
  model: "/assets/avatar.vrm",
  fallback: "/assets/avatar.png",
  interactions: { pointer: true },
  dialogue: { click: { lines: ["你好。"] } },
});
controller.pause();
controller.resume();
controller.resetCamera();
controller.destroy();
```

底层调用引用内嵌动作时，将 `inspectVrm(bytes).animations` 的名称放进 `embeddedAnimations`；Hexo 对本地模型会自动完成。隐藏／暂停时停止动画和物理，恢复不补算离线时长。PJAX 保留实例，完整文档导航重新挂载。

静态 import 会下载运行时代码；独立网页如要手机零运行时请求，应先判断屏宽再动态 import。Hexo 已内置该判断。

## Inochi2D 专用配置与 CLI

以下参数轨道、官方 SDK 物理、`.inp/.inx` 准备与原生 CLI 只适用于 Inochi2D，名称按格式保留。

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
- `widget` is merged into the generated `starlite` Hexo config, but the
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

The blog must install compatible `hexo`, `hexo-starlite`, and `playwright`
packages. Chrome and Edge must be installed for Windows release gates.

Start the isolated local workflow with:

```sh
npx inochi2d-blog preview --config inochi2d-blog.config.json
```

The generated local-preview token is an internal, one-run capability. It is
accepted only when the same child process writes below `.inochi2d/preview`; it
cannot authorize a normal `public` directory and is not a publication
attestation.

## Inochi2D direct Hexo plugin

An already prepared local bundle can be configured without the deploy CLI:

```yaml
starlite:
  enable: true
  backend: inochi2d
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
`starlite.parameters` (direct Hexo) replace the inferred value for that
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

## Inochi2D model-authored motion and common scene behavior

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

Each scene plays its configured exact animation, or chooses one from its
optional `animations` pool. Use `linesByAnimation` to bind multiple possible
sentences to each selected animation; the animation is selected first, then a
sentence only from its own library. For example, both backends and Hexo accept:

```json
{
  "dialogue": {
    "click": {
      "animation": "Wave",
      "animations": ["Wave", "Nod"],
      "linesByAnimation": {
        "Wave": ["Hello!", "Good to see you."],
        "Nod": ["I'm listening.", "Go ahead."]
      }
    }
  }
}
```

The mapping must cover exactly the `animations` pool, or only `animation` when
no pool is supplied. Missing, unknown or extra keys and empty libraries reject
configuration; there is no shared-sentence fallback for an incomplete mapping.
Each library contains 1-128 sentences, each trimmed to 1-1024 UTF-8 bytes.
The existing `lines` library remains supported when `linesByAnimation` is absent.
When both are supplied, the complete per-animation mapping takes precedence.
Entry, click and occasional idle scenes all use this format; the background
ambient loop has no dialogue. A sentence appears above the dragged model (or
below it when the viewport has no room). The bubble is viewport-clamped, announced as
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

To disable the widget, set `starlite.enable: false` and regenerate. No
theme or `node_modules` file is patched.

## Click-through blog interaction

Set `interactions.passThrough: true` to let the page beneath the model receive
its original pointer and click events while an in-bounds click still triggers
the model's configured response. The host, canvas and fallback opt out of CSS
hit testing; no replacement page click is synthesized or canceled. Pointer
travel over 5 CSS pixels, scrolling and canceled gestures do not trigger a
response. Modifier keys keep the underlying link's normal behavior.
Inochi2D disables its implicit drag default in this mode; explicitly enabling
both `passThrough` and `drag` rejects configuration. The default remains false.

## Inochi2D runtime API

```ts
const controller = await mountInochi2DWidget(element, config);
controller.pause();
controller.resume();
controller.setParameter("MouthOpen", 0.5);
controller.setParameter("Head:: Yaw-Pitch", [0.2, -0.1]);
controller.resetCamera();
controller.destroy();
```
