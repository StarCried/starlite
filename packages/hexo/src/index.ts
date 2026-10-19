import { lstatSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import { collectModelAssets, collectVrmModelAssets, collectVrmFileAssets, isLocalVrmFile, collectRuntimeAssets, resolveRuntimeDist } from "./assets";
import { createBootstrapSource } from "./bootstrap";
import { normalizeRoot, readEnabledConfig } from "./config";
import { ensureDefaultAssets } from "./default-assets";
import { isDefaultPreset, resolveDefaultPreset, WEIGUANG_ASSETS, WEIGUANG_CACHE_DIRECTORY } from "./default-preset";
import type { HexoLike, HexoWidgetConfig, ModelAssetBundle, RuntimeAssetBundle } from "./types";

declare const hexo: HexoLike | undefined;

const LOCAL_PREVIEW_ENV = "STARLITE_LOCAL_PREVIEW_TOKEN";

export function registerHexoWidget(instance: HexoLike): void {
  let cachedBundle: RuntimeAssetBundle | undefined;
  let cachedModelBundle: ModelAssetBundle | undefined;
  let localPreviewWarningLogged = false;
  let defaultReady = false;
  let defaultNoticeLogged = false;
  let preparing: Promise<void> | undefined;
  const defaultDirectory = resolve(instance.base_dir ?? process.cwd(), WEIGUANG_CACHE_DIRECTORY);
  const defaultModel = join(defaultDirectory, WEIGUANG_ASSETS[0]!.file);
  const readInput = (): HexoWidgetConfig | undefined => {
    const input = instance.config.starlite;
    if (input !== undefined && (input === null || typeof input !== "object" || Array.isArray(input))) {
      throw new Error("starlite must be a configuration object; use starlite.enable: false to disable it");
    }
    if (input?.enable !== undefined && typeof input.enable !== "boolean") throw new Error("starlite.enable must be true or false");
    if (input?.enable === false) return input;
    if (input?.backend !== undefined && input.backend !== "vrm" && input.backend !== "inochi2d") throw new Error("unknown model backend");
    for (const key of ["model", "bundle"] as const) {
      if (input?.[key] !== undefined && (typeof input[key] !== "string" || !input[key].trim())) {
        throw new Error(`starlite.${key} must be a non-empty path or URL; omit it to use default Weiguang`);
      }
    }
    return input;
  };
  const effectiveInstance = (): HexoLike | undefined => {
    const input = readInput();
    if (input?.enable === false) return undefined;
    if (isDefaultPreset(input) && !defaultReady) return undefined;
    const starlite = isDefaultPreset(input)
      ? resolveDefaultPreset(input, defaultModel)
      : resolveCustomConfig(input!);
    return { ...instance, config: { ...instance.config, starlite } };
  };
  const bundle = (current: HexoLike): RuntimeAssetBundle => (cachedBundle ??= collectRuntimeAssets(resolveRuntimeDist(current.config.starlite?.backend), current.config.starlite?.backend));
  const enabled = () => {
    const current = effectiveInstance();
    if (!current) return undefined;
    const input = current.config.starlite!;
    const bundleLocation = typeof input?.bundle === "string" ? input.bundle.trim() : "";
    const localPreview = input?.enable ? authorizeLocalPreview(current) : false;
    const modelBundle =
      input?.enable && bundleLocation
        ? (cachedModelBundle ??= (input.backend === "vrm" ? collectVrmModelAssets : collectModelAssets)(
            bundleLocation,
            current.base_dir,
            { localPreview },
          ))
        : input?.enable && input.backend === "vrm" && isLocalVrmFile(input.model, current.base_dir)
          ? (cachedModelBundle ??= collectVrmFileAssets(input.model, current.base_dir, {localPreview,animationNames:(input.animations ?? []).map(animation=>animation.name)}))
          : undefined;
    if (localPreview && !localPreviewWarningLogged) {
      instance.log.warn(
        "StarLite local preview: publication rights checks are bypassed only for this isolated local output; deploy is disabled.",
      );
      localPreviewWarningLogged = true;
    }
    return readEnabledConfig(current, modelBundle);
  };

  // Hexo awaits this filter before rendering pages or invoking generators.
  // Model acquisition belongs to generation, never npm installation or visitors.
  instance.extend.filter?.register("before_generate", () => {
    if (preparing) return preparing;
    preparing = (async () => {
      cachedBundle = undefined;
      cachedModelBundle = undefined;
      defaultReady = false;
      if (!isDefaultPreset(readInput())) return;
      try {
        await ensureDefaultAssets(defaultDirectory, WEIGUANG_ASSETS);
      } catch {
        instance.log.warn("StarLite: 无法获取或校验默认微光，本次跳过看板娘，博客继续生成。请检查网络后重新生成；已有有效缓存时无需联网。也可设置 starlite.enable: false 禁用。");
        return;
      }
      defaultReady = true;
      // Validate configured overrides and action names before rendering pages.
      enabled();
      if (!defaultNoticeLogged) {
        instance.log.info?.("StarLite: 默认使用 StarCried 的微光模型；使用即同意独立模型许可，不接受请设置 starlite.enable: false。许可与来源说明随站点模型资源生成。");
        defaultNoticeLogged = true;
      }
    })().finally(() => { preparing = undefined; });
    return preparing;
  });

  instance.extend.generator.register("starlite-widget-assets", () => {
    if (!enabled()) {
      return undefined;
    }
    const current = bundle(effectiveInstance()!);
    const runtimeRoutes = current.assets.map((asset) => ({
      path: `${current.routePrefix}/${asset.relativePath}`,
      data: asset.contents,
    }));
    const modelBundle = cachedModelBundle;
    const modelRoutes = modelBundle?.assets.map((asset) => ({
      path: `${modelBundle.routePrefix}/${asset.relativePath}`,
      data: asset.contents,
    }));
    const notices = isDefaultPreset(instance.config.starlite) && modelBundle
      ? WEIGUANG_ASSETS.slice(1).map(asset => ({
          path: `${modelBundle.routePrefix}/${asset.file}`,
          data: readFileSync(join(defaultDirectory, asset.file)),
        }))
      : [];
    return [...runtimeRoutes, ...(modelRoutes ?? []), ...notices];
  });

  const renderWidget = () => {
    const currentConfig = enabled();
    if (!currentConfig) {
      return undefined;
    }
    const current = bundle(effectiveInstance()!);
    const root = normalizeRoot(instance.config.root);
    const assetBase = `${root}${current.routePrefix}`;
    const bootstrap = createBootstrapSource({
      entryUrl: `${assetBase}/index.js`,
      config: currentConfig.widget,
      breakpoint: currentConfig.breakpoint,
      showOnMobile: currentConfig.showOnMobile,
    });

    return [
      '<div data-starlite-widget-host></div>',
      `<style>[data-starlite-widget-host],[data-starlite-widget-host].model-vrm-widget{position:fixed;right:${currentConfig.position.right}px;bottom:${currentConfig.position.bottom}px;z-index:${currentConfig.position.zIndex}}</style>`,
      `<link rel="stylesheet" href="${escapeHtmlAttribute(assetBase)}/widget.css">`,
      `<script type="module">${bootstrap}</script>`,
    ].join("");
  };
  // Injector.register eagerly evaluates callbacks in Hexo 7. Render the widget
  // through its public HTML filter after asynchronous generation preparation.
  instance.extend.filter?.register("after_render:html", html => {
    if (!/<html\b/iu.test(html) || !/<\/body\s*>/iu.test(html)) return html;
    const clean = html.replace(/<!-- starlite-widget:start -->[\s\S]*?<!-- starlite-widget:end -->/gu, "");
    const widget = renderWidget();
    return widget ? clean.replace(/<\/body\s*>/iu, closing => `<!-- starlite-widget:start -->${widget}<!-- starlite-widget:end -->${closing}`) : clean;
  });
}

/** Choosing another model starts with generic defaults, not Weiguang actions. */
function resolveCustomConfig(input: HexoWidgetConfig): HexoWidgetConfig {
  const backend = input.backend ?? (typeof input.model === "string" && /\.vrm(?:[?#].*)?$/iu.test(input.model) ? "vrm" : undefined);
  return { ...input, enable: input.enable ?? true, ...(backend ? { backend } : {}) } as HexoWidgetConfig;
}

/**
 * Authorize the CLI's local-only preview capability.
 *
 * A copied token is insufficient: Hexo must also be writing below the blog's
 * isolated `.inochi2d/preview` directory, so normal public output cannot use
 * this publication-only bypass.
 */
export function authorizeLocalPreview(instance: HexoLike): boolean {
  const preview = instance.config.starlite?.localPreview;
  if (preview === undefined) {
    return false;
  }
  const token = typeof preview.token === "string" ? preview.token.trim() : "";
  if (!/^[a-f0-9]{64}$/u.test(token)) {
    throw new Error("starlite.localPreview.token is invalid");
  }
  if (process.env[LOCAL_PREVIEW_ENV] !== token) {
    throw new Error("starlite.localPreview is not authorized by the preview CLI");
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
      "starlite.localPreview requires public_dir below .inochi2d/preview",
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
          "starlite.localPreview does not permit symbolic-link path components",
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
