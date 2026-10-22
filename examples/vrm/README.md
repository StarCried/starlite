# 本地模型调校

在仓库完成依赖安装和构建后，用自己的标准人形 VRM 启动：

```sh
npm run start --workspace @starcried/starlite-vrm-example -- --model /path/to/avatar.vrm
```

打开终端显示的本地地址，或 `/adjust`。滑条即时预览，模型文件保持原样；
调好后复制页面生成的 `starlite.adjustments` 到 Hexo `_config.yml`。
包含姿态调节时，导出配置还会显式选用系统 `StarLiteIdle`，确保自带 Idle 的模型
也能应用预览中的姿态；仅调整跟随时保留博客原来的 Idle。
手部张合需勾选“手动设置”，否则保留原动作。没有眼球或手指映射时显示不可用。

姿态参数仅修改系统默认 `StarLiteIdle`，保留其呼吸。动作下拉框可检查模型自带
动作，确认这些动作保持原样。切回“系统默认 Idle”后继续调整。
跟随仅在 Idle 生效，其他动作保留作者的头眼方向。

可添加第二个模型对照，或指定本地端口：

```sh
npm run start --workspace @starcried/starlite-vrm-example -- --model /path/to/avatar.vrm --compare-model /path/to/another.vrm --port 4196
```

页面按模型分别保留本次调节，刷新后还原；不上传、不改写模型，也不保存到生产配置。
该工具是仓库内的开发预览，不是博客访客界面。

现有微光动作验收仍使用 `--assets <private companion output directory>`。
