import type {
  AnimationClip,
  WidgetConfig,
} from "@starcried/starlite-inochi2d" with { "resolution-mode": "import" };

import type { VrmWidgetConfig, VrmAnimationSource } from "@starcried/starlite-vrm" with {"resolution-mode":"import"};
export type BrowserWidgetConfig = WidgetConfig | VrmWidgetConfig;
export type HexoWidgetConfig = HexoWidgetOptions & (
  Omit<WidgetConfig, "fallback" | "model"> |
  (Omit<VrmWidgetConfig, "fallback" | "model" | "backend"> & {backend?:"vrm"})
);
export interface HexoWidgetOptions {
  enable?: boolean;
  /** Defaults for article/page front-matter dialogue, not the global library. */
  pageDialogue?: PageDialogueDefaults;
  /** Fixed placement in CSS pixels; applies only to the Hexo host. */
  position?: { right?: number; bottom?: number; zIndex?: number };
  model?: string;
  fallback?: string;
  network?: {
    requestTimeoutMs?: number;
    modelMaxBytes?: number;
  };
  /** Advanced prepared asset directory; direct VRM files need no manifest. */
  bundle?: string;
  publication?: {
    /** Explicit acknowledgement that the operator may publish this model and fallback. */
    confirm?: boolean;
    /** Exact source model digest reviewed by the operator. */
    sourceSha256?: string;
    /** Explicit attestation that redistribution through the public blog is allowed. */
    allowRedistribution?: boolean;
  };
  /**
   * Internal capability used only by `inochi2d-blog preview`.
   * It is accepted only when Hexo writes below `.inochi2d/preview` and the
   * matching one-time token is present in the child process environment.
   */
  localPreview?: {
    token?: string;
  };
}

export interface PageDialogueDefaults {
  animation?: string;
  triggers?: readonly ("click" | "idle")[];
  mode?: "replace" | "merge";
  order?: "sequential" | "random";
}
export type PageDialogueInput = readonly string[] | (PageDialogueDefaults & {lines: readonly string[]});
export interface RenderedPage {
  content?: string;
  more?: string;
  path?: string;
  source?: string;
  starlite?: unknown;
}

export interface HexoLike {
  base_dir?: string;
  public_dir?: string;
  model?(name: "Post" | "Page"): {toArray(): RenderedPage[]};
  config: {
    root?: string;
    public_dir?: string;
    starlite?: HexoWidgetConfig;
  };
  extend: {
    filter?: {
      register(name: "before_generate", filter: () => Promise<void>, priority?: number): void;
      register(name: "after_render:html", filter: (html: string) => string): void;
      register(name: "after_post_render", filter: (page: RenderedPage) => RenderedPage, priority?: number): void;
    };
    generator: {
      register(
        name: string,
        generator: () => Array<{ path: string; data: Buffer }> | undefined,
      ): void;
    };
    injector: {
      register(point: "body_end", injector: () => string | undefined, layout?: string): void;
    };
  };
  log: {
    warn(message: string): void;
    info?(message: string): void;
  };
}

export interface RuntimeAsset {
  relativePath: string;
  contents: Buffer;
}

export interface RuntimeAssetBundle {
  hash: string;
  routePrefix: string;
  assets: RuntimeAsset[];
}

export interface ModelAssetBundle {
  backend?: "inochi2d" | "vrm";
  vrm?: {animations: VrmAnimationSource[]; embeddedAnimations?: string[]; neutralAnimation?: string; profile?: string};
  hash: string;
  routePrefix: string;
  modelFile: string;
  fallbackFile?: string;
  sourceSha256: string;
  /** Parameter bindings inferred from the pipeline manifest. */
  suggestedParameters?: NonNullable<WidgetConfig["parameters"]>;
  /** Safe procedural ambient motion inferred from conventional rig names. */
  suggestedAmbient?: NonNullable<WidgetConfig["ambient"]>;
  /** Strictly validated clips extracted from the same immutable model. */
  animations: readonly AnimationClip[];
  /** True only for an isolated, CLI-authorized local preview output. */
  localPreview?: boolean;
  assets: RuntimeAsset[];
}
