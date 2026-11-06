# StarLite 配置

简体中文 · [English](configuration.en.md)

普通启动见 [Hexo README](../packages/hexo/README.md)，可直接复制[完整 YAML 示例](examples/hexo-vrm.yml)。

## 界面与默认句库语言

插件跟随 Hexo 顶层 `language`（列表取第一项），中文标签使用中文，其他非空标签使用英文，未设置时保留中文。也可显式设置 `starlite.locale: en` 或 `zh-CN`。语言只影响菜单、提示与示例句库；用户自定义句子、文章内容、模型元数据和动作名称保持原样。更改后重新生成博客。

## 默认微光与自定义

### 选择示例模型

初始选择保持微光；也可以选择独立授权的蓝色大肥鱼：

```yaml
starlite:
  preset: bluefish  # weiguang / bluefish
```

只获取所选示例。蓝色大肥鱼由水原镜（Mzkagami）制作，使用内置基础 Idle、眨眼、限角头眼跟随及独立句库，不继承微光的事件动作和自述。选择示例不代表可以任意再分发；请阅读[蓝色大肥鱼模型条款](bluefish-license.md)，保留署名，并遵守非商业使用与必要博客托管的范围。代码 BSD-2-Clause 不适用于模型素材。

此选项从 `0.1.0` 起提供。蓝鱼资源从[独立模型发行](https://github.com/StarCried/starlite/releases/tag/bluefish-v1.0.0-starlite.1)自动获取并校验，使用程序自带的好奇探头、开心招手和困倦惊醒；只下载所选示例，已缓存时可离线生成。

指定 `model` 或 `bundle` 时，以自定义模型为准，不获取任一示例或混入示例句库；`enable: false` 不获取模型。未知 `preset` 会报配置错误，不会悄悄换成微光。更换预设后重新生成博客。

### 微光的初始体验

`0.1.0-alpha.3` 起，不写 `starlite` 即默认启用微光；只填写局部配置也保留默认预设。不需要下载模型或生成看板娘资源时，设置 `starlite.enable: false`。提供 `model` 或 `bundle` 则使用自己的模型，不获取微光，也不继承微光专属的动作、句库、镜头和显示预设。以 `.vrm` 结尾的模型路径可省略 `backend: vrm`；自定义本地资源仍需 `publication.confirm: true` 与 `publication.allowRedistribution: true`。

默认预设与当前演示博客一致：13 个动作，点击池 8 个、偶发池 7 个，首次入场一次；基础 Idle 不触发句子。画布 260 × 390、60 FPS、DPR 1，光标跟随限角，点击穿透；屏宽小于 900 px 时隐藏，位置为右侧 112 px、底部 160 px。句库原样保留作者博客的个人叙述与页面引用，接入其他博客时可按需替换。

例如只改性能、位置和点击句子，其他预设保持不变：

```yaml
starlite:
  render:
    fps: 30
  position:
    right: 48
    bottom: 32
  dialogue:
    click:
      lines: ["你好，欢迎来坐坐。", "慢慢看，我在这里。"]
```

`lines` 替换该场景的逐动作句库，仍从原动作池随机选动作；`linesByAnimation` 可只覆盖要修改的默认动作，例如 `HighFive: ["击掌！"]`，其余默认动作的句子保留。显式更换 `animation` 或 `animations` 时，以新动作选择为准；更换为预设外动作时也需提供相应句子。数组整体替换，不按索引合并。

```yaml
starlite:
  dialogue:
    click:
      linesByAnimation:
        HighFive: ["击掌！", "做得好。"]
    enter: false  # 关闭首次入场气泡及其动作
    idle: false   # 关闭偶发气泡及其动作，基础 Idle 不受影响
```

`dialogue.click: false` 只关闭点击气泡，预设的 `interactions.click` 仍可播放动画；设置 `interactions.click: false` 可同时关闭默认点击动作和气泡。若已经显式配置 `dialogue.click`，也将其设为 `false`。光标跟随和页面点击穿透不受影响。

### 默认资源获取、缓存与许可

资源在首次 `hexo generate` 或 `hexo server` 的生成阶段获取；npm 安装时不下载模型，博客访客也不会直接向 GitHub 取模型。固定版本为 `weiguang-v3.0.0-starlite.1`，缓存位于博客根目录的 `node_modules/.cache/hexo-starlite/weiguang-v3.0.0-starlite.1/`。模型为 9,116,328 字节，SHA-256 为 `d98a431d84c015787a3239eaf709a7b3b075b4353c10ac59a3023f5ca4c05b8b`；模型、许可和来源文件均按固定长度与 SHA-256 校验，拒绝不安全缓存路径，不使用不匹配文件。

下载遵循生成进程的标准 `HTTP_PROXY`、`HTTPS_PROXY`、`NO_PROXY` 环境变量，无需在 `_config.yml` 填写代理或凭据。请勿将凭据写入博客配置、提交记录或反馈日志。

有效缓存可离线使用。缺少资源、下载超时或校验失败时，生成日志警告，本次不注入看板娘，正文继续生成；修复网络后再次生成会重试。不会把未知或损坏内容当成模型继续加载。自定义配置错误仍报错，不能用下载失败的跳过机制掩盖。浏览器开始加载后发生的失败另按下方有限重试规则处理。

微光不进入程序包，使用即同意[专属模型许可](weiguang-license.md)，不接受请停用。生成站点的模型资源目录附带 `LICENSE-Weiguang.md`、`ASSET-SOURCES.md`；请按许可在关于页等可见位置署名「微光角色及模型 © StarCried，依专属使用许可使用」。必要博客托管不等于允许模型提取再利用或再分发。

## VRM 模型约定

输入为自包含的 VRM 0／1：贴图和 buffer 必须在文件内，不接受 FBX、普通 GLB 或 Unity `.anim`。人形骨骼按 VRM Humanoid 映射识别，Blender 对象名称无需按英文重命名。必需映射为 `hips / spine / head` 及两侧 `UpperArm / LowerArm / Hand / UpperLeg / LowerLeg / Foot`；手指、肩、颈、胸、脚趾和眼骨可选。

眨眼为可选能力，缺少时仍可加载、播放动作和使用气泡，只停用自动眨眼。自动眨眼使用有实际 morph 绑定的标准 Blink：VRM0 的 `blink` 或一对 `blink_l / blink_r`，VRM1 的 `blink` 或一对 `blinkLeft / blinkRight`。仅重命名形态键不够；形态键自身名称可自定。只有单侧 Blink、空绑定或全部零权重时不自动眨眼，不会猜测其他形态键。已声明的错误绑定仍会拒绝导入。眼球跟随需要正确配置 VRM lookAt（眼骨或视线表达）；头部跟随有角度限制。

程序自带 `StarLiteIdle`，为无动作模型提供基础站姿和轻呼吸，并为所有标准人形 VRM 提供可选的 `StarLiteCuriousPeek`（好奇探头）、`StarLiteHappyWave`（开心招手）、`StarLiteSleepyStartle`（困倦惊醒）。三个动作仅供按需映射，不自动替用户分配事件；不包含蓝鱼模型或问号、汗滴装饰。有自己的 `Idle` 时优先使用。模型内嵌 glTF 动作自动列出；名字建议为唯一英文，区分大小写，上述四个 `StarLite` 动作名均为保留名。

## Hexo：直接放入 VRM

`model: ./models/avatar.vrm` 指向博客根目录内的普通文件，插件自动选择 VRM 后端，检查后生成哈希资源；无需自定义 ZIP 或 manifest。模型应放在 `source/` 外。此模式使用下表通用默认值，不继承默认微光预设。

博客在加载期间及失败时隐藏角色，不展示静态替代图片，也不拦截下层页面点击。加载、运行时渲染或 WebGL 上下文失败后，分别等待 2、5、15 秒，最多后台重试三次；成功后自动恢复。重试沿用页面空闲调度，离线或页面隐藏时暂停，恢复联网／显示后继续；手机默认不重试。次数在当前文档中共用，不因 PJAX、切换可见性或恢复联网而重置，耗尽后保持隐藏，刷新页面可重新尝试。同一标签页已完成首次入场时，重试不会再次入场。

`fallback` 仍属于底层播放器配置，独立使用运行时可显示自定义图片；Hexo 隐藏失败状态，不显示该图片。

公开生成需要 `publication.confirm: true` 和 `publication.allowRedistribution: true`，表示已核实模型、贴图、内嵌动作的托管权。源码哈希自动绑定；可选 `publication.sourceSha256` 固定已审阅文件，变化时拒绝生成。这些开关不是许可证或技术防提取措施。

| 配置 | 含义与默认值 |
| --- | --- |
| `display.width / height` | CSS 画布尺寸；VRM 默认 320 × 480。 |
| `render.fps` | 默认 30，可选 60；`display` 跟随刷新率，GPU 成本可能增加。 |
| `render.maxDevicePixelRatio` | 默认 1.5，范围 1–1.5；博客可先用 1，保持抗锯齿。 |
| `performance.show` | 默认 false；true 时在角色左下角显示实际 FPS、帧间隔 p95 与 CPU 侧帧耗时 p95，点击仍穿透。CPU 耗时包含模型更新和 WebGL 提交，不是 GPU 时间或 CPU 占用率。 |
| `camera` | `yawDegrees`、`pitchDegrees`、`fovDegrees`、`targetHeight`。 |
| `gaze` | 默认最大水平 25°、垂直 15°，平滑 100 ms；动作接管视线时暂停光标覆盖。 |
| `adjustments` | 按模型校准内置 Idle 的臂、手姿态，以及头眼跟随；省略时保持原表现，见下方说明。 |
| `mobile` | 默认 `show: false`、`breakpoint: 768`，在运行时导入前判断。 |
| `interactions.pointer` | 光标跟随，默认开启。 |
| `interactions.passThrough` | VRM Hexo 默认 true，透明区域和普通短点保留下层页面的原生点击；不会因开启身体拖动而改成 false。 |
| `interactions.drag` | VRM Hexo 默认 true，由 Hexo 处理身体拖动；设为 false 可禁用。传给底层渲染器的 drag 始终为 false。 |
| `ambient.animations` | 最多一个基础循环；省略时使用模型 Idle 或程序默认 Idle，显式空数组停用循环。 |
| `neutralAnimation` | 停止动作后采用该动作首帧的基础站姿；显式配置优先于角色 profile，随后才自动选择 Idle。 |
| `profile` | 可选数据型微光适配；标准 VRM 无需配置。也可嵌入 `extras.starlite.profile`；其中的 `neutralAnimation` 必须存在于模型或已配置 VRMA 中，也可用内置 `StarLiteIdle`。 |
| `position` | 仅 Hexo 定位：`right / bottom` 为 0–10000 的 CSS px，通用默认 16／0；`zIndex` 为非负整数，默认 20。默认微光改用 112／160。 |

大幅动作可用 `render.viewportPadding: {left, top, right, bottom}`（CSS px）保留固定余量，四项均须填写；不随动作动态改变画布大小。用 `starlite.position` 设置初始位置；保存的访客拖动位置优先，点「恢复默认位置」重新应用博客定位。Hexo 负责换算实际位置并为脚下快捷栏保留空间。

## 访客快捷操作与身体拖动

光标靠近 VRM 角色时，脚下显示「−／＋／气泡／暂时隐藏」快捷栏，移开后自动收起；也可用键盘聚焦按钮。缩放以脚下位置为锚点，快捷栏不会随模型大小或动作移动，便于连续点击。右键菜单保留帧率、跟随、暂停及「恢复默认大小／位置」等完整设置；Shift + 右键保留浏览器菜单。

默认 `passThrough: true` 时，透明区域和普通短点让页面接收原生事件，不补发合成点击。从身体的不透明像素按住鼠标左键，移动超过 6 CSS px 后才开始拖动；拖动结束不会触发角色点击响应或下层页面点击。表单控件、快捷栏和带修饰键的操作保持原用途。页面自己在 `pointerdown` 中执行的行为无法由后续拖动撤回。

已经开始的拖动可以经过嵌入的评论区，松手后恢复评论区交互。跨站 iframe 内的鼠标事件不会传给博客：若角色已经覆盖在这类区域上，请从未覆盖 iframe 的身体部分开始拖动；普通点击仍直接交给嵌入页面。

位置、大小、气泡等偏好只存于当前浏览器，不改博客配置；「恢复默认位置」清除访客拖动位置并按博客定位重新放置，「恢复默认大小」以 100% 为目标，仍受当前可视范围限制。较窄或较矮的窗口会先收小基础尺寸，放大上限也受当前锚点到可视边界的距离限制，保持角色和快捷栏可见。可视区域宽度小于 176 CSS px 或高度小于 75 CSS px 时，VRM 组件暂时卸载，窗口恢复后自动重新显示；即使开启 `mobile.show` 也保留这一下限。关闭气泡仍保留动作；「暂时隐藏」后点右下角「显示角色」恢复。

VRM Hexo 的身体拖动与页面穿透可同时开启；Hexo 始终关闭底层渲染器的拖动，由宿主区分短点和拖动。只关闭身体拖动可写：

```yaml
starlite:
  interactions:
    passThrough: true
    drag: false
```

## 模型姿态与跟随调节

在独立预览页调好后，将页面导出的配置合并到博客 `_config.yml` 的 `starlite` 下，再按原 Hexo 命令生成；访客右键菜单不会增加姿态编辑项。参数随当前模型配置保存，更换模型后应重新调整。

仓库完成依赖安装和构建后，在仓库根目录启动预览：

```sh
npm run start --workspace @starcried/starlite-vrm-example -- --model /path/to/avatar.vrm
```

打开终端显示的本地地址或 `/adjust`。可用 `--compare-model /path/to/another.vrm` 对照第二个模型；[完整预览说明](../examples/vrm/README.md)包含端口设置和动作检查。

```yaml
starlite:
  model: ./models/avatar.vrm
  publication:
    confirm: true
    allowRedistribution: true
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

所有字段均可省略；删除某项即恢复该项原表现，删除 `adjustments` 或设置 `adjustments: {}` 恢复全部原表现。无需重新制作、转换或覆盖 VRM。姿态参数校准程序内置的 `StarLiteIdle`，保留原有呼吸。三个程序通用动作 `StarLiteCuriousPeek`、`StarLiteHappyWave`、`StarLiteSleepyStartle` 从当前选用的基础 Idle 姿态起止；使用调后的 `StarLiteIdle` 时，也会衔接到调后的站姿。模型自带或外部导入的 Idle、挥手、坐下等动作保持原样。需要明确选用程序 Idle 时，可设置 `neutralAnimation: StarLiteIdle` 和 `ambient: {animations: [StarLiteIdle]}`。

| 字段（位于 `adjustments` 下） | 含义与范围 |
| --- | --- |
| `idle.armLiftDegrees` | 双臂对称抬高／放低，−30° 至 45°；以角色身体正面定义方向，改变镜头不改变站姿。省略或 0 保持原角度。 |
| `idle.palmTwistDegrees` | 掌心对称内外扭转，−45° 至 45°；省略或 0 保持原角度。 |
| `idle.wristLiftDegrees` | 手腕对称抬高／放低，−45° 至 45°；只调整手腕，不抬起上臂或前臂。省略或 0 保持原角度。可与掌心朝向一起调整。 |
| `idle.handCurl` | 张合姿态：0 张开、1 握拳；省略时保留动作原手势。依据已映射的标准手指，缺失指骨不补造。 |
| `idle.elbowBendDegrees` | 肘部弯曲修正，−20° 至 45°；省略或 0 保持原角度。 |
| `gaze.headStrength` | 转头跟随强度，0–2，默认 1 保留当前响应；0 停止头部的光标响应。 |
| `gaze.eyeStrength` | 眼球跟随强度，0–2，默认 1；0 停止眼球的光标响应。需要模型已有有效的 VRM LookAt。 |
| `gaze.smoothingMs` | 跟随平滑时间，20–1000 ms；越小越快。省略时沿用 `starlite.gaze.smoothingMs`，其默认值为 100 ms。 |

灵敏度影响转动幅度，平滑时间影响跟随速度；现有水平／垂直限角仍生效。前景动作接管头眼时暂停光标覆盖。没有有效眼骨或视线表情的模型只能转头，调高强度不会增加眼球能力。滑条也无法修复错误蒙皮或不规范绑定；一期不提供腿间距或任意骨骼编辑。

## 动作和气泡

普通用户在 `_config.yml` 的 `starlite.dialogue` 下修改句子，不需要单独的 `dialogue.json`。基础 `Idle` 循环不触发句子。`dialogue.enter` 为首次入场，`dialogue.idle` 为偶发互动，`dialogue.click` 为点击回应。自定义模型只要文字、不播放动作时：

```yaml
dialogue:
  click:
    lines: ["你好。", "我在这里。"]
    durationMs: 7200
```

有动作时再加 `animation: Wave`；多个候选使用 `animations: [Wave, Nod]`。用 `linesByAnimation` 将每个动作绑定多句文字，键必须完整覆盖动作池，不含池外名称；普通 `lines` 则为共用句库。先选动作，再选对应句子。动作必须在内嵌目录或外部动作清单中存在。

VRM 点击不会打断已有前景动作；首次入场在同一标签页仅触发一次。时间单位为毫秒，默认气泡持续 4000 ms，长文可增加 `durationMs`。文字以纯文本显示，两个后端共用 core 的气泡与调度。作者自己的 `dialogue.json`（例如 scene 列表）不是此公共配置格式，须先转换。

### 页面专属句子

全站句库仍写在 `_config.yml`；某篇文章或独立页面的句子可以直接写在对应 Markdown 开头的 front matter 中：

```yaml
---
title: 关于我
starlite:
  - "欢迎来到我的小窝。"
  - "这里记录着一些日常。"
---
正文……
```

需要覆盖选项时，改用 `lines` 对象形式；两种写法不能同时使用。YAML 的 `-` 后必须有空格：

```yaml
starlite:
  lines:
    - "见到你很开心。"
    - "要击个掌吗？"
  animation: HighFive
  triggers: [click, idle]
  mode: replace
  order: sequential
```

`animation` 必须是当前模型已有动作的完整名称，区分大小写。上例 `HighFive` 属于默认微光；使用其他模型时选择该模型自己的动作。每页的句子共用所选动作。

默认选项可在博客 `_config.yml` 的 `starlite.pageDialogue` 中调整，不必逐篇填写：

```yaml
starlite:
  pageDialogue:
    animation: HighFive
    triggers: [click, idle]
    mode: replace
    order: sequential
```

优先级为「文章选项 → 全站 `pageDialogue` → 内置默认值」。未写 `starlite` 的页面仍使用全站句库，不受 `pageDialogue` 影响。

| 选项 | 内置默认值与含义 |
| --- | --- |
| `animation` | 沿用全站 `dialogue.enter` 的动作；若入场是动作池，使用第一项。没有入场动作则只显示文字。它只是点击／偶发时使用的动作，不会因切换页面重播入场。 |
| `triggers` | `[click, idle]`，允许点击和偶发触发；可只写其中一种。`idle` 指偶发互动，不是基础站姿或呼吸。 |
| `mode` | `replace`，仅覆盖所选触发方式的全站句库；`merge` 将页面句子放在前面，再加入对应全站候选，并保留全站原有的动作与句子绑定。入场和基础 Idle 不受影响。 |
| `order` | `sequential`，每次有效触发取下一句，末句后回到第一句；点击和偶发共用进度。`random` 每次从当前触发方式的候选中随机选择。 |

进入新页面时重新从第一句开始；同页句库未变时，重复的 PJAX 事件、窗口缩放、查询参数或锚点变化不重置进度。没有页面句库的页面恢复全站句库；PJAX 切换不重载模型。合并模式按当前触发方式筛选候选，顺序模式依然共用进度。

偶发间隔沿用全站 `dialogue.idle` 的配置；全站未开启该场景时，页面偶发使用 30–60 秒的随机间隔。气泡持续时间沿用对应全站场景，未配置时为 4000 ms。关闭「显示气泡」仍触发动画并推进句子；暂停动画或隐藏页面时不消耗句子。页面可独立启用全站已关闭的点击／偶发场景；停用整个组件和移动端隐藏规则仍优先。

`lines` 必须包含 1–128 条非空句子，每条去除两端空白后最多 1024 个 UTF-8 字节。只显示纯文本，不解析 Markdown 或 HTML。未知选项、错误类型或不存在的动作会在生成时给出带来源的错误；正文和句子仍由原来的 Markdown 文件维护，不另建 `dialogue.json`。

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

## Direct runtime click-through interaction

When using the rendering packages directly, set `interactions.passThrough: true` to let the page beneath the model receive
its original pointer and click events while an in-bounds click still triggers
the model's configured response. The host, canvas and fallback opt out of CSS
hit testing; no replacement page click is synthesized or canceled. Pointer
travel over 6 CSS pixels, scrolling and canceled gestures do not trigger a
response. Modifier keys keep the underlying link's normal behavior.
Inochi2D disables its implicit drag default in this mode; explicitly enabling
both `passThrough` and `drag` rejects configuration. The default remains false.
VRM Hexo instead uses the host-managed body dragging described above: its
`interactions.drag` option can be true while the renderer's drag stays false.

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

## 环境补光颜色

VRM 可在 `_config.yml` 配置亮色与暗色模式的补光颜色与亮度。省略整个选项时保持原灯光，不读取页面或屏幕像素。

```yaml
starlite:
  environmentLighting:
    color: "#ffe6cc"      # 亮色模式；六位 RGB，YAML 中必须加引号
    darkColor: "#adc6ff"  # 可选；省略时两种模式都用 color
    strength: 1           # 0–2（0%–200%），默认 1（100%）；0 保留原灯光
    brightness: 1.0       # 可选；亮色模式亮度系数，0.8–1.1
    darkBrightness: 0.9   # 可选；暗色模式亮度系数，0.8–1.1
```

颜色只影响现有环境补光；主光保持白色。亮度系数调整这两盏现有灯的强度，并由 `strength` 混合：系数 `1` 不附加整体明暗调整，低于 `1` 变暗、高于 `1` 变亮；颜色适配仍可能重新平衡白色主光与彩色补光的强度。`strength: 0` 恢复原灯光。它不是屏幕像素亮度或曝光的保证，不同模型材质的响应可能不同。切换主题时平滑变化，不重新加载模型，也不改变当前动作。

每种模式省略自己的亮度系数时，运行时根据该模式的颜色自动计算有限的明暗变化，不继承另一模式的亮度系数。例如只设置 `darkBrightness` 时，亮色模式仍自动计算；未设置 `darkColor` 时，暗色模式沿用 `color`，但仍可有独立的 `darkBrightness`。删除对应亮度字段即可恢复该模式的自动计算。

`strength: 1` 为标准效果；`1–2` 继续线性放大适配幅度。亮度输入范围仍为 `0.8–1.1`：100% 强度时对应整体灯光亮度系数 `0.8–1.1`，200% 时可扩展至 `0.6–1.2`，效果更夸张。已有明确配置（例如 `strength: 0.2`）保持原值；只有省略强度时采用 100%。省略整个 `environmentLighting` 仍关闭此功能。

主题识别依次检查 `html`、`body` 的 `data-theme`、`data-color-mode`、`data-user-color-scheme`（值为 `dark` / `light`），以及 `dark` / `light`、`dark-mode` / `light-mode` 类；未明确指定时跟随系统 `prefers-color-scheme`。使用其他主题约定时，可让主题切换器同时设置 `document.documentElement.dataset.theme = "dark"` 或 `"light"`。仅配置 `color` 和可选 `strength` 时不监听主题变化；配置独立颜色或任一模式的亮度系数时才监听。此选项仅适用于 VRM。
