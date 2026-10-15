# StarLite · 星伴

小小星光，静静相伴。把 VRM 角色放到博客或桌面，用动作和气泡回应点击与应用事件。

**[直接打开在线演示](https://starcried.github.io/)**：无需安装，用桌面浏览器体验微光的动作、气泡和视线跟随。手机默认隐藏角色。

## 先体验

准备 **Node.js 22.12+**、本项目源码和一个标准人形 **`.vrm`** 文件，在项目目录运行：

```sh
npm run demo -- --model "/path/to/avatar.vrm"
```

首次自动安装依赖，并打开本机 Hexo 示例。模型没有动作也有默认站姿、轻呼吸和限角头部跟随；有 Blink 表达时自动眨眼，有 lookAt 配置时眼球跟随。缺少这些可选配置仍可使用。按 **Ctrl+C** 关闭。

想使用微光？从[独立授权模型发行](https://github.com/StarCried/starlite/releases/tag/weiguang-v3.0.0-starlite.1)下载 `Weiguang-StarLite-Blog.vrm`，把命令中的路径换成它即可。模型不随程序包分发。

当前版本 **[0.1.0-alpha.2](https://github.com/StarCried/starlite/releases/tag/v0.1.0-alpha.2)**。接入已有 Hexo 博客只需 `npm install hexo-starlite@alpha`，再按[安装说明](packages/hexo/README.md)添加模型。[本机体验说明](docs/quick-start.md)

## 用到自己的应用里

- **Hexo 博客**：[安装与启动](packages/hexo/README.md)。
- **DSH 桌宠**：[StarLite for DSH](https://github.com/StarCried/starlite-dsh)。安装 `dsh-starlite@alpha` 后随 DSH 启动，在设置中直接添加 VRM。

## 进阶

[模型、动作和气泡配置](docs/configuration.md) · [VRM API](packages/vrm/README.md) · [开发](docs/development.md) · [当前状态](docs/status.md)

程序采用 [BSD-2-Clause](LICENSE)。模型和动作按各自许可使用；微光另有专属许可。
