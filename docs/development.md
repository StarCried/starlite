# StarLite 开发

用户先看[一命令体验](quick-start.md)和 [Hexo 安装说明](release-guide.md)。本页用于源码开发和维护。

## 结构

[架构与包职责](architecture.md)记录完整目录与依赖关系。运行时仓库为 `starlite`，桌宠仓库为 `starlite-dsh`；角色资源独立于程序包。

公共组件包括 `@starcried/starlite-core`、`@starcried/starlite-vrm`、`hexo-starlite`；Inochi2D 为 `@starcried/starlite-inochi2d`。开发示例使用合成资产，微光等源工程和真实模型不能进入代码仓库或 npm 产物。

## 工具与检查

JavaScript 工具链要求见根 [package.json](../package.json)。完整 Inochi2D／原生验证另需 Rust、LLD、Binaryen 和 curl，版本与来源按 [upstream](upstream.md) 固定。发布工具及预检见 [发布流程](releasing.md)。

```sh
npm ci
npm run validate
npm run test:browser
git diff --check
```

完整验证构建两种后端与原生工具，范围比一命令 VRM 体验大。体验工具只安装并构建必要的 JavaScript，不启动 DSH，不要求编译 WASM，也不修改真实博客。

默认 Idle、无动作导入和独立气泡的实现状态见 [status](status.md)，不要根据目标描述提前承诺已经交付。当前浏览器目标为桌面 Chrome／Edge 和 WebGL2；实际性能仍在目标设备验收。

## 维护入口

[稳定化验收](stabilization.md) · [性能预算](performance.md) · [模型兼容](model-compatibility.md) · [依赖维护](dependency-audit.md)

[配置](configuration.md) · [发布流程](releasing.md) · [历史验证](validation.md) · [CI](ci.md) · [模型和动作政策](model-policy.md) · [第三方声明](../THIRD_PARTY_NOTICES.md) · [安全政策](../SECURITY.md)

构建、源码推送、npm 发布、角色分发和博客部署分别执行；体验命令不执行任何发布操作。

## 完成一个变更

把行为变更、必要测试和受影响的用户说明放在同一变更中；新增功能和修复用 `npm exec changeset` 写一段面向用户的变化说明。文档整理或内部维护没有可发布的行为变化时，不必为了走流程增加版本。版本分组、准备和发行使用 [发布流程](releasing.md) 中的固定命令。

维护代码按职责命名。当前说明只描述当前行为；完成的计划和验收结果留在对应发行记录。涉及渲染、模型与交互约束时读取 [工程约定](engineering-contracts.md)，无需把每次排查经过追加到 AGENTS.md。
