# StarLite 支持范围

公开版本与变更见 [Releases](https://github.com/StarCried/starlite/releases) 和 [CHANGELOG](../CHANGELOG.md)。本页只说明支持范围；安装见 [Hexo 指南](release-guide.md)，维护发布见 [发布流程](releasing.md)。

## 模型与组件

- 支持标准人形 VRM 0／1。无动作模型可使用内置 Idle、呼吸和限角头部跟随；眨眼与眼球跟随取决于模型的可选绑定。
- 内嵌动作、外部 VRMA 和程序提供的通用动作可按需映射。共享核心提供生命周期、播放契约、气泡、句库调度及访客控件，不依赖渲染后端。
- Inochi2D 为独立后端；格式与 SDK 限制见 [SDK 说明](upstream.md)。Windows 桌宠由 [starlite-dsh](https://github.com/StarCried/starlite-dsh) 维护，DSH 只启用 VRM。
- 微光和蓝色大肥鱼为独立授权的示例。程序许可不涵盖模型素材；固定资源与授权来源见 [安装指南](release-guide.md#下载缓存与加载失败)。

## 平台与限制

- Hexo 7、桌面 Chrome／Edge、WebGL2。Hexo 8、Firefox／Safari 尚未单独验收；手机默认不请求模型和运行时。
- 页面正文优先，PJAX 保留单实例；加载失败隐藏角色并有限重试。完整文档导航需要重新挂载，同一标签页不重复首次入场。
- 访客可拖动、缩放、关闭气泡或暂时隐藏角色；跨站 iframe 上重新起拖的限制见 [交互说明](configuration.md#访客快捷操作与身体拖动)。
- 模型大小、默认配置与公开托管限制以 [配置参考](configuration.md)为准。外部动作在 ready 前准备，尚未按需加载；浏览器只加载所选后端，npm 安装包含两种后端。
- `inochi2d-blog` 是独立版本的实验性原生 CLI，原生产物未签名。

性能说明见 [性能预算](performance.md)，依赖例外见 [依赖审计](dependency-audit.md)。历史测量和人工验收见 [验证索引](validation.md)；这些记录不代表当前版本在所有设备上的性能保证。
