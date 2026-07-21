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
) => Promise<Inochi2dWasmRuntime>;

export interface ParameterIds {
  breath: string;
  eyeOpenLeft: string;
  eyeOpenRight: string;
  eyeX: string;
  eyeY: string;
  headX: string;
  headY: string;
  bodyX: string;
  click: string;
}

export interface WidgetConfig {
  model: string;
  fallback: string;
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
  parameters: ParameterIds;
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
  fetchModel(url: string): Promise<Uint8Array>;
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
