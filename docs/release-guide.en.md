# StarLite for Hexo: install and use

[简体中文](release-guide.md) · English

Requires Node.js 22.12+, an existing Hexo 7 blog, and a desktop Chrome/Edge browser with WebGL2. Hexo 8 has not been accepted yet. You do not need Rust, Blender, or an API key.

## Install and start

```sh
npm install hexo-starlite
npx hexo server
```

Run these in the blog directory. Generation automatically fetches the pinned Weiguang example with its 13 authored motions and dialogue. Open the printed URL. The plugin does not deploy your site.

The default npm tag is `latest`. To pin a version, choose it from [Releases](https://github.com/StarCried/starlite/releases) and use `npm install --save-exact hexo-starlite@<version>`, replacing `<version>`. Weiguang's [separate model terms](weiguang-license.en.md) require visible attribution. If you disagree or do not want the companion:

```yaml
starlite:
  enable: false
```

Disabled sites do not download the example or generate companion routes. The default Weiguang preset also skips runtime and model requests below 900 CSS pixels.

## Configure

Edit the blog root's `_config.yml`, not files under `node_modules`. You do not need a separate `dialogue.json`.

```yaml
language: en
starlite:
  locale: en
  render:
    fps: 30
  dialogue:
    click:
      lines: ["Hello! Welcome."]
```

`locale` is optional: the plugin inherits Hexo's `language`, using Chinese for Chinese tags, English for other nonempty tags, and Chinese when no language is set. An explicit locale accepts `en` or `zh-CN`. It controls interface labels and shipped example text, never translates your sentences, and introduces no translation service or network requests. Rebuild after changing it.

[Full configuration](configuration.en.md) explains animations, per-page lines, display, performance, and model adjustments. Refer to that guide for example presets and custom-model defaults.

Visitors can drag the character away from content and use its hover toolbar to resize it, hide bubbles, or temporarily hide the character. Size adapts to the visible viewport; hiding bubbles keeps animations active. The full right-click menu retains detailed settings and **Reset position**. Preferences stay in the visitor's browser. Short clicks still reach the page; dragging starts beyond six CSS pixels. See the [cross-origin comment-frame limitation](configuration.en.md#failure-handling-and-visitor-settings) before placing the character over an embedded comment area.

## Your own model

Place a self-contained VRM 0/1 outside `source/`, for example `models/avatar.vrm`:

```yaml
starlite:
  model: ./models/avatar.vrm
  publication:
    confirm: true
    allowRedistribution: true
```

The plugin checks the model and produces hashed assets. The public per-model size limit is **10 MiB**; it does not automatically decimate meshes or compress textures. Publication acknowledgements apply to the model, textures, and embedded motions. An optional `publication.sourceSha256` can pin a reviewed file. These switches are neither a license nor extraction prevention: browsers must receive model bytes.

Standard humanoid bindings are required. Blink and lookAt bindings are optional. No-motion models get `StarLiteIdle`; optional built-in gestures can be mapped as described in the configuration guide. An authored `Idle` is preferred if present. Custom models do not inherit Weiguang-specific settings or sentences. Generic defaults are 30 FPS, DPR cap 1.5, and mobile breakpoint 768 px.

## Downloads, cache, and recovery

No model downloads occur during npm installation. During generation, selected examples are fetched with HTTPS GET from pinned resources under `github.com/StarCried/starlite/releases/download/`. Allowed resource hosts include `github.com`, `objects.githubusercontent.com`, and `release-assets.githubusercontent.com`. Length and SHA-256 are checked. The pinned catalog is in `packages/hexo/src/default-preset.ts` and `bluefish-preset.ts`.

The cache is under `node_modules/.cache/hexo-starlite/<example-version>/`. A verified cache permits offline generation. Only the selected example downloads; custom `model` configuration or `enable: false` skips example downloads. Standard `HTTP_PROXY`, `HTTPS_PROXY`, and `NO_PROXY` environment settings apply. Do not commit proxy credentials.

Visitors fetch generated static resources from your blog or configured CDN, not from the example's GitHub URL. The plugin sends no visitor data, telemetry, balance query, or model API request.

If generation cannot fetch or verify an example, it logs a warning and builds the blog without the companion. Correct the network problem and generate again. Browser loading/rendering failures hide the character and preserve underlying clicks; retries occur after 2, 5, and 15 seconds, at most three times per document. Success restores the model. Offline/hidden/mobile guards remain in force. PJAX retains one instance; full navigation remounts, with entrance remembered within the tab. CSP must allow `blob:` for embedded textures.

## Preview before deployment

```sh
npx hexo clean
npx hexo generate
npx hexo server -p 4000
```

Check article readability, materials, pose, gaze, clicks and dialogue, idle interactions, page navigation, and click-through behavior. Check that large gestures are not clipped. Mobile-sized pages should not download the runtime or model. Then deploy using your normal Hexo process.

## Update or remove

Update with `npm install hexo-starlite`, regenerate, and preview. Existing configuration is not rewritten. To use the default example instead of a custom model, remove the `model`/`bundle` fields and obsolete model-specific mappings. Recheck rights and any pinned hash when replacing a model.

Disable with `starlite.enable: false`, or uninstall:

```sh
npm uninstall hexo-starlite
```

Remove obsolete StarLite configuration, model files, and its dedicated cache only. Run `hexo clean` and regenerate to remove stale model routes. Do not delete assets other features still use.
