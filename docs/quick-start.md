# 本机体验 StarLite

准备 Node.js 22.12+、StarLite 源码和一个标准人形 `.vrm` 文件：

```sh
npm run demo -- --model "/path/to/avatar.vrm"
```

Windows 示例：

```powershell
npm run demo -- --model "D:\\Downloads\\avatar.vrm"
```

源码在 WSL 时使用 `/mnt/d/Downloads/avatar.vrm` 这样的路径。首次缺少依赖会自动执行 `npm ci`；工具展示模型内嵌许可，确认后打开本机 Hexo 页。微光使用另行授权的单 VRM 文件；无需自定义 ZIP、Rust、Blender 或 DSH。

无动作模型使用默认 Idle，并启用眨眼和限角光标跟随。眨眼依赖有效的 VRM Blink 表达，眼球跟随依赖 lookAt 配置。内嵌动作可通过可选配置映射到点击或偶发互动；没有映射的动作不会随机播放。

按 **Ctrl+C** 停止。临时站点和模型副本会自动清理，源模型与真实博客不变。示例只监听 `127.0.0.1`，默认端口 `4183`，占用时自动换下一个；自动打开失败时复制终端网址即可。

## 可选配置

用 `--config "/path/to/widget.json"` 指定相机、显示或互动。例如，模型有名为 `Wave` 的内嵌动作时：

```json
{
  "dialogue": {
    "click": {
      "animation": "Wave",
      "lines": ["你好，欢迎来坐坐。"],
      "durationMs": 7200
    }
  }
}
```

也可省略 `animation`，仅使用气泡。体验配置不接受外部动作 URL 或外部 profile 文件；模型内嵌 profile 会由运行时读取。

其他选项：`--no-open`、`--port 4185`、`--no-install`、`--accept-license`、`--help`。只有已阅读并同意模型许可时才使用 `--accept-license`。

本机示例可预览最多 64 MiB 的模型，输出位于隔离预览目录，不作为部署产物。接入自己的博客见[安装说明](release-guide.md)，公开生成模型的上限为 8 MiB。
