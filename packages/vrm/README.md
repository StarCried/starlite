# @starcried/starlite-vrm

简体中文 · [English](README.en.md)

StarLite 的 WebGL2 VRM 0／1 后端，支持模型内嵌 glTF 动作、外部 VRMA、限角光标跟随、眨眼和公共气泡。浏览器入口已打包 Three.js、three-vrm 和 three-vrm-animation。

在 Node.js 22.12+ 项目中安装 alpha 版本：

```sh
npm install @starcried/starlite-vrm
```

## 挂载

页面提供 `<div id="starlite"></div>`，在使用打包工具的网页项目中：

```js
import { mountModelWidget } from "@starcried/starlite-vrm";
import "@starcried/starlite-vrm/widget.css";

const host = document.querySelector("#starlite");
if (!host) throw new Error("Missing StarLite host");

const controller = await mountModelWidget(host, {
  backend: "vrm",
  model: "/model.vrm",
  fallback: "/portrait.png",
  dialogue: { click: { lines: ["你好。", "我在这里。"] } },
  interactions: { pointer: true },
  render: { fps: 30, maxDevicePixelRatio: 1.5 },
});
```

上例不需要另备动作文件。运行时自动使用模型名为 `Idle` 的动作，否则采用程序内置的 `StarLiteIdle`（基础站姿与轻呼吸）。可通过 `animations: [{name: "Wave", url: "/Wave.vrma"}]` 添加自己的外部动作，或用 `ambient` 和 `neutralAnimation` 指定基础循环与站姿。当前源码还提供 `StarLiteCuriousPeek`、`StarLiteHappyWave`、`StarLiteSleepyStartle` 三个通用人形动作，供所有模型按需映射；不附带模型素材，动作来源保留独立说明。显式 `ambient: {animations: []}` 可停用基础循环。眨眼为可选能力：需要有效的标准 Blink 表达，或完整的左右 Blink 表达；缺少时模型仍可使用，只停用自动眨眼。眼球跟随需要正确的 VRM lookAt 映射。模型必须自包含，不接受外部纹理或 buffer 引用。

`inspectVrm(bytes).animations` 返回模型内嵌动作的名称和时长；将名称列表传入 `embeddedAnimations`，即可在 `ambient`、点击与气泡配置中引用。实际加载后 `getAnimations()` 自动列出内嵌动作和外部 VRMA。未命名动作按顺序显示为 `Animation_1` 等；内嵌动作、外部动作名称不得重复，上述四个 `StarLite` 动作名均为保留名。角色配置也可放在模型 JSON 的 `extras.starlite.profile`，内容须符合数据型角色配置规范。

`pause()`／`resume()` 控制更新，`getAnimations()` 列出动作，`playAnimation()`／`stopAnimation()` 控制播放；页面组件卸载时调用 `controller.destroy()` 释放资源。`neutralAnimation` 的首帧作为停止后的基础站姿，避免无角色配置的模型回到 T 姿势。动作名区分大小写；循环在停止或被打断后结束等待。隐藏时停止动画和物理，恢复时不补算离线时间。

气泡可以独立使用，例如 `dialogue: {click: {lines: ["你好。"]}}`；需要动作时再添加 `animation` 或 `animations`。`linesByAnimation` 仍须完整对应动作池。

中键拖动角色身体可环绕检视；松开保留角度，短按中键平滑恢复默认镜头。水平可旋转 360°，俯仰限制在 ±80°；进入提示 3 秒后收起。检视暂时关闭头眼光标跟随，保留动画原有表情与视线，不改变播放、气泡和跟随偏好。`inspecting` 返回状态，`rotateInspection(dx, dy)` 接受 CSS 像素增量，`resetCamera()` 退出并恢复当前尺寸下的默认镜头。`setDisplaySize()` 保留检视角度。暂停模型时仍可旋转，但不推进动画与物理；页面隐藏或卸载时清理检视状态。宿主可监听 `model-camera-change` 重新读取气泡锚点，不需要改变窗口大小。

## 进阶

`adjustments` 为当前模型提供可选的姿态与跟随校准，例如：

```js
controller.setModelAdjustments({
  idle: { armLiftDegrees: 10, palmTwistDegrees: 5, wristLiftDegrees: 8, handCurl: 0.2, elbowBendDegrees: 8 },
  gaze: { headStrength: 0.8, eyeStrength: 1, smoothingMs: 120 },
});
```

相同对象也可作为挂载配置的 `adjustments`。该方法整体替换当前调节，`{}` 恢复原样；实时调节不重新加载模型、不重启动作。双臂抬高范围为 −30～45°，掌心扭转和手腕抬高均为 −45～45°，肘部弯曲为 −20～45°；掌心调节左右对称；手腕抬高在前臂弯曲平面调整手部方向，正值向上折，不移动腕部位置，不改变上臂、前臂或掌心扭转的方向约定。手部张合为 0～1，省略时保留原动作，0 张开、1 握拳，仅处理已映射的标准手指。姿态参数调整程序内置 `StarLiteIdle`；三个程序通用动作以当前选定 Idle 的基础站姿起止，因此会沿用调好的手臂、手腕和手部姿态。也可沿用模型自带 Idle 的站姿，但不会修改该 Idle。通用动作保留身体与上臂的相对运动；有动作的前臂和手指仅在进入、退出时平滑对齐基础姿态，挥手过程中保留原动作的肘部与手型，避免叠加校准后过度弯曲。模型自带动作和外部 VRMA 保持原样。头眼跟随强度各为 0～2，默认 1；0 停用对应跟随，仍尊重现有限角和前景动作方向。平滑时间为 20～1000 ms，省略时沿用 `gaze.smoothingMs`。模型缺少眼球绑定时，调节不能生成眼球跟随。

`adjustments.tailSway: {rootBone: "Tail", amplitudeDegrees: 35, periodSeconds: 10}` 为有尾骨的模型启用待机摆尾。只需指定唯一尾根原名；角度与周期可用 `setModelAdjustments` 实时调节。物理与碰撞由 VRM 自己配置，见[摆尾配置](../../docs/configuration.md#主动摆尾)。

`performance: {show: true}`（默认关闭）用于显示调试信息，也可用
`controller.setPerformanceVisible?.(true)` 即时切换。含义和测量边界见
[性能预算](https://github.com/StarCried/starlite/blob/main/docs/performance.md)。
Node 侧 `@starcried/starlite-vrm/inspect` 返回 `capabilities` 与逻辑 `metrics`；
`VrmInspectionError.code/details` 提供受控原因及缺失骨骼名，不回显模型路径或外部 URI。
见[兼容说明](https://github.com/StarCried/starlite/blob/main/docs/model-compatibility.md)。

[动作、句库、相机与性能配置](https://github.com/StarCried/starlite/blob/main/docs/configuration.md) · [构建博客资源](https://github.com/StarCried/starlite/blob/main/docs/examples/prepare-vrm.cjs) · [Hexo 插件](https://github.com/StarCried/starlite/blob/main/packages/hexo/README.md) · [开发与验证](https://github.com/StarCried/starlite/blob/main/docs/development.md)

配置 CSP 的网站须为模型内嵌贴图允许适用的 `img-src blob:` 和 `connect-src blob:`。独立网页若要在手机上避免加载运行时，须在检查屏宽后动态导入；上例的静态导入会下载 JS。

BSD-2-Clause；模型和动作由使用者按各自许可提供，微光适配为可选配置。

### 环境光

可选 `environmentLighting: { color: "#b7cfff", strength: 1 }` 给现有灯光加入环境色；颜色使用六位 RGB，强度范围为 0–2，默认 1（100%）。0–100% 为普通调节范围，100–200% 进一步增强染色和明暗反应。程序会将一部分侧向主光能量分配到环境光；主光仍为白色，不修改模型材质和贴图，也不增加灯光数量。

默认根据颜色亮度调整总光照：在 100% 强度下，黑色目标为 80%、中灰约 100%、白色 110%。可用 `brightness: 0.95` 显式指定 0.8–1.1 内的目标。强度同时控制颜色与亮度：降低到 20% 时有效光照倍率约为 90.24%–104.88%；提高到 200% 时明暗范围扩大到 60%–120%。这是灯光倍率，不保证所有材质的屏幕像素亮度按同一比例变化。色相经过亮度归一化，避免暗色重复降低亮度；近黑色取色噪声会被抑制。

运行中调用 `controller.setEnvironmentLighting(...)` 同步平滑改变颜色与光强，传 `null` 或强度设为 0 恢复原灯光。暂停时只重绘静止画面，不推进动作。不配置此选项时保持原灯光；运行时不读取屏幕，颜色来源由宿主提供。
