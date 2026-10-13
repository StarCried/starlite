# StarLite for Hexo

把 VRM 角色放到 Hexo 博客中，用动作和气泡回应点击，安静陪伴阅读。

## 启动

需要 Node.js 22.12+、可正常运行的 Hexo 7 博客和单独授权的微光资源 ZIP。**当前 alpha 尚未发布到 npm**，请先按[候选安装说明](https://github.com/StarCried/starlite/blob/feat/dual-model-backends/docs/release-guide.md#2-安装插件)安装；公开发布后只需在博客目录运行：

```sh
npm install hexo-starlite@alpha
```

然后：

1. 将微光 ZIP 解压到博客根目录的 `weiguang/`。
2. 将其中的 `fallback.png` 复制到 `source/images/weiguang.png`。
3. 在博客目录启动：

```sh
npx hexo server --config _config.yml,weiguang/hexo-config.yml
```

打开终端显示的本机网址。资源包已配好模型、动作和句库，无需逐个填写；手机默认不加载模型。生成或部署时沿用相同的 `--config` 参数。

还没有博客？在 StarLite 源码目录运行 `npm run demo -- --bundle "/path/to/Weiguang-v3.0-companion-example.zip"` 即可体验；依赖自动安装，阅读许可后打开本机预览，按 **Ctrl+C** 结束。[体验页启动说明](https://github.com/StarCried/starlite/blob/feat/dual-model-backends/docs/quick-start.md)

## 进阶

[接入、更新与卸载](https://github.com/StarCried/starlite/blob/feat/dual-model-backends/docs/release-guide.md) · [换模型、动作和气泡文案](https://github.com/StarCried/starlite/blob/feat/dual-model-backends/docs/configuration.md) · [配置示例](https://github.com/StarCried/starlite/blob/feat/dual-model-backends/docs/examples/hexo-vrm.yml) · [VRM API](https://github.com/StarCried/starlite/blob/feat/dual-model-backends/packages/vrm/README.md)

程序采用 BSD-2-Clause；微光模型独立授权，模型和动作均须按各自许可使用。使用自己的模型需要自备动作；程序尚不附带通用 Idle。
