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

export type AnimationInterpolation =
  | "nearest"
  | "stepped"
  | "linear"
  | "cubic";

export interface AnimationKeyframe {
  frame: number;
  value: number;
  tension: number;
}

export interface AnimationLane {
  parameter: string;
  axis?: ParameterAxis;
  /** Full model parameter default, preserving the untouched vector axis. */
  defaultValues: readonly [number, number];
  interpolation: AnimationInterpolation;
  keyframes: readonly AnimationKeyframe[];
}

/** Browser-ready animation data extracted from a Creator model by the pipeline. */
export interface AnimationClip {
  name: string;
  timestepMs: number;
  length: number;
  leadIn: number;
  leadOut: number;
  weight: number;
  lanes: readonly AnimationLane[];
}

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
  /** Validated clips emitted by inochi2d-pipeline; do not hand-author in production. */
  animations?: readonly AnimationClip[];
  parameters?: Partial<ParameterIds>;
  interactions?: {
    pointer?: boolean;
    click?:
      | false
      | {
          /** Exact, case-sensitive animation name embedded in the model. */
          animation?: string;
        };
    drag?: boolean;
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
  animations: ReadonlyMap<string, AnimationClip>;
  parameters: ResolvedParameterBindings;
  interactions: {
    pointer: boolean;
    click: false | { animation: string };
    drag: boolean;
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
