# StarLite for Hexo

[简体中文](README.md) · English

A VRM character for your blog: pointer tracking, motions, and dialogue, with your own model or the default example.

[Try the live demo](https://starcried.github.io/) in a desktop browser.

## Start

Requires Node.js 22.12+ and Hexo 7. In your blog directory:

```sh
npm install hexo-starlite
npx hexo server
```

No StarLite configuration is required: generation downloads the Weiguang example and prepares its motions, dialogue, and display settings. Open the URL shown in the terminal. Continue using your normal Hexo commands; the plugin does not deploy your blog.

Weiguang has [separate model terms](https://github.com/StarCried/starlite/blob/main/docs/weiguang-license.en.md). Use means acceptance. To disable it, add to `_config.yml`:

```yaml
starlite:
  enable: false
```

Right-click the character for size, frame rate, pointer tracking, bubbles, pause, and position controls. Hiding bubbles does not stop motions. Visitor settings stay in that visitor's browser. Use **Show character** to restore a hidden character; Shift + right-click opens the browser menu.

The source version supports English menus and example dialogue: it follows Hexo's `language`, or an explicit `starlite.locale: en`. Custom sentences are kept exactly as written.

## Let an Agent install it

Open a local coding Agent in your blog directory and paste:

```text
Read https://github.com/StarCried/starlite/blob/main/docs/release-guide.en.md
Install hexo-starlite in my Hexo blog. Verify the published version and environment, preserve my configuration, and use the default example only if no custom model is configured.
Generate and preview locally, then give me the URL and configuration path. Do not deploy.
```

## Customize

Put an authorized VRM at `models/avatar.vrm`, outside `source/`:

```yaml
starlite:
  model: ./models/avatar.vrm
  publication:
    confirm: true
    allowRedistribution: true
```

These acknowledgements cover permission to host the model, textures, and embedded motions on your blog. A model with no motion receives the built-in Idle; optional built-in gestures and embedded motions can be mapped to events. Custom models do not inherit Weiguang's character-specific motions or dialogue. Mobile visitors do not download the model by default.

For page-specific sentences, add Markdown front matter:

```yaml
starlite:
  - "Welcome to this page."
  - "Take your time. I'm here."
```

[Configuration and built-in motion names](https://github.com/StarCried/starlite/blob/main/docs/configuration.en.md) · [Installation, update, and removal](https://github.com/StarCried/starlite/blob/main/docs/release-guide.en.md) · [VRM API](https://github.com/StarCried/starlite/blob/main/packages/vrm/README.en.md)

The example downloads from pinned GitHub Release URLs during generation, not npm installation. Assets are verified and cached; visitors load static assets from your blog. There is no telemetry or model API call. Code: BSD-2-Clause. Model artwork and motion sources have separate terms.
