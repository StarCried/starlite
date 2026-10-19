# StarLite · 星伴

小小星光，静静相伴。把 VRM 角色放到博客或桌面，用动作和气泡回应点击与应用事件。

**[直接打开在线演示](https://starcried.github.io/)**：无需安装，用桌面浏览器体验微光的动作、气泡和视线跟随。手机默认隐藏角色。

## Hexo：安装即体验

从 `0.1.0-alpha.3` 起，在已有的 Hexo 7 博客目录运行（Node.js 22.12+）：

```sh
npm install hexo-starlite@alpha
npx hexo server
```

无需配置，首次生成自动获取微光，使用演示博客的动作、句库和显示预设。微光[独立授权](docs/weiguang-license.md)，使用即同意；不接受或暂时不需要时，在 `_config.yml` 中设置：

```yaml
starlite:
  enable: false
```

使用自己的模型时，将有权托管的 VRM 放在博客根目录 `models/avatar.vrm`，配置：

```yaml
starlite:
  model: ./models/avatar.vrm
  publication:
    confirm: true
    allowRedistribution: true
```

无动作模型也有默认站姿、轻呼吸和限角头部跟随；有相应表达／lookAt 配置时自动眨眼及眼球跟随。模型不随程序包分发。

## 其他入口

- **Hexo 博客**：[安装与启动](packages/hexo/README.md)。
- **DSH 桌宠**：[StarLite for DSH](https://github.com/StarCried/starlite-dsh)。安装 `dsh-starlite@alpha` 后随 DSH 启动，在设置中直接添加 VRM。
- **独立本机体验**：[源码示例](docs/quick-start.md)。

## 进阶

[模型、动作和气泡配置](docs/configuration.md) · [VRM API](packages/vrm/README.md) · [开发](docs/development.md) · [当前状态](docs/status.md)

程序采用 [BSD-2-Clause](LICENSE)。模型和动作按各自许可使用；微光另有专属许可。
