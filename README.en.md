# StarLite

[简体中文](README.md) · English

Bring your own VRM character to a blog or desktop. Let it follow your pointer and respond to clicks and application events with motions and bubbles.

**[Try the live demo](https://starcried.github.io/)** in a desktop browser. No installation required; the character is hidden on mobile by default.

## Try it on Hexo

In an existing Hexo 7 blog, with Node.js 22.12 or later:

```sh
npm install hexo-starlite
npx hexo server
```

No StarLite configuration is required. The first generation downloads the separately licensed Weiguang example with its motions and dialogue. Open the address printed in your terminal. The companion uses the blog's `language`; set `starlite.locale: en` to override it. Using Weiguang means accepting its [model terms](docs/weiguang-license.en.md). To disable the companion:

```yaml
starlite:
  enable: false
```

## Bring your own character

Put a VRM you may host at `models/avatar.vrm`, outside Hexo's `source/` directory:

```yaml
starlite:
  model: ./models/avatar.vrm
  publication:
    confirm: true
    allowRedistribution: true
```

A standard humanoid VRM works without authored animations: StarLite supplies a relaxed Idle with breathing and limited head tracking. Blink and eye tracking use the model's optional standard bindings. StarLite also provides optional curious-peek, happy-wave, and sleepy-startle motions for humanoid models; assign them only where wanted. Character artwork is downloaded separately from the program.

## Let an Agent help

Open a local coding Agent in your blog directory and paste:

```text
Read https://github.com/StarCried/starlite/blob/main/docs/release-guide.en.md
Install hexo-starlite in my Hexo blog. Check the published version and prerequisites first, and preserve my existing configuration.
Use the default Weiguang example if I have no custom model. Generate the blog and start a local preview. Tell me the preview URL and configuration location. Do not deploy the blog.
```

To ask for an explanation without installation:

```text
Read https://github.com/StarCried/starlite/blob/main/docs/release-guide.en.md
and https://github.com/StarCried/starlite/blob/main/docs/configuration.en.md
Explain how to start StarLite, replace the model, and customize dialogue. Do not install, edit, or deploy anything.
```

## Choose your host

- **Hexo:** [installation and usage](packages/hexo/README.en.md).
- **DeepSeek Harness:** [StarLite for DSH](https://github.com/StarCried/starlite-dsh/blob/main/README.en.md). Install `dsh-starlite`; the Windows companion starts with DSH.
- **Custom integration:** [VRM runtime API](packages/vrm/README.en.md) and [shared components](packages/core/README.en.md).

[Configuration](docs/configuration.en.md) · [Upgrade and troubleshooting](docs/release-guide.en.md) · [Development](docs/development.md)

Program code is [BSD-2-Clause](LICENSE). Models and motions retain their own licenses. [Weiguang](docs/weiguang-license.en.md) and [BlueFish](docs/bluefish-license.en.md) are optional, separately licensed examples.
