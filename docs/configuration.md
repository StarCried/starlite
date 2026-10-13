# StarLite 配置

优先阅读 [Hexo 安装说明](release-guide.md)，并使用 [完整 YAML 示例](examples/hexo-vrm.yml)和[资源准备脚本](examples/prepare-vrm.cjs)。本页记录当前候选的真实配置；默认 Idle、无动作自动放松姿态和独立气泡仍是下一阶段目标。

## VRM 模型约定

当前输入为自包含的 VRM 0／1，动作采用外部 VRMA 1.0；不接受 FBX、普通 GLB 或带外部纹理／buffer 引用的模型。模型应有标准人形骨骼；眨眼需要有效的标准 Blink 表达，眼球跟随需要正确的 VRM lookAt 映射。仅有名字相似的自定义形态键不保证会被自动识别。

目标发布约定是「人形骨骼 + 可用眨眼」即可入门，其他动作可选。当前无动作资源包可以准备和预览，但会保留模型原始姿态；完整博客互动和 DSH 的 Idle 映射仍需用户动作。

## Hexo VRM 配置入口

唯一入口为 `starlite:`，显式填写 `backend: vrm`。未指定 backend 时仍选择 Inochi2D，这是本轮保留的现有行为。不要保留旧的 `inochi2d_widget:` 配置块。

本地 `bundle` 包含 `manifest.json`；插件读取其中的模型、动作和可选 profile，核对大小和 SHA-256，并生成哈希路由。此时不要另写重复的 `model`／`animations` 列表。静态 fallback 位于博客 `source` 下。

`publication.confirm`、`publication.allowRedistribution` 与清单的分发标记都必须为 true，`publication.sourceSha256` 必须匹配 `manifest.model.sourceSha256`。它们是操作者的确认，不是许可证明。新示例默认关闭，填写完整后再开启。

直接远程 URL 模式使用 `model`、`fallback`、`animations: [{name, url}]`；资源服务须满足 CORS。此模式不提供本地清单的逐项构建校验，推荐发布时使用本地 bundle。模型、动作和贴图的托管权仍由使用者负责。

| 配置 | 当前含义与默认值 |
| --- | --- |
| `display.width / height` | CSS 画布尺寸；VRM 运行时默认 320 × 480。 |
| `render.fps` | 默认 30，可选 60；`display` 跟随刷新率，GPU 成本可能显著增加。 |
| `render.maxDevicePixelRatio` | 默认 1.5，范围 1–1.5；博客可先用 1，抗锯齿保持现有开启行为。 |
| `camera` | `yawDegrees`、`pitchDegrees`、`fovDegrees`、`targetHeight`；依据模型实际构图调整。 |
| `gaze` | 最大水平 25°、垂直 15°，平滑 100 ms；动画接管视线时不叠加鼠标覆盖。 |
| `mobile` | 默认 `show: false`、`breakpoint: 768`；Hexo 在运行时导入之前判断。 |
| `interactions.pointer` | 光标跟随，默认开启；效果取决于模型人形／lookAt 配置。 |
| `interactions.passThrough` | 默认 false；博客推荐 true，保留下层页面原生点击。 |
| `interactions.drag` | 穿透时必须 false；两者同时开启会报错。 |
| `ambient.animations` | VRM 最多一个基础循环，名称必须存在；没有配置就不播放循环。 |
| `profile` | 可选数据配置，目前仅支持微光适配类型；普通 VRM 省略。 |

大幅动作可用 `render.viewportPadding: {left, top, right, bottom}`（CSS px）提供固定画布余量，四项都须填写。不借由动作动态改变窗口尺寸；需逐一检查动作边界。

默认宿主在右下角。位置用自己的站点 CSS 调整，例如：

```css
[data-starlite-widget-host],
[data-starlite-widget-host].model-vrm-widget {
  right: 48px;
  bottom: 32px;
}
```

加入博客原有 CSS 引入流程，不改主题或 node_modules。位置、余量和画布大小应一起验收，不能保证任意摔倒动作都不裁切。

## 动作与句子

资源准备时的 `name` 是稳定英文动作标识，区分大小写。网页显示名称不改变 VRMA 内骨骼映射。加载器目前不会把内嵌 glTF 动作自动列入目录；配置的全部 VRMA 在 ready 前下载并完成重定向。

- `ambient.animations: [Idle]` 是基础循环，没有气泡，不触发偶发句子。
- `dialogue.enter` 是首次入场。
- `dialogue.idle` 是定时偶发小动作，与基础 Idle 循环不同。
- `dialogue.click` 是点击回应；VRM 只在没有前景动作时接受，不中断正在播放的入场／偶发动作。

每个场景仍须提供有效 `animation`；可加 `animations` 随机池，再通过 `linesByAnimation` 给每个动作绑定多句文字。先抽动作，再从它自己的语句库抽句子。映射必须完整覆盖池，不能缺项或多项；若没有映射，可用共同的 `lines`。详见 YAML 示例。不要把独立作者的 `dialogue.json`（如含 `scene` 列表）直接当作公共运行时配置；需要先转成上述结构。

时间单位为毫秒。气泡文字按纯文本呈现；入场、点击与偶发场景默认展示 4000 ms。可为长句增大 `durationMs`；示例为 7200 ms。所有公共气泡样式、逐动作句库和调度归 `core`；当前公共场景配置尚不能不带动作。

## 资源限制

`@starcried/starlite-vrm/prepare` 的模型上限 64 MiB，单个 VRMA 16 MiB，动作总量 64 MiB、最多 64 个，profile 1 MiB。Hexo 的本地发布路径另要求模型不超过 8 MiB。工具只检查、复制并生成清单，不压缩贴图或减面；输出目录必须不存在。

VRM 的骨骼、表情、相机和视线不使用下方 Inochi2D 参数映射。暂停／隐藏时停止动画和物理；恢复时不补算长时间离线物理。完整文档导航会重新挂载，PJAX 保持一个实例；首入状态在同一标签页保留。

## 直接使用 VRM 运行时

```ts
import { mountModelWidget } from "@starcried/starlite-vrm";
import "@starcried/starlite-vrm/widget.css";

const controller = await mountModelWidget(element, {
  backend: "vrm",
  model: "/assets/avatar.vrm",
  fallback: "/assets/avatar.png",
  // 不提供动作可以预览原始姿态；尚不自动获得通用 Idle／呼吸。
  interactions: { pointer: true },
});
controller.pause();
controller.resume();
controller.resetCamera();
controller.destroy();
```

静态 import 会下载运行时代码；只有 Hexo 的导入前 mobile guard 能保证手机不下载该代码。独立网页也要零运行时请求时，应在判断屏宽之后再动态 import。

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
inochi2d-blog preview --config inochi2d-blog.config.json
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
