import { lstatSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import { collectModelAssets, collectRuntimeAssets } from "./assets";
import { createBootstrapSource } from "./bootstrap";
import { normalizeRoot, readEnabledConfig } from "./config";
import type { HexoLike, ModelAssetBundle, RuntimeAssetBundle } from "./types";

declare const hexo: HexoLike | undefined;

const LOCAL_PREVIEW_ENV = "INOCHI2D_LOCAL_PREVIEW_TOKEN";

export function registerHexoWidget(instance: HexoLike): void {
  let cachedBundle: RuntimeAssetBundle | undefined;
  let cachedModelBundle: ModelAssetBundle | undefined;
  let localPreviewWarningLogged = false;
  const bundle = (): RuntimeAssetBundle => (cachedBundle ??= collectRuntimeAssets());
  const enabled = () => {
    const input = instance.config.inochi2d_widget;
    const bundleLocation = typeof input?.bundle === "string" ? input.bundle.trim() : "";
    const localPreview = input?.enable ? authorizeLocalPreview(instance) : false;
    const modelBundle =
      input?.enable && bundleLocation
        ? (cachedModelBundle ??= collectModelAssets(
            bundleLocation,
            instance.base_dir,
            { localPreview },
          ))
        : undefined;
    if (localPreview && !localPreviewWarningLogged) {
      instance.log.warn(
        "Inochi2D local preview: publication rights checks are bypassed only for this isolated local output; deploy is disabled.",
      );
      localPreviewWarningLogged = true;
    }
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
      `<link rel="stylesheet" href="${escapeHtmlAttribute(assetBase)}/widget.css">`,
      `<script type="module">${bootstrap}</script>`,
    ].join("");
  });
}

/**
 * Authorize the CLI's local-only preview capability.
 *
 * A copied token is insufficient: Hexo must also be writing below the blog's
 * isolated `.inochi2d/preview` directory, so normal public output cannot use
 * this publication-only bypass.
 */
export function authorizeLocalPreview(instance: HexoLike): boolean {
  const preview = instance.config.inochi2d_widget?.localPreview;
  if (preview === undefined) {
    return false;
  }
  const token = typeof preview.token === "string" ? preview.token.trim() : "";
  if (!/^[a-f0-9]{64}$/u.test(token)) {
    throw new Error("inochi2d_widget.localPreview.token is invalid");
  }
  if (process.env[LOCAL_PREVIEW_ENV] !== token) {
    throw new Error("inochi2d_widget.localPreview is not authorized by the preview CLI");
  }

  const baseDirectory = resolve(instance.base_dir ?? process.cwd());
  const configuredPublicDirectory =
    instance.public_dir ??
    instance.config.public_dir ??
    resolve(baseDirectory, "public");
  const publicDirectory = isAbsolute(configuredPublicDirectory)
    ? resolve(configuredPublicDirectory)
    : resolve(baseDirectory, configuredPublicDirectory);
  const previewRoot = resolve(baseDirectory, ".inochi2d", "preview");
  if (!isInside(previewRoot, publicDirectory)) {
    throw new Error(
      "inochi2d_widget.localPreview requires public_dir below .inochi2d/preview",
    );
  }
  rejectSymlinkComponents(baseDirectory, publicDirectory);
  return true;
}

function rejectSymlinkComponents(parent: string, child: string): void {
  const path = relative(parent, child);
  let current = parent;
  for (const component of path.split(sep)) {
    current = join(current, component);
    try {
      if (lstatSync(current).isSymbolicLink()) {
        throw new Error(
          "inochi2d_widget.localPreview does not permit symbolic-link path components",
        );
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return;
      }
      throw error;
    }
  }
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function isInside(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return (
    path.length > 0 &&
    path !== ".." &&
    !path.startsWith(`..${sep}`) &&
    !isAbsolute(path)
  );
}

if (typeof hexo !== "undefined") {
  registerHexoWidget(hexo);
}

export type { HexoLike, HexoWidgetConfig } from "./types";
