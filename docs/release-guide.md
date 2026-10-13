# StarLite for Hexo：安装与使用

本指南面向博客用户。当前是 `0.1.0-alpha.1` 本地候选，**尚未发布到 npm**；正式安装命令将在公开 alpha 后可用。[桌宠安装说明](https://github.com/StarCried/starlite-dsh/blob/feat/dual-model-backends/docs/user-guide.md)

## 1. 准备

需要 Node.js 22.12+、已经正常工作的 Hexo 7 博客，以及支持 WebGL2 的桌面 Chrome／Edge。Hexo 8 尚待单独验收。普通用户不需要 Rust、Blender 或 Inochi2D 原生工具。

准备自己有权托管的 VRM、外部 VRMA 和静态 fallback 图，或使用另行授权的资源包。标准 VRM 不要求角色 profile。程序不附赠微光模型或第三方动作库；自制默认 Idle 和无动作安装的简化流程还未落地，本候选的完整互动配置需要自己的动作。

## 2. 安装插件

正式发布后，预期在博客目录执行：

```sh
npm install hexo-starlite@alpha
```

插件会自动安装对应运行时依赖，无需分别安装后端。**现在测试本地候选**时，尚未公开的依赖需要一并从本地安装；使用维护者从同一源码构建的四个 tarball：

```sh
npm install /path/to/starcried-starlite-core-0.1.0-alpha.1.tgz /path/to/starcried-starlite-inochi2d-0.1.0-alpha.1.tgz /path/to/starcried-starlite-vrm-0.1.0-alpha.1.tgz /path/to/hexo-starlite-0.1.0-alpha.1.tgz
```

当前插件的安装依赖包含两个后端，浏览器只请求配置选中的一个；普通 VRM 用户不需要 `inochi2d-blog`。

从旧本地候选迁移时，先卸载旧的 `hexo-model-companion`、`model-widget-core`、`vrm-web`、`inochi2d-web` 直接依赖，再安装新四包。不要同时保留两个 Hexo 适配器。把旧 `inochi2d_widget:` 配置块改为 `starlite:`；新插件不读取旧键。

## 3. 准备资源包

### 使用微光独立资源包

阅读并同意包内许可后，将 ZIP 解压到博客根目录的 `weiguang/`，使 `weiguang/blog/manifest.json` 和 `weiguang/hexo-config.yml` 存在。再将 `weiguang/fallback.png` 复制到 `source/images/weiguang.png`。资源目录放在博客根目录，不能放进 `source/`；插件只发布配置所需的博客资源。

资源包的 `hexo-config.yml` 已包含动作、句库、来源哈希和微光的显示配置，不必重新制作资源或逐项填写。保留原博客配置，用 Hexo 的多配置入口启动：

```sh
npx hexo server --config _config.yml,weiguang/hexo-config.yml
```

以后生成站点也使用相同的配置参数：

```sh
npx hexo generate --config _config.yml,weiguang/hexo-config.yml
```

自己的部署命令同样带上 `--config _config.yml,weiguang/hexo-config.yml`，或者将资源包中的 `starlite` 块合并到博客 `_config.yml` 后沿用原命令。已有 `starlite` 配置应先替换，避免旧字段参与合并。微光包用户可跳过下面的资源制作和第 4 节，直接本地验收。

### 使用自己的模型

已有 `manifest.json` 的合法资源包可以跳过制作。自行准备时，将 [prepare-vrm.cjs](examples/prepare-vrm.cjs) 放到博客目录，替换输入路径和动作清单，核实分发许可后才把 `allowRedistribution` 改为 `true`，然后运行：

```sh
node prepare-vrm.cjs
```

输出目录必须不存在；失败不会覆盖源模型。准备工具允许最多 64 MiB 的 VRM，而 **Hexo 发布模型上限为 8 MiB**；它不会自动减面、缩图或转换 FBX。动作也有独立大小与数量限制，详见[配置说明](configuration.md)。模型过大请从源工程导出合适的派生资产。

## 4. 配置

将 [hexo-vrm.yml](examples/hexo-vrm.yml) 合并到 `_config.yml`。静态图放到 `source/images/starlite-fallback.png`。按自己的资源调整：

- `bundle`：含清单的本地资源目录，相对博客根目录。
- `publication.sourceSha256`：清单的 `model.sourceSha256`，不是其他文件哈希。
- `ambient.animations`：一个基础循环动作，例如你提供的 `Idle`。
- `dialogue.enter / idle / click`：首次入场、偶发小动作和点击回应。每个场景可绑定动作随机池和各自语句库；没有的场景直接删除。
- 核实全部资源许可后将两个 publication 开关设为 `true`，最后设 `enable: true`。

动作名英文且区分大小写，必须与资源清单一致。示例的 `Wave / Nod / Stretch` 只是名称示范，不是附赠动作。现有候选的每个气泡场景仍要求有效动作；气泡独立配置会在下一阶段实现。

博客推荐 `passThrough: true`、`drag: false`：点击模型同时保留下层页面的原生点击行为。30 FPS／DPR 1 是保守起点；60 FPS 更流畅也更耗 GPU。保持抗锯齿，先按目标设备验收再调整。

## 5. 本地验收与日常使用

```sh
npx hexo clean
npx hexo generate --config _config.yml,weiguang/hexo-config.yml
npx hexo server -p 4000 --config _config.yml,weiguang/hexo-config.yml
```

以上命令使用微光包的独立配置；如果已将 `starlite` 块合并到 `_config.yml`，省略 `--config` 参数即可。若端口占用，换一个空闲端口。桌面打开页面，检查正文先可用、模型材质、基础循环、眼睛／头部跟随、点击句子对应动作、偶发动作，以及跳页没有重复实例。检查小屏幕下没有模型下载，加载失败有静态图。较大动作还须检查画布边缘和页面底部没有裁切。

CSP 如有限制，贴图解码所用 `blob:` 需被适用的 `img-src`／`connect-src` 允许。PJAX 导航保留实例；完整文档导航需要新实例，但同一标签页不重复首次入场。同一资源的网络复用取决于站点缓存策略。

验收通过后再用自己的 Hexo 部署流程。本插件不会自动部署，也不代管 API key。公开网站会把必要的模型和动作文件交给访客，许可可以约束再利用，不能保证文件无法提取。

## 6. 更新、停用与卸载

更新模型或动作时重新准备到新目录，复核许可、清单哈希和配置动作名，再本地生成。不要只改清单中的许可开关或哈希以绕过校验。

停用时设 `starlite.enable: false` 并重新生成。卸载插件和四个候选的直接依赖：

```sh
npm uninstall hexo-starlite @starcried/starlite-core @starcried/starlite-vrm @starcried/starlite-inochi2d
```

移除 `starlite` 配置与不再使用的源资源，执行 `hexo clean` 后生成；确认站点生成目录及部署目标没有遗留旧模型路由。不要把其他功能仍使用的图片或资源一并删掉。

发布验证与当前限制见[项目状态](status.md)和[开发说明](development.md)。程序包与 Weiguang for StarLite 独立资源包分别分发，许可不能混用。
