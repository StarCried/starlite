# StarLite for Hexo：安装与使用

普通启动步骤见 [Hexo README](../packages/hexo/README.md)；本页区分下一版本地候选与已经公开的安装流程。

## 本地候选：默认微光，尚未发布

**自动获取微光属于本地候选，尚未发布；当前公开 `0.1.0-alpha.2` 仍按下方步骤配置模型。** 本地候选通过验收并发布后，用户只需在 Hexo 博客目录执行 `npm install hexo-starlite@alpha`、`npx hexo server`，不需要手工填写模型、动作或句库。

候选在第一次生成时自动获取独立授权的固定微光版本；保留演示博客的 13 个动作、点击／偶发句库、首次入场、镜头、60 FPS／DPR 1 及位置。屏宽小于 900 px 时不请求模型与运行时。安装 npm 包时不获取模型，没有后台服务、API key 或自动部署操作。

缓存位于博客根目录 `node_modules/.cache/hexo-starlite/weiguang-v3.0.0-starlite.1/`。每次生成校验固定长度与 SHA-256，有效缓存不需要联网；默认模型不随 npm 包分发。生成的模型目录同时提供 `LICENSE-Weiguang.md` 和 `ASSET-SOURCES.md`。使用即同意[微光许可](weiguang-license.md)，并需在关于页等可见位置保留署名。

下载遵循生成进程的 `HTTP_PROXY`、`HTTPS_PROXY` 与 `NO_PROXY` 环境变量；不需要额外配置博客代理，更不要将代理凭据写入配置或提交。

默认资源获取超时或校验失败时，日志警告，本次只生成正常博客，不注入看板娘；联网后重新生成会重试。浏览器端已开始加载后的故障则使用有限后台重试。两种情况均不展示静态替代图片、不影响正文操作。

所有自定义仍写在 `_config.yml`：

```yaml
starlite:
  render:
    fps: 30
  dialogue:
    click:
      lines: ["你好，欢迎来坐坐。"]
```

停用使用 `starlite.enable: false`，不会获取默认资源或生成看板娘路由。替换自己的模型仅需 `model` 与许可确认，以 `.vrm` 结尾的路径自动选择 VRM 后端；不继承微光专属动作或句库。完整覆盖规则、缓存校验和位置设置见[配置](configuration.md#默认微光与自定义)。

## 当前公开版 0.1.0-alpha.2

需要 Node.js 22.12+、正常工作的 Hexo 7 博客，以及支持 WebGL2 的桌面 Chrome／Edge。Hexo 8 尚待单独验收，用户无需 Rust 或 Blender。

安装 alpha 版本：

```sh
npm install hexo-starlite@alpha
```

如需固定版本，使用 `npm install --save-exact hexo-starlite@0.1.0-alpha.2`。alpha 使用独立发布标签，安装和更新时均显式写 `@alpha` 或完整版本号。

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

无动作模型使用程序唯一内置的 `StarLiteIdle`。有名为 `Idle` 的模型动作时优先作为基础循环；其他内嵌动作自动识别，按需配置点击或应用映射。缺少动作也可单独配置气泡。人形骨骼为必需，Blink 和 lookAt 为可选能力，约定见[配置](configuration.md)。

本版本在加载失败时隐藏角色并有限重试，成功后自动恢复，不展示静态替代图片；默认保留下层博客的点击行为。早期 `0.1.0-alpha.1` 不包含这些恢复与可选 Blink 调整，更新时请使用 `0.1.0-alpha.2` 或更新版本。

微光模型从[独立模型发行](https://github.com/StarCried/starlite/releases/tag/weiguang-v3.0.0-starlite.1)下载；博客选择 `Weiguang-StarLite-Blog.vrm`，放到上面的模型路径并遵守随附许可。博客模型保留全部 13 个内嵌动作，约 8.69 MiB；桌面版可能更大。模型源工程、其他软件导出和自定义 ZIP 均不是此安装流程的输入。

## 本地验收

```sh
npx hexo clean
npx hexo generate
npx hexo server -p 4000
```

检查正文优先显示、材质与基础站姿正常、已配置的眼睛与头部跟随、点击气泡及所选动作、偶发互动、页面切换无重复实例。手机尺寸不应下载模型或 VRM 运行时；模拟加载失败时应隐藏并自动恢复，下层页面始终可点击。较大动作还须检查画布与页面底部裁切。

自定义 VRM 博客默认 `interactions.passThrough: true`；显式开启拖动时默认为 false。可配置 `drag: false`，保留角色下方页面的点击行为。通用默认 30 FPS、DPR 上限 1.5、手机断点 768 px；本地候选的默认微光分别为 60 FPS、DPR 1、900 px。保持抗锯齿，再按设备验收。

PJAX 保留实例，完整文档导航重新挂载但同一标签页不重复首次入场。CSP 需允许内嵌贴图使用的 `blob:`。公开博客会把必要模型文件交给访客；许可约束再利用，无法保证文件不能被下载。

本地通过后再走自己的 Hexo 部署流程。插件不会自动部署，也不需要 API key。

## 更新、停用与卸载

更新插件时执行 `npm install hexo-starlite@alpha`，再本地生成并检查。当前公开包不会因此获得尚未发布的候选行为。默认微光的模型版本由插件固定，不会自动改用未知的最新资源；候选发布后按插件版本更新。自定义模型则替换本地 VRM，复核许可和动作名后重新生成；若固定了 `sourceSha256`，先审阅新文件再更新哈希。动作、文案和相机见[完整配置](configuration.md)。

停用：设 `starlite.enable: false` 并重新生成。卸载：

```sh
npm uninstall hexo-starlite
```

删除不再使用的 `starlite` 配置和模型文件；若使用过默认候选，也可删除上述专用缓存目录。执行 `hexo clean` 后重新生成，确认部署目录没有遗留模型或许可路由。不要删除其他功能仍使用的模型或图片。

## 维护者：npm 发布标签

`0.1.0-alpha.1` 首次发布时，虽使用 `--tag alpha`，npm 仍自动建立了 `latest`，与 `alpha` 一同指向该包的 alpha 版本。这不表示已有稳定版，也没有覆盖此前的稳定版本。

安装和更新继续显式使用 `@alpha` 或完整版本号。以后发布真正的稳定版时，再核对并管理 `latest` 的指向；不能仅凭 `latest` 标签判断版本稳定性。
