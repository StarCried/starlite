# @starcried/starlite-core

StarLite 的公共播放契约、生命周期和气泡组件。该包不导入 Three.js 或 Inochi2D WASM；宿主先选择后端，再加载对应运行时。

当前是尚未发布到 npm 的 alpha 候选。候选包安装见[安装说明](https://github.com/StarCried/starlite/blob/feat/dual-model-backends/docs/release-guide.md)。

## 公共能力

`ModelController` 提供 `pause`、`resume`、`getAnimations`、`playAnimation`、`stopAnimation`、`resetCamera` 和 `destroy`。动作 Promise 的结束结果为 `completed`、`interrupted` 或 `stopped`；循环在中断或停止后结束等待。

`ModelMountSlot` 中止被替换的加载，并销毁迟到的实例。动作载荷、骨骼和参数属于后端，公共层只交换动作名称、时长和播放结果。

`DialogueScheduler` 管理首次入场、偶发小动作和点击回应；`DialogueBubble` 管理纯文本、ARIA 状态提示、边缘位置、过期和清理。两个后端共用该组件与样式。底层气泡可由宿主直接调用；当前声明式 `dialogue` 场景仍需配置有效动作，独立气泡的应用配置将在后续完善。

## 语句与动作绑定

```ts
dialogue: {
  click: {
    animation: "Wave",
    animations: ["Wave", "Nod"],
    linesByAnimation: {
      Wave: ["你好！", "很高兴见到你。"],
      Nod: ["我在这里。", "继续吧。"]
    }
  }
}
```

每次先选择一个动作，再从该动作的句子中随机选择。动作名称精确匹配且区分大小写；动作池允许 1–20 个不同名称。`linesByAnimation` 必须覆盖整个动作池，且不能包含池外名称；也可用 `lines` 提供共用语句库。

## 进阶

[完整配置](https://github.com/StarCried/starlite/blob/feat/dual-model-backends/docs/configuration.md) · [组件结构](https://github.com/StarCried/starlite/blob/feat/dual-model-backends/docs/architecture.md) · [VRM 后端](https://github.com/StarCried/starlite/blob/feat/dual-model-backends/packages/vrm/README.md) · [Inochi2D 后端](https://github.com/StarCried/starlite/blob/feat/dual-model-backends/packages/inochi2d/README.md)

BSD-2-Clause；不包含模型、角色素材或第三方动作。
