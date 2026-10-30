# @starcried/starlite-core

[简体中文](README.md) · English

Format-neutral playback, lifecycle, dialogue, and host controls for StarLite. This package imports neither Three.js nor Inochi2D WASM. Usually install a backend; it installs core automatically.

```sh
npm install @starcried/starlite-core@alpha
```

## Shared contracts

`ModelController` provides `pause`, `resume`, `getAnimations`, `playAnimation`, `stopAnimation`, `resetCamera`, and `destroy`. Playback resolves as `completed`, `interrupted`, or `stopped`; loops resolve when interrupted or stopped. `ModelMountSlot` cancels replaced loads and destroys late instances. Backend-specific bones, tracks, and parameters stay in their backend.

`DialogueScheduler` handles entrance, occasional interaction, and clicks. `DialogueBubble` provides plain text, ARIA announcements, placement, expiry, and cleanup. Both backends share these components and styling. A host can use bubbles without a model or motion; VRM dialogue can omit `animation` and specify only `lines`.

Optional controller methods include `setDisplaySize`, `setFrameRate`, `setPointerEnabled`, `setBubblesVisible`, and `setPerformanceVisible`. These do not remount the model; hiding bubbles does not stop scheduled motions.

`setDialogueContext(context | null)` temporarily replaces or merges a host library. Context contains `id`, `lines`, optional `animation`, `triggers`, `mode`, and `order`. Sequential click and occasional events share progress. Restoring `null` returns to the original library without remounting or entrance replay. Identical context updates preserve progress.

## Shared settings menu

`QuickSettingsMenu` receives `locale: "en" | "zh-CN"`, tabs, toggles, ranges, selects, and action callbacks. The host owns model hit testing and persistence. `open(x,y)` uses viewport coordinates; `update(options)` preserves selected tab and stable menu position; `close()` and `destroy()` clean up. Observe `starlite-menu-change` through `element` to synchronize a native input region.

`resolveLocale(hostLanguage)` maps Chinese tags to `zh-CN`, other nonempty tags to `en`, and absent input to `zh-CN`. Locale affects built-in menu labels and errors only; caller-provided labels and dialogue remain untouched.

## Motion-bound dialogue

```js
dialogue: {
  click: {
    animations: ["Wave", "Nod"],
    linesByAnimation: {
      Wave: ["Hello!", "Nice to see you."],
      Nod: ["I'm here.", "Go ahead."]
    }
  }
}
```

Each event chooses a motion, then a matching sentence. Names match exactly and are case-sensitive. Pools accept 1–20 unique names; `linesByAnimation` must cover the full pool and contain no unrelated names. Use `lines` for a shared sentence library.

[Configuration](https://github.com/StarCried/starlite/blob/main/docs/configuration.en.md) · [VRM backend](https://github.com/StarCried/starlite/blob/main/packages/vrm/README.en.md)

BSD-2-Clause. No model artwork is included.
