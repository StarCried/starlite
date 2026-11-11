# StarLite 当前状态

## 0.1.2 候选（2026-11-11）

共享脚下快捷栏改为透明按钮，保留浅深背景下的图标轮廓及悬浮、焦点、按下反馈。
宿主可在会话接管时增加退出按钮；Hexo 仍为四个按钮，连续缩放时锚点保持不变。
调试入口统一为“显示调试信息”，环境光统一命名；通用打瞌睡动作去掉末尾歪头。
配置键、用户偏好和模型许可不变。四个运行时／Hexo 包准备联动升级为 `0.1.2`，
原生 `inochi2d-blog` CLI 保持 `0.1.0`。本节记录候选行为，不表示公开发布已完成。

## 0.1.1 npm 发行（2026-11-06）

核心、Inochi2D、VRM 与 Hexo 包新增共享脚下快捷栏、普通点击与拖动区分。
Hexo 按可视宽高限制尺寸并保存访客位置；连续缩放时按钮位置固定，
气泡可单独隐藏，保留右键详细设置和恢复默认位置。
本轮不改模型资产，未改动的 `inochi2d-blog` CLI 保持 `0.1.0`。
四个包已发布到 npm `latest`，发行源码为 [`v0.1.1`](https://github.com/StarCried/starlite/tree/v0.1.1)。
完整 CI、依赖审计和公开下载的逐字节核对已通过；安装与验收边界见
[公开验证记录](validation.md#2026-11-06-public-011-verification)。本轮不另发原生 CLI、模型资产或部署作者博客。

## 0.1.0 正式发行（2026-11-03）

- 在基础 `StarLiteIdle` 外，为所有标准人形 VRM 增加可选的
  `StarLiteCuriousPeek`、`StarLiteHappyWave`、`StarLiteSleepyStartle`。
  动作在运行时内嵌，不额外联网，也不包含蓝鱼模型或问号、汗滴装饰。
  旧映射保持不变；手指或 Blink 缺失时按模型能力播放。
- 公共菜单、气泡控件、Hexo 默认示例句库与模型调校页提供英文；新增英文
  README、安装和配置文档。`starlite.locale` 可显式选择 `en` 或 `zh-CN`，
  否则跟随 Hexo 的语言。用户自己的句子与模型名称不会自动翻译。
- 蓝鱼与微光挥手的半眯眼、蓝鱼动作里的问号／汗滴触发已在本地派生资产
  中修正。资源发行仍独立于源码推送；旧公开模型链接不会因此自动换成新文件。

[0.1.0 正式版](https://github.com/StarCried/starlite/releases/tag/v0.1.0)已公开，发行时五个 npm 包的 `latest` 均为 `0.1.0`；`alpha` 保留历史预发行版本。蓝鱼按[独立模型许可发行](https://github.com/StarCried/starlite/releases/tag/bluefish-v1.0.0-starlite.1)，默认微光保持不变。精确来源、CI、匿名下载、全新 npm 安装及 Chrome／Edge 功能检查见[公开验证记录](validation.md#2026-11-03-public-010-verification)。以下 alpha 记录保留原版本身份。

## 历史 alpha 发行

`0.1.0-alpha.3` 已于 2026-10-22 作为 [alpha 预发布](https://github.com/StarCried/starlite/releases/tag/v0.1.0-alpha.3)公开，包含默认微光 Hexo 体验、右键设置、页面专属句子和模型姿态／跟随调节。五个 npm 包的 `alpha` 标签已更新，`latest` 保留 `0.1.0-alpha.1`。用户入口见 [README](../README.md) 和[安装说明](release-guide.md)。

发行 tag、公开 `SOURCE_REVISION` 和精确云端构建均对应 [`f83a4ec`](https://github.com/StarCried/starlite/commit/f83a4ec0f795a14f36d6724465e3a89f9c1e8529)。CI、依赖审计、双平台原生构建、匿名 npm／GitHub 下载及隔离 registry 安装已通过；[公开核验记录](validation.md#2026-10-22-public-alpha3-verification)保留来源和验证边界。

## 功能

- Hexo 安装后无需配置，生成时自动获取独立授权的固定微光资源，沿用演示博客的动作、句库与显示效果。自定义或停用通过 `_config.yml`；用户已通过本地人工验收。
- 标准人形 VRM 0／1、基础 `StarLiteIdle` 与三个可选通用动作、轻呼吸和限角头部跟随。Blink 与 lookAt 为可选能力；已声明的损坏绑定仍拒绝。
- 本版支持按模型调节内置 Idle 的双臂、掌心、手腕抬高、手部张合和肘部，以及独立头眼跟随强度与平滑时间。掌心扭转已修复左右镜像方向；调校页可实时预览并导出 Hexo 配置，自带动作保持原样。已完成自动回归及此前基础面板的原生回归，用户于 2026-10-22 通过浏览器调校页的功能与外观验收；新增手腕项的原生 GUI 操作未另行人工验收。
- 自动识别模型内嵌动作，支持外部 VRMA、随机动作池和逐动作句库。内嵌／外部动作使用统一骨骼绑定，避免切换时身体延迟和姿态跳变；保留 400 ms 过渡。该修复已通过本机 DSH 点击动作人工验收。
- 公共播放契约、可取消加载、动作完成／中断结果、共享气泡和语句调度。气泡可不带动作；core 不依赖渲染后端。
- 两个后端共用可选性能浮层，默认关闭，无遥测或新增请求；区分实际 FPS、帧间隔与 CPU 提交耗时。模型检查报告骨骼、表达、视线、动作与逻辑资源统计，不把静态数据当作实测评级。
- Hexo 正文优先、移动端零模型请求、PJAX 单实例、首次入场去重和点击穿透。加载／渲染失败时隐藏并有限重试，成功后恢复，不展示静态替代图片。
- 角色模型、专属动作和工程独立于程序包；基础待机与三个通用动作内嵌于运行时并保留各自来源说明。默认微光从[独立发行](https://github.com/StarCried/starlite/releases/tag/weiguang-v3.0.0-starlite.1)取得。许可仍由各自资产决定，技术检查不授予托管权。

StarLite for DSH 的 Windows 桌宠、模型库及 DSH 事件由独立的 [starlite-dsh](https://github.com/StarCried/starlite-dsh) 仓库维护，当前 DSH 禁用 Inochi2D。

## 本地验收与边界

2026-10-19 的稳定化检查、实际模型矩阵及长期性能边界见[稳定化记录](stabilization.md)、[模型兼容](model-compatibility.md)和[性能预算](performance.md)。当时的共享 VRM 构建与既有 923.9 秒、20 次挂载销毁实测使用相同 SHA-256。2026-10-22 加入模型调节后运行时已变化，已做功能与包体预算回归，未重复上述长测；保留抗锯齿、动作、物理和画质。此前整套隔离 Chrome 采样峰值约 800 MiB，不能宣传为当前版本的内存测量，也不代表任意设备、模型或无限期运行。

默认 Hexo 的四包本地安装、无配置下载校验、有效缓存离线生成、停用、自定义句子／位置、合成 VRM 替换及 Chrome 交互已在隔离站点检查。用户验收了默认外观、动作、气泡、跟随、点击穿透和说明；其他设备与网络情况仍以实际反馈为准。原始证据保留在忽略的 `target/hexo-default-qualification/` 和 `target/maturity-validation/`。

本次依赖审计保留 6 个 low 级别的 Hexo 宿主受影响条目，均追溯到 1 项已说明的上游公告；不能声称零漏洞。适用范围与复核期限见[依赖说明](dependency-audit.md)。

## 历史发行

`0.1.0-alpha.2` 于 2026-10-15 公开，tag 与 `SOURCE_REVISION` 为 `903fe2cab9e0f37ad36cd904e301fa482af2508e`；当时托管 CI、双平台原生／五包构建、公共 npm tarball 与 GitHub 资产校验均通过。真实博客实际从 npm 安装、生成并部署；线上网络资源检查不冒充人工视觉验收。[精确证据与哈希](validation.md#2026-10-15-public-alpha2-verification)保持原身份。

`0.1.0-alpha.1` 的发行源码为 `a103ca9`，运行时基线为 `986443cc`。旧 tag 和产物不因后续版本移动或替换。其静态占位等历史行为已由后续版本替代，不作为当前安装流程。

## 支持范围

- Hexo 7，桌面 Chrome／Edge、WebGL2；Hexo 8、Firefox／Safari 尚未单独验收。
- 公开本地模型上限 10 MiB；隔离本机 demo 可预览最多 64 MiB，其输出不作为部署产物。
- 外部动作在 ready 前准备好，尚未按需加载。安装依赖包含两个后端，浏览器只加载选中的后端。
- `inochi2d-blog` 原生 CLI 仍是未签名的实验性工具，发行版本随工作区同步为 `0.1.0`；原生构建、完整性和许可失败均停止，不自动部署。
