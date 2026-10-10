# Hexo 看板娘安装与使用

程序支持 Inochi2D 和 VRM，示例角色另行授权。当前候选版本为 `0.1.0-alpha.1`；未发布到 npm 前，使用本地 tarball，不把以下正式安装命令当作已上线。

## 安装

需要 Node.js 22.12+、Hexo 7/8、桌面 Chrome 或 Edge 与 WebGL2。手机默认不下载模型。现有博客先在本地预览，插件不修改主题，也不自动部署。

正式发布后，在博客目录运行：

```sh
npm install hexo-model-companion@0.1.0-alpha.1
```

本地候选包含四个互相依赖的包，必须一起安装，避免去注册表寻找尚未发布的依赖：

```sh
npm install /path/to/model-widget-core-0.1.0-alpha.1.tgz /path/to/inochi2d-web-0.1.0-alpha.1.tgz /path/to/vrm-web-0.1.0-alpha.1.tgz /path/to/hexo-model-companion-0.1.0-alpha.1.tgz
```

Inochi2D 使用现有 pipeline／`inochi2d-blog` 准备流程。VRM 使用自己拥有网站分发许可的模型、VRMA 和可选角色配置；现成资源包应已有 `manifest.json`。自行准备时可创建 `prepare-model.cjs`：

```js
const { prepareModel } = require('vrm-web/prepare');
prepareModel({
  model: './my-assets/avatar.vrm',
  animations: [
    { name: 'Idle', path: './my-assets/Idle.vrma' },
    { name: 'Click', path: './my-assets/Click.vrma' },
  ],
  // profile: './my-assets/profile.json',
  output: './companion-bundle',
  // Only set true after reviewing every model/texture/motion permission.
  allowRedistribution: true,
}).catch(error => { console.error(error.message); process.exitCode = 1; });
```

运行 `node prepare-model.cjs`。输出目录必须不存在；模型文件限 8 MiB，不自动减面或压缩贴图。禁止把私有清单的分发开关改成 true 来跳过授权。

在博客 `source/images/companion.png` 放一张有权使用的静态图。将下列配置合并到 `_config.yml`，哈希填写输出清单的 `model.sourceSha256`（不是 `model.sha256`，两者不一定相同）：

```yaml
inochi2d_widget:
  enable: true
  backend: vrm
  bundle: ./companion-bundle
  fallback: images/companion.png
  publication:
    confirm: true
    allowRedistribution: true
    sourceSha256: 填写清单中的64位源哈希
  render:
    fps: 30
    maxDevicePixelRatio: 1.5
  mobile:
    show: false
    breakpoint: 768
  ambient:
    animations: [Idle]
  dialogue:
    click:
      animation: Click
      lines: [你好！]
  interactions:
    pointer: true
    drag: true
```

动作名区分大小写。资源包若有多个点击／偶发动作，按作者提供的配置使用随机池；单个动作示例不能代替角色的完整配置。气泡与语句库为两后端公共能力。参数轨道是 Inochi2D 专属，不能套给 VRM。

## 日常使用与更新

运行 `npx hexo clean`、`npx hexo generate` 和 `npx hexo server`，确认模型、材质、气泡、点击、光标跟随与切页正常，再按自己已有流程部署。CSP 的 `img-src`／`connect-src` 须允许 `blob:` 解码贴图。首次正文解析完成后空闲加载；PJAX 保留实例；完整导航会重新请求但同一标签页不重复播放入场对白。

换资源时重新准备到新目录，核对清单与全部素材许可，再更新 bundle 路径、源哈希和动作名，重新生成。手机默认没有运行时或模型请求；加载失败显示静态图。公开网站会把必要 VRM／VRMA 发送给访客，文件不能保证无法提取。

停用时设 `enable: false` 并重新生成。卸载时运行 `npm uninstall hexo-model-companion`，移除对应配置，再生成静态站点；不要遗留旧公开模型资源。

## 维护者发布

从干净提交构建，完成 `npm run validate`、`npm run test:browser` 和适用的公开模型浏览器检查。候选包不得包含私有模型或动作。按 core → Inochi2D → VRM → Hexo 顺序，以 `alpha` 标签发布同一组已核验 tarball。`inochi2d-blog` 是独立的原生辅助 CLI，另需 Linux／Windows 原生二进制发布门；直接使用 VRM 的 Hexo 插件不需要它。远程发布与真实博客部署分别批准。
