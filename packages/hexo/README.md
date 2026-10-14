# StarLite for Hexo

把 VRM 角色放到 Hexo 博客，用动作和气泡回应点击，安静陪伴阅读。

## 启动

需要 Node.js 22.12+、Hexo 7 和一个标准人形 VRM。在博客目录安装 alpha 版本：

```sh
npm install hexo-starlite@alpha
```

将有权托管的模型放到博客根目录的 `models/avatar.vrm`（不放进 `source/`），把下面内容加入 `_config.yml`：

```yaml
starlite:
  enable: true
  backend: vrm
  model: ./models/avatar.vrm
  publication:
    confirm: true
    allowRedistribution: true
```

`publication` 两项表示你已确认模型、贴图及内嵌动作允许在博客中托管。公开生成的 VRM 上限为 **10 MiB**。

然后运行：

```sh
npx hexo server
```

打开终端中的网址即可。无动作模型使用内置默认 Idle；内嵌动作自动识别。手机默认不下载模型，加载失败显示静态占位。日常使用沿用原 Hexo 命令。

没有博客？在 StarLite 源码目录运行 `npm run demo -- --model "/path/to/avatar.vrm"`，即可打开隔离的本机示例。

## 进阶

[动作、气泡与性能](https://github.com/StarCried/starlite/blob/main/docs/configuration.md) · [完整配置示例](https://github.com/StarCried/starlite/blob/main/docs/examples/hexo-vrm.yml) · [安装、更新与卸载](https://github.com/StarCried/starlite/blob/main/docs/release-guide.md) · [VRM API](https://github.com/StarCried/starlite/blob/main/packages/vrm/README.md)

BSD-2-Clause；微光模型独立授权，其他模型和动作由使用者按各自许可提供。
