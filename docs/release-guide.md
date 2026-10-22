# StarLite for Hexo：安装与使用

本页适用于 `0.1.0-alpha.3`；普通启动步骤见 [Hexo README](../packages/hexo/README.md)。需要 Node.js 22.12+、正常工作的 Hexo 7 博客，以及支持 WebGL2 的桌面 Chrome／Edge。Hexo 8 尚待单独验收，用户无需 Rust、Blender 或 API key。

## 安装与启动

在博客目录运行：

```sh
npm install hexo-starlite@alpha
npx hexo server
```

无需填写配置，第一次生成自动获取独立授权的固定微光版本，带有演示博客的 13 个动作、点击／偶发句库、首次入场、镜头和显示预设。打开终端中的网址即可体验。日常沿用原 Hexo 命令；插件不会自动部署博客。

需要固定版本时，使用 `npm install --save-exact hexo-starlite@0.1.0-alpha.3`。安装和更新均显式写 `@alpha` 或完整版本号；alpha 不是稳定版本，不以 `latest` 标签作为稳定性证明。

微光采用[独立模型许可](weiguang-license.md)，使用即同意，并需在关于页等可见位置保留署名。不接受许可或不需要看板娘时，在 `_config.yml` 停用：

```yaml
starlite:
  enable: false
```

停用不会获取默认资源，也不生成看板娘路由。手机默认隐藏；默认微光在屏宽小于 900 px 时不请求模型和运行时。

## 自定义

全站配置写在博客根目录的 `_config.yml`，不必修改插件文件或另建 `dialogue.json`。只填写需要覆盖的部分，例如：

```yaml
starlite:
  render:
    fps: 30
  dialogue:
    click:
      lines: ["你好，欢迎来坐坐。"]
```

动作、逐动作句库、位置和性能开关见[完整配置](configuration.md)及 [YAML 示例](examples/hexo-vrm.yml)。默认微光使用 60 FPS、DPR 1、260 × 390 画布，位置为右侧 112 px、底部 160 px；保持抗锯齿，按目标设备验收。

单篇文章或独立页面可在 Markdown front matter 中写 `starlite: ["欢迎来到这一页。", "慢慢看。"]`，默认按顺序回应点击和偶发互动；选项及全站 `pageDialogue` 默认值见[页面专属句子](configuration.md#页面专属句子)。

### 使用自己的模型

将一个有权托管的自包含 VRM 0／1 放在博客根目录的 `models/avatar.vrm`，位于 `source/` 外：

```yaml
starlite:
  model: ./models/avatar.vrm
  publication:
    confirm: true
    allowRedistribution: true
```

`.vrm` 路径自动选择 VRM 后端。自定义模型不获取微光，也不继承微光专属动作、句库、镜头和显示预设。插件检查模型后生成带内容哈希的资源；公开单模型上限为 **10 MiB**，不会自动减面或压缩贴图。

两项 `publication` 确认涵盖模型、贴图和内嵌动作的博客托管权；模型许可仍须遵守。来源 SHA-256 由实际文件计算，也可设置 `publication.sourceSha256` 固定已审阅版本，文件变化时拒绝生成。必要博客托管会把模型文件交给访客；许可可以约束再利用，不能保证文件无法下载。

标准人形骨骼为必需；Blink 和 lookAt 为可选能力。无动作模型使用唯一内置的 `StarLiteIdle` 基础站姿和轻呼吸，有自己的 `Idle` 时优先采用；其他内嵌动作自动识别，按需映射到点击或偶发互动。气泡也可独立使用。模型约定、外部动作和两个后端的配置见[配置说明](configuration.md)。

自定义 VRM 通用默认值为 30 FPS、DPR 上限 1.5、手机断点 768 px。默认保留下层页面点击；显式开启拖动时默认拥有点击区域。无需同时安装旧的 `hexo-model-companion`；旧配置键 `inochi2d_widget:` 应改为 `starlite:`。

## 下载、缓存与加载失败

默认模型不随 npm 包分发，安装 npm 包时也不下载。首次生成按固定版本 `weiguang-v3.0.0-starlite.1` 获取资源，缓存于博客根目录的 `node_modules/.cache/hexo-starlite/weiguang-v3.0.0-starlite.1/`。每次生成校验固定长度与 SHA-256，有效缓存可离线使用；不会自动改用未知的最新模型。生成资源同时附带 `LICENSE-Weiguang.md` 和 `ASSET-SOURCES.md`。

下载遵循生成进程的 `HTTP_PROXY`、`HTTPS_PROXY`、`NO_PROXY` 环境变量；不要把代理凭据写入配置或提交。默认资源超时或校验失败时，本次只生成正常博客并记录警告；修复网络后重新生成会重试。

浏览器端加载或渲染失败时隐藏角色，不展示静态替代图片、不拦截下层点击；按 2、5、15 秒的间隔最多后台重试三次，成功后恢复。隐藏、离线和手机守卫仍生效。正文优先加载，PJAX 保留单实例；完整文档导航重新挂载，同一标签页不重复首次入场。CSP 需允许内嵌贴图使用的 `blob:`。

## 本地验收与部署

```sh
npx hexo clean
npx hexo generate
npx hexo server -p 4000
```

检查正文、材质、站姿、头眼跟随、点击动作与句子、偶发互动、页面切换，以及下层页面可点击。较大动作还应检查画布与页面底部裁切；手机尺寸不应下载模型或运行时。本地通过后再使用自己的 Hexo 部署流程。

## 更新与卸载

更新：执行 `npm install hexo-starlite@alpha`，再生成并本地检查。早期 `0.1.0-alpha.2` 需要显式配置模型；升级后仍保留已有显式配置，不会重写 `_config.yml`。希望改用默认微光时，移除自己的 `model`／`bundle` 及不再需要的专属映射，只保留必要覆盖。旧版本的实际发行证据见 [validation](validation.md)。

替换自定义模型时，复核许可、动作名和固定的 `sourceSha256` 后重新生成。停用使用 `starlite.enable: false`。卸载：

```sh
npm uninstall hexo-starlite
```

删除不再使用的 `starlite` 配置、模型文件和上述专用缓存；不要删除其他功能仍使用的资源。执行 `hexo clean` 后重新生成，确认部署目录没有遗留模型或许可路由。

## 维护者：发布状态与标签

版本元数据和本地检查不等于已经公开发行。每版的托管 CI、精确产物、npm registry 与公开安装验收另记于 [validation](validation.md)。发布使用独立 `alpha` 标签；首次发布曾使 `latest` 指向 alpha.1，这不代表已有稳定版。不要覆盖旧版本或移动旧 tag；稳定发行时再明确管理 `latest`。
