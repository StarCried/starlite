# @starcried/starlite-core

StarLite 的公共播放契约、生命周期和气泡组件。该包不导入 Three.js 或 Inochi2D WASM；宿主先选择后端，再加载对应运行时。

在 Node.js 22.12+ 项目中安装 alpha 版本：

```sh
npm install @starcried/starlite-core@alpha
```

通常直接安装所需后端，它会自动安装本包。

## 公共能力

`ModelController` 提供 `pause`、`resume`、`getAnimations`、`playAnimation`、`stopAnimation`、`resetCamera` 和 `destroy`。动作 Promise 的结束结果为 `completed`、`interrupted` 或 `stopped`；循环在中断或停止后结束等待。

`ModelMountSlot` 中止被替换的加载，并销毁迟到的实例。动作载荷、骨骼和参数属于后端，公共层只交换动作名称、时长和播放结果。

`DialogueScheduler` 管理首次入场、偶发小动作和点击回应；`DialogueBubble` 管理纯文本、ARIA 状态提示、边缘位置、过期和清理。两个后端共用该组件与样式。气泡可由宿主独立调用，无需模型或动作；VRM 的声明式场景也可省略 `animation`，仅配置 `lines` 显示句子，不打断待机。

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

[完整配置](https://github.com/StarCried/starlite/blob/main/docs/configuration.md) · [组件结构](https://github.com/StarCried/starlite/blob/main/docs/architecture.md) · [VRM 后端](https://github.com/StarCried/starlite/blob/main/packages/vrm/README.md) · [Inochi2D 后端](https://github.com/StarCried/starlite/blob/main/packages/inochi2d/README.md)

BSD-2-Clause；不包含模型、角色素材或第三方动作。
