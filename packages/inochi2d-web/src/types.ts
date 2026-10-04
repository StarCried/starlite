import type { ModelController } from "model-widget-core";
export type WidgetStatus =
  | "disabled"
  | "loading"
  | "running"
  | "paused"
  | "fallback"
  | "destroyed";

export interface ModelBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Inochi2dWasmRuntime {
  loadModel(bytes: Uint8Array): void;
  /** Neutral-pose bounds from SDK draw vertices, when the runtime can expose them. */
  modelBounds?(): ModelBounds | undefined;
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

export type AnimationPlaybackMode = "once" | "loop";

export interface AnimationPlaybackOptions {
  /** Plays through once by default; loops use the Creator lead-in/out region. */
  mode?: AnimationPlaybackMode;
  /** Restart an identical active clip instead of sharing its current playback. */
  restart?: boolean;
}

export type AnimationPlaybackResult =
  | "completed"
  | "interrupted"
  | "stopped";

export interface ModelAnimationInfo {
  name: string;
  durationMs: number;
}

export interface AmbientAnimationConfig {
  /**
   * Exact, case-sensitive names of model-authored clips that remain looping.
   * Loop clips may target different parameters or different vector axes.
   */
  animations?: readonly string[];
  /** Procedural sine-wave parameters, such as a continuously swaying tail. */
  parameters?: readonly AmbientParameterOscillatorConfig[];
}

export interface AmbientParameterOscillatorConfig {
  /** Exact, case-sensitive model parameter name. */
  id: string;
  /** Required for one axis of a two-dimensional parameter. */
  axis?: ParameterAxis;
  minimum: number;
  maximum: number;
  /** Duration of one complete sine-wave cycle. */
  periodMs: number;
  /** Cycle offset in the inclusive 0..1 range. */
  phase?: number;
}

export interface ResolvedAmbientParameterOscillator {
  id: string;
  axis?: ParameterAxis;
  minimum: number;
  maximum: number;
  periodMs: number;
  phase: number;
}

export interface DialogueSceneConfig {
  /** Exact, case-sensitive animation name embedded in the model. */
  animation: string;
  /** Optional pool, sampled independently on each trigger. */
  animations?: readonly string[];
  /** Plain-text sentence library. HTML is never interpreted. */
  lines: readonly string[];
  /** How long the selected sentence remains visible. */
  durationMs?: number;
}

export interface EnterDialogueSceneConfig extends DialogueSceneConfig {
  /** Delay after the model's first successfully rendered frame. */
  delayMs?: number;
}

export interface IdleDialogueSceneConfig extends DialogueSceneConfig {
  /** Inclusive lower bound for the randomized idle interval. */
  intervalMinMs?: number;
  /** Inclusive upper bound for the randomized idle interval. */
  intervalMaxMs?: number;
}

export interface DialogueConfig {
  enter?: false | EnterDialogueSceneConfig;
  idle?: false | IdleDialogueSceneConfig;
  click?: false | DialogueSceneConfig;
}

export type DialogueSceneName = "enter" | "idle" | "click";

export interface ResolvedDialogueScene {
  animation: string;
  animations?: readonly string[];
  lines: readonly string[];
  durationMs: number;
}

export interface ResolvedEnterDialogueScene extends ResolvedDialogueScene {
  delayMs: number;
}

export interface ResolvedIdleDialogueScene extends ResolvedDialogueScene {
  intervalMinMs: number;
  intervalMaxMs: number;
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
  backend?: "inochi2d";
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
    /** Center and contain the neutral SDK draw bounds inside the widget. */
    autoFit?: boolean;
    /** Fraction of the widget available to the fitted model. */
    fitPadding?: number;
  };
  mobile?: {
    show?: boolean;
    breakpoint?: number;
  };
  /** Validated clips emitted by inochi2d-pipeline; do not hand-author in production. */
  animations?: readonly AnimationClip[];
  /** Model-authored clips played continuously underneath foreground actions. */
  ambient?: AmbientAnimationConfig;
  /** Configurable sentence/action scenes rendered above the model. */
  dialogue?: DialogueConfig;
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
    autoFit: boolean;
    fitPadding: number;
  };
  mobile: {
    show: boolean;
    breakpoint: number;
  };
  animations: ReadonlyMap<string, AnimationClip>;
  ambient: {
    animations: readonly string[];
    parameters: readonly ResolvedAmbientParameterOscillator[];
  };
  dialogue: {
    enter: false | ResolvedEnterDialogueScene;
    idle: false | ResolvedIdleDialogueScene;
    click: false | ResolvedDialogueScene;
  };
  parameters: ResolvedParameterBindings;
  interactions: {
    pointer: boolean;
    click: false | { animation: string };
    drag: boolean;
    dragModelUnitsPerPixel: number;
  };
}

export interface WidgetController extends ModelController {
  setParameter(id: string, value: number | readonly [number, number]): void;
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
