import { resolveConfig } from "./config.js";
import { MotionMixer } from "./motion.js";
import type {
  Inochi2dWasmRuntime,
  ResolvedWidgetConfig,
  WidgetConfig,
  WidgetController,
  WidgetDependencies,
  WidgetStatus,
} from "./types.js";

type ManualValue = number | readonly [number, number];

export async function mountWithDependencies(
  element: HTMLElement,
  input: WidgetConfig,
  dependencies: WidgetDependencies,
): Promise<WidgetController> {
  const config = resolveConfig(input);
  const mobileQuery = `(max-width: ${Math.max(0, config.mobile.breakpoint - 1)}px)`;
  if (!config.mobile.show && dependencies.isMobile(mobileQuery)) {
    element.dataset.inochi2dStatus = "disabled";
    return new DisabledController(element);
  }

  const controller = new ActiveController(element, config, dependencies);
  await controller.mount();
  return controller;
}

class DisabledController implements WidgetController {
  #status: WidgetStatus = "disabled";
  readonly #element: HTMLElement;

  constructor(element: HTMLElement) {
    this.#element = element;
  }

  get status(): WidgetStatus {
    return this.#status;
  }

  pause(): void {}

  resume(): void {}

  setParameter(_id: string, _value: ManualValue): void {}

  resetCamera(): void {}

  destroy(): void {
    this.#status = "destroyed";
    this.#element.dataset.inochi2dStatus = "destroyed";
  }
}

class ActiveController implements WidgetController {
  readonly #element: HTMLElement;
  readonly #config: ResolvedWidgetConfig;
  readonly #dependencies: WidgetDependencies;
  readonly #canvas: HTMLCanvasElement;
  readonly #fallback: HTMLImageElement;
  readonly #motion: MotionMixer;
  readonly #manualParameters = new Map<string, ManualValue>();
  readonly #unsupportedParameters = new Set<string>();
  readonly #removeListeners: Array<() => void> = [];
  #runtime: Inochi2dWasmRuntime | undefined;
  #resizeObserver: ResizeObserver | undefined;
  #frameHandle: number | undefined;
  #lastRenderedAt = -Infinity;
  #status: WidgetStatus = "loading";
  #pausedByUser = false;
  #pausedByVisibility = false;
  #cameraX = 0;
  #cameraY = 0;
  #cameraDirty = false;
  #dragOrigin:
    | { pointerId: number; pointerX: number; pointerY: number; cameraX: number; cameraY: number }
    | undefined;

  constructor(element: HTMLElement, config: ResolvedWidgetConfig, dependencies: WidgetDependencies) {
    this.#element = element;
    this.#config = config;
    this.#dependencies = dependencies;
    this.#canvas = document.createElement("canvas");
    this.#fallback = document.createElement("img");
    this.#motion = new MotionMixer({
      ids: config.parameters,
      clickAmplitude: config.interactions.clickAmplitude,
      random: dependencies.random,
    });
  }

  get status(): WidgetStatus {
    return this.#status;
  }

  async mount(): Promise<void> {
    this.#prepareDom();
    if (!this.#dependencies.isWebGl2Available(this.#canvas)) {
      this.#showFallback("WebGL2 is unavailable");
      return;
    }

    try {
      const runtime = await this.#dependencies.createRuntime(this.#canvas, {
        initialScale: this.#config.render.initialScale,
      });
      if (this.#status === "destroyed") {
        destroyRuntime(runtime);
        return;
      }
      this.#runtime = runtime;
      const bytes = await this.#dependencies.fetchModel(this.#config.model);
      runtime.loadModel(bytes);
      this.#resize();
      this.#bindLifecycle();

      if (this.#dependencies.prefersReducedMotion()) {
        this.#render(0, true);
        this.#setStatus("paused");
      } else {
        this.#setStatus("running");
        this.#scheduleFrame();
      }
    } catch (error) {
      this.#showFallback(errorMessage(error));
    }
  }

  pause(): void {
    this.#pausedByUser = true;
    this.#stopFrame();
    if (this.#status === "running") {
      this.#setStatus("paused");
    }
  }

  resume(): void {
    if (this.#status === "destroyed" || this.#status === "fallback") {
      return;
    }
    this.#pausedByUser = false;
    if (!this.#pausedByVisibility && !this.#dependencies.prefersReducedMotion() && this.#runtime) {
      this.#setStatus("running");
      this.#scheduleFrame();
    }
  }

  setParameter(id: string, value: ManualValue): void {
    this.#manualParameters.set(id, value);
  }

  resetCamera(): void {
    this.#cameraX = 0;
    this.#cameraY = 0;
    this.#motion.releaseDrag();
    this.#runtime?.setCameraTransform(0, 0, this.#config.render.initialScale);
    this.#cameraDirty = false;
  }

  destroy(): void {
    if (this.#status === "destroyed") {
      return;
    }
    this.#stopFrame();
    this.#resizeObserver?.disconnect();
    for (const remove of this.#removeListeners.splice(0)) {
      remove();
    }
    this.#releaseRuntime();
    this.#element.replaceChildren();
    this.#setStatus("destroyed");
  }

  #prepareDom(): void {
    this.#element.classList.add("inochi2d-widget");
    this.#element.style.setProperty("--inochi2d-width", `${this.#config.display.width}px`);
    this.#element.style.setProperty("--inochi2d-height", `${this.#config.display.height}px`);
    this.#element.setAttribute("aria-label", "Inochi2D character widget");
    this.#canvas.className = "inochi2d-widget__canvas";
    this.#canvas.setAttribute("aria-hidden", "true");
    this.#fallback.className = "inochi2d-widget__fallback";
    this.#fallback.alt = "Character illustration";
    this.#fallback.hidden = true;
    this.#element.replaceChildren(this.#canvas, this.#fallback);
    this.#setStatus("loading");
  }

  #bindLifecycle(): void {
    this.#listen(document, "visibilitychange", () => {
      this.#pausedByVisibility = document.hidden;
      if (document.hidden) {
        this.#stopFrame();
        if (this.#status === "running") {
          this.#setStatus("paused");
        }
      } else if (!this.#pausedByUser) {
        this.resume();
      }
    });

    this.#listen(this.#canvas, "webglcontextlost", (event) => {
      event.preventDefault();
      this.#showFallback("WebGL context was lost");
    });

    if (this.#config.interactions.pointer || this.#config.interactions.drag) {
      this.#listen(this.#canvas, "pointermove", (event) => this.#handlePointerMove(event as PointerEvent));
    }
    if (this.#config.interactions.pointer) {
      this.#listen(this.#canvas, "pointerleave", () => this.#motion.setPointer(0, 0));
    }
    if (this.#config.interactions.click) {
      this.#listen(this.#canvas, "click", () => this.#motion.triggerClick(performance.now()));
    }
    if (this.#config.interactions.drag) {
      this.#listen(this.#canvas, "pointerdown", (event) => this.#beginDrag(event as PointerEvent));
      this.#listen(this.#canvas, "pointerup", (event) => this.#endDrag(event as PointerEvent));
      this.#listen(this.#canvas, "pointercancel", (event) => this.#endDrag(event as PointerEvent));
    }
    this.#listen(this.#canvas, "dblclick", () => this.resetCamera());

    this.#resizeObserver = this.#dependencies.createResizeObserver(() => this.#resize());
    this.#resizeObserver?.observe(this.#element);
  }

  #listen(target: EventTarget, type: string, listener: EventListener): void {
    target.addEventListener(type, listener);
    this.#removeListeners.push(() => target.removeEventListener(type, listener));
  }

  #handlePointerMove(event: PointerEvent): void {
    const bounds = this.#canvas.getBoundingClientRect();
    if (this.#config.interactions.pointer && bounds.width > 0 && bounds.height > 0) {
      this.#motion.setPointer(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        ((event.clientY - bounds.top) / bounds.height) * 2 - 1,
      );
    }
    if (this.#dragOrigin && event.pointerId === this.#dragOrigin.pointerId) {
      const deltaX = event.clientX - this.#dragOrigin.pointerX;
      const deltaY = event.clientY - this.#dragOrigin.pointerY;
      this.#cameraX =
        this.#dragOrigin.cameraX + deltaX * this.#config.interactions.dragModelUnitsPerPixel;
      this.#cameraY =
        this.#dragOrigin.cameraY + deltaY * this.#config.interactions.dragModelUnitsPerPixel;
      this.#motion.setDragBody(deltaX / Math.max(1, bounds.width * 0.35));
      this.#cameraDirty = true;
    }
  }

  #beginDrag(event: PointerEvent): void {
    this.#canvas.setPointerCapture?.(event.pointerId);
    this.#dragOrigin = {
      pointerId: event.pointerId,
      pointerX: event.clientX,
      pointerY: event.clientY,
      cameraX: this.#cameraX,
      cameraY: this.#cameraY,
    };
  }

  #endDrag(event: PointerEvent): void {
    if (!this.#dragOrigin) {
      return;
    }
    this.#canvas.releasePointerCapture?.(event.pointerId);
    this.#dragOrigin = undefined;
    this.#motion.releaseDrag();
  }

  #resize(): void {
    if (!this.#runtime) {
      return;
    }
    const bounds = this.#element.getBoundingClientRect();
    const width = bounds.width || this.#config.display.width;
    const height = bounds.height || this.#config.display.height;
    const dpr = Math.min(this.#dependencies.devicePixelRatio(), this.#config.render.maxDevicePixelRatio);
    this.#runtime.resize(width, height, dpr);
  }

  #scheduleFrame(): void {
    if (this.#frameHandle !== undefined || this.#status !== "running") {
      return;
    }
    this.#frameHandle = this.#dependencies.requestFrame((timestamp) => {
      this.#frameHandle = undefined;
      const interval = 1000 / this.#config.render.fps;
      if (timestamp - this.#lastRenderedAt >= interval) {
        this.#render(timestamp, false);
        this.#lastRenderedAt = timestamp;
      }
      this.#scheduleFrame();
    });
  }

  #stopFrame(): void {
    if (this.#frameHandle !== undefined) {
      this.#dependencies.cancelFrame(this.#frameHandle);
      this.#frameHandle = undefined;
    }
  }

  #render(timestamp: number, reducedMotion: boolean): void {
    if (!this.#runtime) {
      return;
    }
    try {
      if (this.#cameraDirty) {
        this.#runtime.setCameraTransform(
          this.#cameraX,
          this.#cameraY,
          this.#config.render.initialScale,
        );
        this.#cameraDirty = false;
      }
      const parameters = this.#motion.sample(timestamp, reducedMotion);
      for (const [id, value] of parameters) {
        this.#setRuntimeParameter(id, value);
      }
      for (const [id, value] of this.#manualParameters) {
        this.#setRuntimeParameter(id, value);
      }
      this.#runtime.renderFrame(timestamp);
    } catch (error) {
      this.#showFallback(errorMessage(error));
    }
  }

  #setRuntimeParameter(id: string, value: ManualValue): void {
    if (!this.#runtime || this.#unsupportedParameters.has(id)) {
      return;
    }
    try {
      if (typeof value === "number") {
        this.#runtime.setParameterScalar(id, value);
      } else {
        this.#runtime.setParameterVector(id, value[0], value[1]);
      }
    } catch {
      // Different puppets expose different parameter sets. Missing optional
      // parameters are disabled after the first failed lookup.
      this.#unsupportedParameters.add(id);
    }
  }

  #showFallback(message: string): void {
    if (this.#status === "destroyed") {
      return;
    }
    this.#stopFrame();
    this.#releaseRuntime();
    this.#canvas.hidden = true;
    this.#fallback.src = this.#config.fallback;
    this.#fallback.hidden = false;
    this.#element.dataset.inochi2dError = message;
    this.#element.setAttribute("role", "img");
    this.#setStatus("fallback");
  }

  #setStatus(status: WidgetStatus): void {
    this.#status = status;
    this.#element.dataset.inochi2dStatus = status;
  }

  #releaseRuntime(): void {
    const runtime = this.#runtime;
    this.#runtime = undefined;
    if (runtime) {
      destroyRuntime(runtime);
    }
  }
}

function destroyRuntime(runtime: Inochi2dWasmRuntime): void {
  try {
    runtime.destroy();
  } catch {
    // A trapped WebAssembly call can leave wasm-bindgen's mutable-borrow flag
    // poisoned. The widget must still reach a deterministic fallback or
    // destroyed state without surfacing a second, unrelated exception.
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
