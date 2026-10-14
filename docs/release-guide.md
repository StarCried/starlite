# StarLite for Hexo：安装与使用

本指南适用于已发布的 [0.1.0-alpha.1](https://github.com/StarCried/starlite/releases/tag/v0.1.0-alpha.1)。普通启动步骤见 [Hexo README](../packages/hexo/README.md)；本页补充安装、更新和本地验收。

## 安装

需要 Node.js 22.12+、正常工作的 Hexo 7 博客，以及支持 WebGL2 的桌面 Chrome／Edge。Hexo 8 尚待单独验收，用户无需 Rust 或 Blender。

安装 alpha 版本：

```sh
npm install hexo-starlite@alpha
```

如需固定版本，使用 `npm install --save-exact hexo-starlite@0.1.0-alpha.1`。alpha 使用独立发布标签，安装和更新时均显式写 `@alpha` 或完整版本号。

插件自动加载，浏览器只请求选中的后端。安装依赖目前包含两个后端；VRM 用户不需要原生 Inochi2D 工具。不要同时安装旧的 `hexo-model-companion`；旧的 `inochi2d_widget:` 配置须改为 `starlite:`。

## 添加模型

把一个自包含的 VRM 0／1 放在博客根目录的 `models/avatar.vrm`。此目录放在 `source/` 外，避免 Hexo 直接复制源文件；插件会检查模型并生成带内容哈希的资源路由。

```yaml
starlite:
  enable: true
  backend: vrm
  model: ./models/avatar.vrm
  publication:
    confirm: true
    allowRedistribution: true
```

两项 `publication` 确认适用于模型、贴图和内嵌动作的博客托管权；内嵌许可仍须遵守。来源 SHA-256 由实际文件自动计算，也可显式填写 `publication.sourceSha256` 来固定已审阅版本，文件变化时会拒绝生成。模型公开生成上限为 **10 MiB**，不会自动减面或压缩贴图。

无动作模型使用程序唯一内置的 `StarLiteIdle`。有名为 `Idle` 的模型动作时优先作为基础循环；其他内嵌动作自动识别，按需配置点击或应用映射。缺少动作也可单独配置气泡。标准人形骨骼、Blink 和 lookAt 约定见[配置](configuration.md)。

静态占位图自动提供。可选 `fallback: images/avatar.png` 使用自己的图片，图片放在 `source/images/avatar.png`。

微光模型从[独立模型发行](https://github.com/StarCried/starlite/releases/tag/weiguang-v3.0.0-starlite.1)下载；博客选择 `Weiguang-StarLite-Blog.vrm`，放到上面的模型路径并遵守随附许可。博客模型保留全部 13 个内嵌动作，约 8.69 MiB；桌面版可能更大。模型源工程、其他软件导出和自定义 ZIP 均不是此安装流程的输入。

## 本地验收

```sh
npx hexo clean
npx hexo generate
npx hexo server -p 4000
```

检查正文优先显示、材质与基础站姿正常、眼睛与头部跟随、点击气泡及所选动作、偶发互动、页面切换无重复实例。手机尺寸不应下载模型或 VRM 运行时；模拟加载失败时应出现静态图。较大动作还须检查画布与页面底部裁切。

博客建议 `interactions.passThrough: true`、`drag: false`，保留角色下方页面的点击行为。默认 30 FPS，DPR 上限 1.5；博客可先用 DPR 1，保持抗锯齿，再按设备验收。

PJAX 保留实例，完整文档导航重新挂载但同一标签页不重复首次入场。CSP 需允许内嵌贴图使用的 `blob:`。公开博客会把必要模型文件交给访客；许可约束再利用，无法保证文件不能被下载。

本地通过后再走自己的 Hexo 部署流程。插件不会自动部署，也不需要 API key。

## 更新、停用与卸载

更新插件时执行 `npm install hexo-starlite@alpha`，再本地生成并检查。更新模型时替换本地 VRM，复核许可和动作名后重新生成；若固定了 `sourceSha256`，先审阅新文件再更新哈希。动作、文案和相机见[完整配置](configuration.md)。

停用：设 `starlite.enable: false` 并重新生成。卸载：

```sh
npm uninstall hexo-starlite
```

删除不再使用的 `starlite` 配置和模型文件，执行 `hexo clean` 后重新生成；确认部署目录没有遗留模型路由。不要删除其他功能仍使用的图片。
