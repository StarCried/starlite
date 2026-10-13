# StarLite · 星伴

小小星光，静静相伴。把 VRM 角色放到博客或桌面，让它用动作和气泡回应点击与应用事件。

## 先体验微光

准备 **Node.js 22.12+**、本项目源码和单独授权的 **Weiguang for StarLite** 资源包。在项目目录运行一条命令：

```sh
npm run demo -- --bundle "/path/to/Weiguang-v3.0-companion-example.zip"
```

换成你下载的 ZIP 路径即可。工具会安装所需依赖、展示许可，并打开本机的 Hexo 示例页。无需已有博客、DSH、Rust 或 Blender。关闭体验时在终端按 **Ctrl+C**。

页面中可以点击角色、观察光标跟随与偶发小动作；点击角色同时保留页面原本的操作。

当前为 alpha 候选，npm 程序包和微光资源包尚未正式发布。[详细体验说明](docs/quick-start.md)

## 放到自己的应用里

- **Hexo 博客**：按[安装说明](docs/release-guide.md)安装插件，复制[配置示例](docs/examples/hexo-vrm.yml)，填入资源包路径后本地预览。
- **DSH 桌宠**：使用 **StarLite for DSH** 与 `dsh-starlite` 桥接插件；安装和启动流程见桌宠仓库的 README。

## 进阶使用

[换自己的模型和动作](docs/configuration.md) · [VRM API](packages/vrm/README.md) · [开发与项目结构](docs/development.md) · [当前支持范围](docs/status.md)

程序采用 [BSD-2-Clause](LICENSE)。微光模型单独授权，仅限许可范围内使用；下载不等于获得修改或另行分发权。
