# StarLite · 星伴

小小星光，静静相伴。把 VRM 角色放到博客或桌面，用动作和气泡回应点击与应用事件。

## 先体验

准备 **Node.js 22.12+**、本项目源码和一个标准人形 **`.vrm`** 文件，在项目目录运行：

```sh
npm run demo -- --model "/path/to/avatar.vrm"
```

首次自动安装依赖，并打开本机 Hexo 示例。模型没有动作也能获得默认站姿、轻呼吸、眨眼和限角光标跟随；眨眼与眼球转动需要模型的标准表达与 lookAt 映射。按 **Ctrl+C** 关闭。

想使用微光？取得单独授权的 **Weiguang for StarLite** 单 VRM 文件后，把命令中的路径换成它即可。模型不随程序包分发。

当前版本为 **0.1.0-alpha.1**。接入已有 Hexo 博客只需 `npm install hexo-starlite@alpha`，再按[安装说明](packages/hexo/README.md)添加模型。[本机体验说明](docs/quick-start.md)

## 用到自己的应用里

- **Hexo 博客**：[安装与启动](packages/hexo/README.md)。
- **DSH 桌宠**：[StarLite for DSH](https://github.com/StarCried/starlite-dsh)。安装 `dsh-starlite` 后随 DSH 启动，在设置中直接添加 VRM。

## 进阶

[模型、动作和气泡配置](docs/configuration.md) · [VRM API](packages/vrm/README.md) · [开发](docs/development.md) · [当前状态](docs/status.md)

程序采用 [BSD-2-Clause](LICENSE)。模型和动作按各自许可使用；微光另有专属许可。
