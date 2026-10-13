# @starcried/starlite-vrm

StarLite 的 WebGL2 VRM 0／1 后端，支持外部 VRMA 动作、限角光标跟随、眨眼和公共气泡。浏览器入口已打包 Three.js、three-vrm 和 three-vrm-animation。

当前是尚未发布到 npm 的 alpha 候选。[候选安装说明](https://github.com/StarCried/starlite/blob/feat/dual-model-backends/docs/release-guide.md)

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
  animations: [{ name: "Idle", url: "/Idle.vrma" }],
  ambient: { animations: ["Idle"] },
  interactions: { pointer: true },
  render: { fps: 30, maxDevicePixelRatio: 1.5 },
});
```

`Idle.vrma` 由使用者提供；程序不附带通用站姿或呼吸。省略 `animations` 和 `ambient` 可以预览模型原始姿态。眨眼需要模型具有有效的标准 Blink 表达，眼球跟随需要正确的 VRM lookAt 映射。模型必须自包含，不接受外部纹理或 buffer 引用。

`pause()`／`resume()` 控制更新，`getAnimations()` 列出动作，`playAnimation()`／`stopAnimation()` 控制播放；页面组件卸载时调用 `controller.destroy()` 释放资源。动作名区分大小写；循环在停止或被打断后结束等待。隐藏时停止动画和物理，恢复时不补算离线时间。

## 进阶

[动作、句库、相机与性能配置](https://github.com/StarCried/starlite/blob/feat/dual-model-backends/docs/configuration.md) · [准备资源包](https://github.com/StarCried/starlite/blob/feat/dual-model-backends/docs/examples/prepare-vrm.cjs) · [Hexo 插件](https://github.com/StarCried/starlite/blob/feat/dual-model-backends/packages/hexo/README.md) · [开发与验证](https://github.com/StarCried/starlite/blob/feat/dual-model-backends/docs/development.md)

配置 CSP 的网站须为模型内嵌贴图允许适用的 `img-src blob:` 和 `connect-src blob:`。独立网页若要在手机上避免加载运行时，须在检查屏宽后动态导入；上例的静态导入会下载 JS。

BSD-2-Clause；模型和动作由使用者按各自许可提供，微光适配为可选配置。
