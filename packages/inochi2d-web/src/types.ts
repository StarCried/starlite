export type WidgetStatus =
  | "disabled"
  | "loading"
  | "running"
  | "paused"
  | "fallback"
  | "destroyed";

export interface Inochi2dWasmRuntime {
  loadModel(bytes: Uint8Array): void;
  setParameterScalar(id: string, value: number): void;
  setParameterVector(id: string, x: number, y: number): void;
  setCameraTransform(x: number, y: number, scale: number): void;
  resize(width: number, height: number, devicePixelRatio: number): void;
  renderFrame(timestampMs: number): void;
  destroy(): void;
}

export type RuntimeFactory = (
  canvas: HTMLCanvasElement,
  options: { initialScale: number },
  signal?: AbortSignal,
) => Promise<Inochi2dWasmRuntime>;

export type ParameterAxis = "x" | "y";

/** Maps one semantic motion channel to a puppet parameter. */
export interface ParameterTarget {
  id: string;
  /** Selects an axis when the target is a two-dimensional parameter. */
  axis?: ParameterAxis;
  /** Applied before offset, allowing inversion and per-target calibration. */
  scale?: number;
  offset?: number;
}

export type ParameterBinding =
  | string
  | ParameterTarget
  | readonly (string | ParameterTarget)[]
  | null;

/**
 * Semantic motion channels. Strings retain the original one-to-one API;
 * richer targets support vectors, inversion, and one-to-many bindings.
 */
export interface ParameterIds {
  breath: ParameterBinding;
  eyeOpenLeft: ParameterBinding;
  eyeOpenRight: ParameterBinding;
  eyeX: ParameterBinding;
  eyeY: ParameterBinding;
  headX: ParameterBinding;
  headY: ParameterBinding;
  bodyX: ParameterBinding;
  click: ParameterBinding;
}

export interface ResolvedParameterTarget {
  id: string;
  axis?: ParameterAxis;
  scale: number;
  offset: number;
}

export type ResolvedParameterBindings = {
  [Channel in keyof ParameterIds]: readonly ResolvedParameterTarget[];
};

export interface WidgetConfig {
  model: string;
  fallback: string;
  network?: {
    requestTimeoutMs?: number;
    modelMaxBytes?: number;
  };
  display?: {
    width?: number;
    height?: number;
  };
  render?: {
    fps?: number;
    maxDevicePixelRatio?: number;
    initialScale?: number;
  };
  mobile?: {
    show?: boolean;
    breakpoint?: number;
  };
  parameters?: Partial<ParameterIds>;
  interactions?: {
    pointer?: boolean;
    click?: boolean;
    drag?: boolean;
    clickAmplitude?: number;
    dragModelUnitsPerPixel?: number;
  };
}

export interface ResolvedWidgetConfig {
  model: string;
  fallback: string;
  network: {
    requestTimeoutMs: number;
    modelMaxBytes: number;
  };
  display: {
    width: number;
    height: number;
  };
  render: {
    fps: number;
    maxDevicePixelRatio: number;
    initialScale: number;
  };
  mobile: {
    show: boolean;
    breakpoint: number;
  };
  parameters: ResolvedParameterBindings;
  interactions: {
    pointer: boolean;
    click: boolean;
    drag: boolean;
    clickAmplitude: number;
    dragModelUnitsPerPixel: number;
  };
}

export interface WidgetController {
  readonly status: WidgetStatus;
  pause(): void;
  resume(): void;
  setParameter(id: string, value: number | readonly [number, number]): void;
  resetCamera(): void;
  destroy(): void;
}

export interface WidgetDependencies {
  fetchModel(
    url: string,
    options?: {
      signal?: AbortSignal;
      maximumBytes?: number;
    },
  ): Promise<Uint8Array>;
  createRuntime: RuntimeFactory;
  requestFrame(callback: FrameRequestCallback): number;
  cancelFrame(handle: number): void;
  isMobile(query: string): boolean;
  prefersReducedMotion(): boolean;
  isWebGl2Available(canvas: HTMLCanvasElement): boolean;
  devicePixelRatio(): number;
  createResizeObserver(callback: ResizeObserverCallback): ResizeObserver | undefined;
  random(): number;
}
