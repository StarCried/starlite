# StarLite for Hexo

简体中文 · [English](README.en.md)

把 VRM 角色放到 Hexo 博客，用动作和气泡回应点击，安静陪伴阅读。

[直接打开在线演示](https://starcried.github.io/)（桌面浏览器，无需安装）。

**快速开始**：[自己安装](#启动) · [让 Agent 安装](#让-agent-帮你)

## 启动

需要 Node.js 22.12+ 和 Hexo 7。

在博客目录运行：

```sh
npm install hexo-starlite
npx hexo server
```

无需添加配置，首次生成自动获取微光，带有演示博客的动作、气泡、视线跟随和显示预设。打开终端中的网址即可，日常沿用原 Hexo 命令。微光采用[独立模型许可](https://github.com/StarCried/starlite/blob/main/docs/weiguang-license.md)，使用即同意；不接受请在 `_config.yml` 中停用：

```yaml
starlite:
  enable: false
```

光标靠近角色时，脚下会出现「−／＋／气泡／暂时隐藏」快捷栏；连续缩放时按钮位置保持固定。右键菜单仍可调整大小、帧率、跟随、气泡和暂停，开关「显示调试信息」，或恢复默认大小、位置。位置、大小及气泡偏好只保存在当前访客的浏览器，不改博客配置；关闭气泡仍会触发动作。临时隐藏后点右下角「显示角色」恢复，Shift + 右键保留浏览器菜单。

默认情况下，透明区域和普通短点仍让下层页面接收原生点击。从角色身体按住移动超过 6 CSS px 则拖动角色，松手不会点击下层页面或触发角色点击响应。较窄或较矮的窗口会自动收小角色，放大也受当前可视范围限制。若要停用身体拖动，在 `starlite.interactions` 中设置 `drag: false`；页面点击穿透保持开启。

## 让 Agent 帮你

在博客目录打开能操作本机的 Agent，复制下文，让它按[安装指南](https://github.com/StarCried/starlite/blob/main/docs/release-guide.md)完成安装和预览：

```text
请阅读 https://github.com/StarCried/starlite/blob/main/docs/release-guide.md
在我的 Hexo 博客中安装 hexo-starlite，先核对已发布版本和环境，保留现有配置。
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

除初始默认的微光，也可在 `_config.yml` 选择蓝色大肥鱼：

```yaml
starlite:
  preset: bluefish
```

模型作者水原镜（Mzkagami），遵守[独立模型条款](https://github.com/StarCried/starlite/blob/main/docs/bluefish-license.md)。预设包含适配的好奇探头、开心招手和困倦惊醒；开心招手采用经过适配的举手挥动动作，来源随运行时记录。指定 `model` 后使用自定义模型，不再获取示例。

默认站姿不适合模型时，可[调整内置 Idle 的臂、手姿态和头眼跟随](https://github.com/StarCried/starlite/blob/main/docs/configuration.md#模型姿态与跟随调节)，不会修改模型自带动作。

每篇文章也能有自己的句子，在 Markdown 开头的 front matter 中添加：

```yaml
starlite:
  - "欢迎来到这一页。"
  - "慢慢看，我在这里。"
```

默认点击和偶发互动共用顺序句库。[完整说明与默认值](https://github.com/StarCried/starlite/blob/main/docs/configuration.md#页面专属句子)。

[动作、气泡与性能](https://github.com/StarCried/starlite/blob/main/docs/configuration.md) · [完整配置示例](https://github.com/StarCried/starlite/blob/main/docs/examples/hexo-vrm.yml) · [安装、更新与卸载](https://github.com/StarCried/starlite/blob/main/docs/release-guide.md) · [VRM API](https://github.com/StarCried/starlite/blob/main/packages/vrm/README.md)

模型在首次生成时从固定 GitHub Release 下载并校验，缓存后可离线生成；没有安装下载脚本。访客从博客静态资源加载模型。域名、缓存和停用方式见[下载与联网说明](https://github.com/StarCried/starlite/blob/main/docs/release-guide.md#下载缓存与加载失败)。

程序采用 BSD-2-Clause；微光、蓝色大肥鱼及其他模型和动作分别遵守各自许可。
