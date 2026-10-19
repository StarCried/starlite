# StarLite for Hexo

把 VRM 角色放到 Hexo 博客，用动作和气泡回应点击，安静陪伴阅读。

[直接打开在线演示](https://starcried.github.io/)（桌面浏览器，无需安装）。

**快速开始**：[自己安装](#启动) · [让 Agent 安装](#让-agent-帮你)

## 启动

需要 Node.js 22.12+ 和 Hexo 7。

从 `0.1.0-alpha.3` 起，在博客目录运行：

```sh
npm install hexo-starlite@alpha
npx hexo server
```

无需添加配置，首次生成自动获取微光，带有演示博客的动作、气泡、视线跟随和显示预设。打开终端中的网址即可，日常沿用原 Hexo 命令。微光采用[独立模型许可](https://github.com/StarCried/starlite/blob/main/docs/weiguang-license.md)，使用即同意；不接受请在 `_config.yml` 中停用：

```yaml
starlite:
  enable: false
```

右键角色可调整大小、帧率、跟随、气泡和暂停，或恢复默认位置。设置仅保存在当前访客的浏览器，不改博客配置；关闭气泡仍会触发动作。临时隐藏后可点右下角「显示角色」恢复，按住 Shift 右键可使用浏览器菜单。

## 让 Agent 帮你

在博客目录打开能操作本机的 Agent，复制下文，让它按[安装指南](https://github.com/StarCried/starlite/blob/main/docs/release-guide.md)完成安装和预览：

```text
请阅读 https://github.com/StarCried/starlite/blob/main/docs/release-guide.md
在我的 Hexo 博客中安装 hexo-starlite@alpha，先核对已发布版本和环境，保留现有配置。
没有自定义配置时使用默认微光；完成生成和本地预览，告诉我预览地址及配置位置，不要部署博客。
```

<details>
<summary>只想先了解用法？复制这个提示词</summary>

```text
请阅读 https://github.com/StarCried/starlite/blob/main/docs/release-guide.md
以及 https://github.com/StarCried/starlite/blob/main/docs/configuration.md
简要说明如何启动、换模型和自定义气泡；这次只解释，不安装、修改文件或部署。
```

</details>

## 使用自己的模型

将有权托管的 VRM 放到博客根目录的 `models/avatar.vrm`（不放进 `source/`），配置：

```yaml
starlite:
  model: ./models/avatar.vrm
  publication:
    confirm: true
    allowRedistribution: true
```

`publication` 表示已确认模型、贴图及内嵌动作的博客托管权。无动作模型使用内置默认 Idle，其他动作自动识别后按需映射；替换模型不会继承微光的专属动作和句库。手机默认不下载模型。

## 进阶

[动作、气泡与性能](https://github.com/StarCried/starlite/blob/main/docs/configuration.md) · [完整配置示例](https://github.com/StarCried/starlite/blob/main/docs/examples/hexo-vrm.yml) · [安装、更新与卸载](https://github.com/StarCried/starlite/blob/main/docs/release-guide.md) · [VRM API](https://github.com/StarCried/starlite/blob/main/packages/vrm/README.md)

BSD-2-Clause；微光模型独立授权，其他模型和动作由使用者按各自许可提供。
