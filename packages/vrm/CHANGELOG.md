# @starcried/starlite-vrm

## 0.2.0

### Minor Changes

- 50a84d9: Middle-drag a VRM character to inspect it from different angles, then middle-click to return. Temporarily suspend pointer gaze while preserving animations, dialogue, size changes and host presentation control. Show the entry hint briefly rather than persistently.

### Patch Changes

- a9558f0: Add optional idle tail sway by root bone name, with live amplitude and period adjustments. Preserve model-authored physics and collisions, and expose controls in the local adjustment preview.

  Hexo adopts inspected VRM adjustment defaults when no explicit configuration is supplied; an explicit adjustment object replaces those defaults, including an empty object to clear them.
- Updated dependencies [50a84d9]
  - @starcried/starlite-core@0.2.0

## 0.1.3

### Patch Changes

- 2a26122: Let configured clicks interrupt entrance, occasional and earlier click gestures, with a 500 ms minimum gap. Keep sentences paired with the new response, retain VRM's smooth transitions, and leave application or Agent playback protected until it finishes or is stopped.
- Updated dependencies [2a26122]
  - @starcried/starlite-core@0.1.3
