# @starcried/starlite-vrm

StarLite 的 WebGL2 VRM 0／1 后端，支持模型内嵌 glTF 动作、外部 VRMA、限角光标跟随、眨眼和公共气泡。浏览器入口已打包 Three.js、three-vrm 和 three-vrm-animation。

在 Node.js 22.12+ 项目中安装 alpha 版本：

```sh
npm install @starcried/starlite-vrm@alpha
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

上例不需要另备动作文件。运行时自动使用模型名为 `Idle` 的动作，否则采用程序唯一内置的 `StarLiteIdle`（基础站姿与轻呼吸）。可通过 `animations: [{name: "Wave", url: "/Wave.vrma"}]` 添加自己的外部动作，或用 `ambient` 和 `neutralAnimation` 指定基础循环与站姿。不附带模型或其他动作库。显式 `ambient: {animations: []}` 可停用基础循环。眨眼需要有效的标准 Blink 表达，眼球跟随需要正确的 VRM lookAt 映射。模型必须自包含，不接受外部纹理或 buffer 引用。

`inspectVrm(bytes).animations` 返回模型内嵌动作的名称和时长；将名称列表传入 `embeddedAnimations`，即可在 `ambient`、点击与气泡配置中引用。实际加载后 `getAnimations()` 自动列出内嵌动作和外部 VRMA。未命名动作按顺序显示为 `Animation_1` 等；内嵌动作、外部动作名称不得重复，`StarLiteIdle` 为默认 Idle 保留名。角色配置也可放在模型 JSON 的 `extras.starlite.profile`，内容须符合数据型角色配置规范。

`pause()`／`resume()` 控制更新，`getAnimations()` 列出动作，`playAnimation()`／`stopAnimation()` 控制播放；页面组件卸载时调用 `controller.destroy()` 释放资源。`neutralAnimation` 的首帧作为停止后的基础站姿，避免无角色配置的模型回到 T 姿势。动作名区分大小写；循环在停止或被打断后结束等待。隐藏时停止动画和物理，恢复时不补算离线时间。

气泡可以独立使用，例如 `dialogue: {click: {lines: ["你好。"]}}`；需要动作时再添加 `animation` 或 `animations`。`linesByAnimation` 仍须完整对应动作池。

## 进阶

[动作、句库、相机与性能配置](https://github.com/StarCried/starlite/blob/main/docs/configuration.md) · [构建博客资源](https://github.com/StarCried/starlite/blob/main/docs/examples/prepare-vrm.cjs) · [Hexo 插件](https://github.com/StarCried/starlite/blob/main/packages/hexo/README.md) · [开发与验证](https://github.com/StarCried/starlite/blob/main/docs/development.md)

配置 CSP 的网站须为模型内嵌贴图允许适用的 `img-src blob:` 和 `connect-src blob:`。独立网页若要在手机上避免加载运行时，须在检查屏宽后动态导入；上例的静态导入会下载 JS。

BSD-2-Clause；模型和动作由使用者按各自许可提供，微光适配为可选配置。
