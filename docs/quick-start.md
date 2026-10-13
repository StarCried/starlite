# 用微光体验 StarLite

先取得单独提供的 **Weiguang for StarLite** 资源 ZIP，并阅读其中的模型使用许可。当前候选尚未公开下载，维护者会另行提供资源包；无需 Blender、Rust 或 DSH。

在 StarLite 源码目录，用 Node.js 22.12+ 运行：

```sh
npm run demo -- --bundle "/path/to/Weiguang-v3.0-companion-example.zip"
```

把引号中的路径改为你的 ZIP 路径。也可以指定已经解压的完整资源包目录。首次缺少依赖时自动运行 `npm ci`；阅读终端显示的模型许可并输入 `y` 后，会打开独立的本机 Hexo 体验页。

移动光标体验视线跟随，点击角色查看动作和气泡，等待偶发小动作。手机尺寸默认隐藏模型。按 **Ctrl-C** 停止，临时站点与资源副本会自动清理；原 ZIP、源码和自己的博客均不修改。

Windows 路径示例：

```powershell
npm run demo -- --bundle "D:\Downloads\Weiguang-v3.0-companion-example.zip"
```

若源码在 WSL 中，请在 WSL 终端运行，并使用 `/mnt/d/Downloads/Weiguang-v3.0-companion-example.zip` 这样的路径。示例只监听 `127.0.0.1`，默认端口 `4183`，占用时自动换下一个；自动打开失败时，复制终端中的网址到浏览器即可。

## 接到自己的博客

体验满意后，按 [Hexo 安装说明](release-guide.md) 和 [配置示例](examples/hexo-vrm.yml) 安装到自己的博客。微光模型与程序独立分发，使用范围和署名以资源包内许可为准。

## 其他启动选项

- `--no-open`：只输出网址。
- `--port 4185`：指定首选端口。
- `--no-install`：不自动安装依赖，缺少依赖时报错。
- `--accept-license`：已经阅读并同意资源包许可时，跳过交互确认，供自动验收使用。
- `--help`：查看帮助。

资源包的 SHA256SUMS 和模型清单都会校验；损坏、非法路径、符号链接、未批准分发或不一致资源会被拒绝。哈希用于检查包内一致性，不能代替从作者可信渠道取得资源。
