# StarLite 当前状态

更新于 2026-10-15。[0.1.0-alpha.2 已公开发行](https://github.com/StarCried/starlite/releases/tag/v0.1.0-alpha.2)，五个 npm 包的 `alpha` 标签均指向本版。包含可选 Blink、加载恢复、点击穿透和角色配置修复。安装时显式使用 `@alpha` 或完整版本号；`latest` 保留在 `0.1.0-alpha.1`，不表示稳定版。

[0.1.0-alpha.1 的历史发行](https://github.com/StarCried/starlite/releases/tag/v0.1.0-alpha.1)及当时五个 npm 包使用源码 `a103ca9`、运行时基线 `986443cc`。后续版本不移动该 tag 或替换原产物。

## 已实现

- 公共播放契约、取消旧加载、动作完成／中断结果、共享气泡和语句调度。
- VRM0／1、标准人形骨骼检查、限角光标跟随。本版本将 Blink 改为可选能力，缺失时仍可使用；已声明的损坏绑定仍拒绝。
- 唯一内置 `StarLiteIdle`；无动作模型可使用基础站姿和轻呼吸，有自己的 `Idle` 时优先采用。
- 内嵌 glTF 动作自动识别、外部 VRMA、动作随机池和逐动作句库。气泡可不带动作。
- Hexo 直接读取单 VRM 文件并生成哈希资源，无需自定义 ZIP；高级用户仍可准备外部动作清单目录。
- 移动端默认零模型请求、正文优先启动、PJAX 单实例、首次入场去重和点击穿透。博客加载／渲染失败时隐藏角色并有限重试，成功后自动恢复；此项收录于 `0.1.0-alpha.2`。
- StarLite for DSH 的 Windows 桌宠、模型库和 DSH 应用事件由独立的 `starlite-dsh` 仓库维护；当前 DSH 禁用 Inochi2D。

模型、其他动作和角色源工程不进入程序包。默认 Idle 的来源、许可和导出记录独立保留；技术检查不代替资产授权。

## 本轮本地验收

本地未发布修复：内嵌动作与外部 VRMA 同时使用时，同一骨骼的 UUID／名称绑定曾互相覆盖，导致动作切换时身体延迟、回摆或瞬间跳回。播放器现统一绑定身份，保留 400 ms 过渡、眨眼／视线控制及原采样数据。已通过 VRM 全部 158 项测试和类型检查，包含双向切换、髋位移、表情及实际 GLTF cubic 采样回归；此项尚未进入公开 npm／GitHub 发行，DSH 设备人工验收另行记录。

`0.1.0-alpha.2` 版本元数据升级后已重新通过完整验证（Rust 26、JavaScript 与 demo 349、Chromium 14，分别有 7／2 项可选外部模型检查跳过）。Linux 和 Windows x64 原生工具已重建并报告同一版本，严格五包发布内容检查通过；日志与精确产物记录位于 `target/release-output/0.1.0-alpha.2/`。这些本地结果不替代托管 CI、公共 registry 安装及真实博客部署检查。

2026-10-15 的源码基线（本版本的实现）已通过完整 `npm run validate`：Rust 26 项、JavaScript 与 demo 349 项通过，7 项外部模型测试跳过；实际 Chromium 14 项通过、2 项外部模型测试跳过。新增验收直接移除 VRM0／1 的可选表达数据，确认仍显示模型、使用内置 Idle，且角色下层链接可实际点击。Hexo 最简配置默认穿透页面输入；明确启用拖动时保留交互。角色配置的默认动作按完整动作目录在生成时校验，不再等浏览器加载后才发现名称错误。错误模型或配置路径会在依赖安装和构建之前给出修正提示。以上修改收录于 `0.1.0-alpha.2`；较早发行版的结果继续保留下方原身份。

版本升级前的四个候选 npm tarball（core、VRM、Inochi2D、Hexo）已在 WSL 隔离目录实际安装到标准 Hexo 7.3.0 站点；锁文件确认使用本地 tarball，已安装包不是工作区符号链接。使用正常 Hexo CLI 与主题渲染验证插件自动发现、资源生成及精确模型副本，再用实际 Chromium 分别验证无可选表达的 VRM0／1：显示与内置 Idle、下层链接点击、手机零模型／运行时请求，以及首次模型请求失败后的自动恢复均通过。检查未访问真实博客或私有模型，临时站点、依赖及本机服务已清理。本项只验证本地候选；新版本的公开 registry 验收另行记录。

`0.1.0-alpha.1` 的单 VRM Hexo 路径完成单元与实际 Chromium 回归：无动作模型获得内置 Idle、纯文字气泡正常、20 次 PJAX 无重复实例、只请求一次模型、手机不请求 VRM／动作／运行时、加载失败出现静态占位。本版本将博客静态占位改为隐藏和有限重试；验收应以新行为为准。单文件体验入口验证精确模型副本、损坏与符号链接拒绝、临时站点清理及保留另一个后端的构建产物。

隐藏与重试的本地浏览器回归已验证运行时导入失败、模型下载失败和运行中 WebGL 上下文丢失后的恢复：下层链接可实际点击，成功后只保留一个画布，已完成的首次入场不重复。离线／隐藏暂停、三次上限、PJAX 共用预算和迟到实例清理有自动覆盖。用户已在本地故障验收页确认：首次模型请求失败时无静态图片、随后自动恢复微光，恢复前后下层按钮均可正常点击。运行中上下文丢失等其余异常分支仅记自动覆盖，不冒充人工验收。本项修复收录于 `0.1.0-alpha.2`，人工结果只涵盖明确列出的检查。

2026-10-14 的运行时基线 `986443cc` 已完成完整 `npm run validate`：Rust 26 项、JavaScript 与 demo 296 项通过，7 项依赖外部真实模型的测试跳过；浏览器 11 项通过、2 项外部模型测试跳过。两种后端构建、lint、typecheck、许可、预算与五包内容检查均通过。共享运行时代码变化后，DSH 必须更新固定 revision 并重建；文档更新不改变运行时基线。自动回归不代替目标设备的视觉与性能验收。

## 公开发行与安装验收

`0.1.0-alpha.2` 于 2026-10-15 08:19:02 UTC 公开为 prerelease。公开 tag、`SOURCE_REVISION` 与发行源码均为 `903fe2cab9e0f37ad36cd904e301fa482af2508e`。[托管 CI](https://github.com/StarCried/starlite/actions/runs/38700801035)及[Linux／Windows 原生与五包构建](https://github.com/StarCried/starlite/actions/runs/38701298960)均通过；正式 CLI 包使用该 CI 的 Windows MSVC／Linux 产物，而非本地 GNU 候选。

已匿名下载全部五个 npm tarball，长度、SHA-256、SHA-512 SRI 与精确 CI 产物一致；五个 `alpha` 均为 `0.1.0-alpha.2`。GitHub 七项公开资产也已实际匿名下载，逐一匹配摘要，公开校验清单使用平铺文件名。逐包哈希见 [validation](validation.md)，完整证据位于 `target/release-output/0.1.0-alpha.2/registry-z2hZbT/publication-proof.json`。

真实博客已从公共 npm 安装本版，并用 Hexo 7.3.0 正常生成 449 个文件。本地内置浏览器验证首页、关于页显示与导航后仍只有一个组件和画布。[Pages 部署](https://github.com/StarCried/StarCried.github.io/actions/runs/38705481249)通过，线上首页、关于页和全部 15 个模型资源均返回 200，匿名下载的运行时 SHA-256 与本地生成文件一致。线上浏览器控制超时，因此不将这些网络检查记为线上视觉人工验收。

### 0.1.0-alpha.1 历史安装验收

发行提交 `a103ca9` 的[托管 CI](https://github.com/StarCried/starlite/actions/runs/38588191042)和[原生产物／五包构建](https://github.com/StarCried/starlite/actions/runs/38588219594)均通过。随后在隔离目录从公共 registry 执行 `npm install hexo@7 hexo-starlite@alpha` 与 `npx --no-install hexo generate`，Hexo 7.3.0 和四个 StarLite 依赖安装正常，均无工作区替代；四包 registry／lock 完整性与该 CI 的 tarball SHA-512 一致。

公开微光博客文件生成后长度和 SHA-256 保持一致，13 个内嵌动作及 profile／许可保留。页面只生成 VRM 后端资源、一个组件和一个启动模块，资源路由哈希重算一致；移动端判断位于运行时导入之前。该项验证实际安装与生成，没有额外重跑浏览器长期测试。

## 使用边界

- `inochi2d-blog` 的原生 CLI 为未签名的实验性 alpha；跨设备性能和用户视觉验收只按实际完成情况记录。
- Hexo 7 是当前验收目标，Hexo 8 尚未单独验收。浏览器目标为桌面 Chrome／Edge、WebGL2。
- 公开本地模型预算为 10 MiB；本机隔离 demo 可验证最多 64 MiB，不能把其预览输出用于部署。
- 外部动作在 ready 前准备好，尚未按需加载。Hexo 插件的安装依赖包含两个后端；浏览器只加载选中的后端。
- 微光从[独立模型发行](https://github.com/StarCried/starlite/releases/tag/weiguang-v3.0.0-starlite.1)取得并遵守随附许可。程序包不含模型，也不会替使用者授予其他资产的托管权。

详细检查及较早的 Inochi2D 与博客数据见 [validation](validation.md)。历史记录保留当时的身份与结果，不作为当前版本的安装输入。
