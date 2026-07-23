import type { WidgetConfig } from "inochi2d-web" with { "resolution-mode": "import" };

export interface HexoWidgetConfig extends Omit<WidgetConfig, "fallback" | "model"> {
  enable?: boolean;
  model?: string;
  fallback?: string;
  network?: {
    requestTimeoutMs?: number;
    modelMaxBytes?: number;
  };
  /** Directory containing manifest.json and assets emitted by inochi2d-pipeline. */
  bundle?: string;
  publication?: {
    /** Explicit acknowledgement that the operator may publish this model and fallback. */
    confirm?: boolean;
    /** Exact source model digest reviewed by the operator. */
    sourceSha256?: string;
    /** Explicit attestation that redistribution through the public blog is allowed. */
    allowRedistribution?: boolean;
  };
}

export interface HexoLike {
  base_dir?: string;
  config: {
    root?: string;
    inochi2d_widget?: HexoWidgetConfig;
  };
  extend: {
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
  hash: string;
  routePrefix: string;
  modelFile: string;
  fallbackFile?: string;
  sourceSha256: string;
  /** Parameter bindings inferred from the pipeline manifest. */
  suggestedParameters?: NonNullable<WidgetConfig["parameters"]>;
  assets: RuntimeAsset[];
}
