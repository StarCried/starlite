import { collectRuntimeAssets } from "./assets";
import { createBootstrapSource } from "./bootstrap";
import { normalizeRoot, readEnabledConfig } from "./config";
import type { HexoLike, RuntimeAssetBundle } from "./types";

declare const hexo: HexoLike | undefined;

export function registerHexoWidget(instance: HexoLike): void {
  let cachedBundle: RuntimeAssetBundle | undefined;
  const bundle = (): RuntimeAssetBundle => (cachedBundle ??= collectRuntimeAssets());

  instance.extend.generator.register("inochi2d-widget-assets", () => {
    if (!readEnabledConfig(instance)) {
      return undefined;
    }
    const current = bundle();
    return current.assets.map((asset) => ({
      path: `${current.routePrefix}/${asset.relativePath}`,
      data: asset.contents,
    }));
  });

  instance.extend.injector.register("body_end", () => {
    const enabled = readEnabledConfig(instance);
    if (!enabled) {
      return undefined;
    }
    const current = bundle();
    const root = normalizeRoot(instance.config.root);
    const assetBase = `${root}${current.routePrefix}`;
    const bootstrap = createBootstrapSource({
      entryUrl: `${assetBase}/index.js`,
      config: enabled.widget,
      breakpoint: enabled.breakpoint,
      showOnMobile: enabled.showOnMobile,
    });

    return [
      '<div data-inochi2d-widget-host></div>',
      `<link rel="stylesheet" href="${assetBase}/widget.css">`,
      `<script type="module">${bootstrap}</script>`,
    ].join("");
  });
}

if (typeof hexo !== "undefined") {
  registerHexoWidget(hexo);
}

export type { HexoLike, HexoWidgetConfig } from "./types";
