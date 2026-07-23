import { collectModelAssets, collectRuntimeAssets } from "./assets";
import { createBootstrapSource } from "./bootstrap";
import { normalizeRoot, readEnabledConfig } from "./config";
import type { HexoLike, ModelAssetBundle, RuntimeAssetBundle } from "./types";

declare const hexo: HexoLike | undefined;

export function registerHexoWidget(instance: HexoLike): void {
  let cachedBundle: RuntimeAssetBundle | undefined;
  let cachedModelBundle: ModelAssetBundle | undefined;
  const bundle = (): RuntimeAssetBundle => (cachedBundle ??= collectRuntimeAssets());
  const enabled = () => {
    const input = instance.config.inochi2d_widget;
    const bundleLocation = typeof input?.bundle === "string" ? input.bundle.trim() : "";
    const modelBundle =
      input?.enable && bundleLocation
        ? (cachedModelBundle ??= collectModelAssets(bundleLocation, instance.base_dir))
        : undefined;
    return readEnabledConfig(instance, modelBundle);
  };

  instance.extend.generator.register("inochi2d-widget-assets", () => {
    if (!enabled()) {
      return undefined;
    }
    const current = bundle();
    const runtimeRoutes = current.assets.map((asset) => ({
      path: `${current.routePrefix}/${asset.relativePath}`,
      data: asset.contents,
    }));
    const modelBundle = cachedModelBundle;
    const modelRoutes = modelBundle?.assets.map((asset) => ({
      path: `${modelBundle.routePrefix}/${asset.relativePath}`,
      data: asset.contents,
    }));
    return [...runtimeRoutes, ...(modelRoutes ?? [])];
  });

  instance.extend.injector.register("body_end", () => {
    const currentConfig = enabled();
    if (!currentConfig) {
      return undefined;
    }
    const current = bundle();
    const root = normalizeRoot(instance.config.root);
    const assetBase = `${root}${current.routePrefix}`;
    const bootstrap = createBootstrapSource({
      entryUrl: `${assetBase}/index.js`,
      config: currentConfig.widget,
      breakpoint: currentConfig.breakpoint,
      showOnMobile: currentConfig.showOnMobile,
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
