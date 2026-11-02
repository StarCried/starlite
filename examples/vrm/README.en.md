# Local VRM preview

[简体中文](README.md) · English

Build the workspace first. From the repository root, preview an authorized local model:

```sh
npm run start --workspace @starcried/starlite-vrm-example -- --model /path/to/avatar.vrm
```

Open the printed local URL, or `/adjust?lang=en` for English and `/adjust?lang=zh-CN` for Chinese. With no override, the preview follows your browser language. `--compare-model /path/to/second.vrm` adds a second model; `--port 4183` changes the port.

The adjustment page changes built-in Idle arm lift, palm direction, wrist lift, hand curl, elbow bend, and pointer response. Updates are live and do not rewrite the model. Missing eye/finger bindings disable the corresponding control. The three program gestures (`StarLiteCuriousPeek`, `StarLiteHappyWave`, and `StarLiteSleepyStartle`) also start and end from the adjusted Idle reference pose. Use the motion selector to check these transitions and authored/imported clips, which keep their original poses. Copy exported YAML into your Hexo `_config.yml`; pose changes explicitly select `StarLiteIdle`, while gaze-only changes preserve your current baseline. Refreshing resets unsaved preview settings.

If the VRM contains valid defaults in `extras.starlite.adjustments`, the preview starts with those values and restores them on refresh. Otherwise it uses the general defaults. With a Hexo example preset, an explicit `adjustments` object fully replaces its pose and following calibration; `adjustments: {}` clears it.

For a prepared private companion output directory containing `desktop/manifest.json` and `blog/manifest.json`, developer motion review uses:

```sh
npm run start --workspace @starcried/starlite-vrm-example -- --assets /path/to/private/output
```

The server binds only to `127.0.0.1`. Model files remain outside the repository. Do not publish private artwork or authoring projects; follow the model's license when hosting the final exported VRM.
