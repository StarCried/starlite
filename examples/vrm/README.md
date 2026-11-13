# 本地模型调校

简体中文 · [English](README.en.md)

界面跟随浏览器语言；可用 `/adjust?lang=zh-CN` 或 `/adjust?lang=en` 手动选择中文或英文。

在仓库完成依赖安装和构建后，用自己的标准人形 VRM 启动：

```sh
npm run start --workspace @starcried/starlite-vrm-example -- --model /path/to/avatar.vrm
```

打开终端显示的本地地址，或 `/adjust`。滑条即时预览，模型文件保持原样；
调好后复制页面生成的 `starlite.adjustments` 到 Hexo `_config.yml`。

包含姿态调节时，导出配置还会显式选用系统 `StarLiteIdle`，确保自带 Idle 的模型
也能应用预览中的姿态；仅调整跟随时保留博客原来的 Idle。
手部张合需勾选“手动设置”，否则保留原动作。没有眼球或手指映射时显示不可用。

有尾巴的模型可展开「主动摆尾」，填写 VRM 中唯一的尾根骨骼原名，再调整角度和周期。留空关闭；物理和碰撞仍由 VRM 决定。详见[摆尾配置](../../docs/configuration.md#主动摆尾)。
“掌心朝向”对称调整内外扭转；“手腕抬高”只折动手掌，可与抬臂、掌心朝向组合。

姿态参数校准系统默认 `StarLiteIdle`，保留其呼吸。三个通用动作
`StarLiteCuriousPeek`、`StarLiteHappyWave`、`StarLiteSleepyStartle` 也会从调后的
基础站姿起止。动作下拉框可检查这些衔接，以及保持原样的模型自带／外部动作。
切回“系统默认 Idle”后继续调整。
跟随仅在 Idle 生效，其他动作保留作者的头眼方向。

可添加第二个模型对照，或指定本地端口：

```sh
npm run start --workspace @starcried/starlite-vrm-example -- --model /path/to/avatar.vrm --compare-model /path/to/another.vrm --port 4196
```

若 VRM 的 `extras.starlite.adjustments` 带有合法的默认参数，页面从这些值开始；否则使用通用默认值。
页面按模型分别保留本次调节，刷新后恢复模型默认；不上传、不改写模型，也不保存到生产配置。
使用 Hexo 示例预设时，显式的 `adjustments` 完整替换示例的姿态与跟随调整，`adjustments: {}` 清除这些调整。
该工具是仓库内的开发预览，不是博客访客界面。

现有微光动作验收仍使用 `--assets <private companion output directory>`。
