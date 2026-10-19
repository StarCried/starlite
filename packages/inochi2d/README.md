# @starcried/starlite-inochi2d

StarLite 的 Inochi2D WebGL2 后端，使用可复现构建的官方 D SDK，支持模型内动作、参数、物理和公共气泡。与 Inochi2D 官方项目无隶属关系。

在 Node.js 22.12+ 项目中安装 alpha 版本：

```sh
npm install @starcried/starlite-inochi2d@alpha
```

## 挂载

先用[模型准备流程](https://github.com/StarCried/starlite/blob/main/docs/configuration.md#inochi2d-专用配置与-cli)检查有权使用的 `.inp`／`.inx`。页面提供 `<div id="starlite"></div>`，在使用打包工具的网页项目中：

```js
import { mountInochi2DWidget } from "@starcried/starlite-inochi2d";
import "@starcried/starlite-inochi2d/widget.css";

const host = document.querySelector("#starlite");
if (!host) throw new Error("Missing StarLite host");
const response = await fetch("/models/manifest.json");
if (!response.ok) throw new Error("Cannot load model manifest");
const manifest = await response.json();
if (!manifest.animations) throw new Error("Model manifest has no animations");

const controller = await mountInochi2DWidget(host, {
  model: "/models/puppet.inp",
  fallback: "/models/puppet.png",
  animations: manifest.animations,
  render: { fps: 30, maxDevicePixelRatio: 1.25, autoFit: true },
});
```

动作使用模型中精确且区分大小写的名称；不会为未知模型生成点击动作。公共播放和生命周期接口与 VRM 相同，`setParameter()` 仍为 Inochi2D 专用能力。页面组件卸载时调用 `controller.destroy()` 释放资源。

宿主可通过 `QuickSettingsMenu` 复用公共快捷菜单。`setDisplaySize`、`setFrameRate`、`setPointerEnabled` 和 `setBubblesVisible` 可即时调整显示；隐藏气泡不会关闭绑定动作。

## 进阶

[参数、动作与句库配置](https://github.com/StarCried/starlite/blob/main/docs/configuration.md) · [Hexo 插件](https://github.com/StarCried/starlite/blob/main/packages/hexo/README.md) · [模型许可](https://github.com/StarCried/starlite/blob/main/docs/model-policy.md) · [安全说明](https://github.com/StarCried/starlite/blob/main/SECURITY.md)

Alpha 面向桌面 Chrome／Edge。独立网页若要在手机上避免加载运行时，须在检查屏宽后动态导入；上例的静态导入会下载 JS。跨域模型服务需允许 CORS。

BSD-2-Clause；不包含模型或第三方动作。
