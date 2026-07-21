import type { WidgetConfig } from "inochi2d-web" with { "resolution-mode": "import" };

export interface HexoWidgetConfig extends WidgetConfig {
  enable?: boolean;
}

export interface HexoLike {
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
