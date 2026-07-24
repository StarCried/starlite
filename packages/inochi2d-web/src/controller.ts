import { AnimationPlayer } from "./animation.js";
import { resolveConfig } from "./config.js";
import { idleBreathValue, MotionMixer } from "./motion.js";
import type {
  Inochi2dWasmRuntime,
  ResolvedWidgetConfig,
  WidgetConfig,
  WidgetController,
  WidgetDependencies,
  WidgetStatus,
} from "./types.js";

type ManualValue = number | readonly [number, number];
const FRAME_SCHEDULING_EPSILON_MS = 0.25;
const DRAG_START_DISTANCE_SQUARED = 36;
const FALLBACK_BREATH_SCALE_RANGE = 0.016;

interface ParameterEffectInspector {
  parameterHasVisibleEffect(id: string, axis?: "x" | "y"): boolean | undefined;
}

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
  readonly #animations: AnimationPlayer;
  readonly #manualParameters = new Map<string, ManualValue>();
  readonly #unsupportedParameters = new Set<string>();
  readonly #removeListeners: Array<() => void> = [];
  #runtime: Inochi2dWasmRuntime | undefined;
  #mountAbortController: AbortController | undefined;
  #mountTimeoutHandle: ReturnType<typeof setTimeout> | undefined;
  #resizeObserver: ResizeObserver | undefined;
  #frameHandle: number | undefined;
  #nextRenderAt: number | undefined;
  #status: WidgetStatus = "loading";
  #pausedByUser = false;
  #pausedByVisibility = false;
  #usesFallbackBreathing = false;
  #dragOrigin:
    | {
        pointerId: number;
        pointerX: number;
        pointerY: number;
        elementLeft: number;
        elementTop: number;
        moved: boolean;
      }
    | undefined;

  constructor(
    element: HTMLElement,
    config: ResolvedWidgetConfig,
    dependencies: WidgetDependencies,
  ) {
    this.#element = element;
    this.#config = config;
    this.#dependencies = dependencies;
    this.#canvas = document.createElement("canvas");
    this.#fallback = document.createElement("img");
    this.#motion = new MotionMixer({
      bindings: config.parameters,
      random: dependencies.random,
    });
    this.#animations = new AnimationPlayer(config.animations);
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

    const abortController = new AbortController();
    this.#mountAbortController = abortController;
    this.#mountTimeoutHandle = setTimeout(() => {
      abortController.abort(
        new Error(
          `widget loading exceeded ${this.#config.network.requestTimeoutMs} ms`,
        ),
      );
    }, this.#config.network.requestTimeoutMs);

    try {
      const runtime = await this.#dependencies.createRuntime(
        this.#canvas,
        {
          initialScale: this.#config.render.initialScale,
        },
        abortController.signal,
      );
      if (this.#status === "destroyed") {
        destroyRuntime(runtime);
        return;
      }
      this.#runtime = runtime;
      const bytes = await this.#dependencies.fetchModel(this.#config.model, {
        signal: abortController.signal,
        maximumBytes: this.#config.network.modelMaxBytes,
      });
      if (abortController.signal.aborted) {
        return;
      }
      runtime.loadModel(bytes);
      this.#configureBreathing(runtime);
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
      this.#showFallback(
        errorMessage(
          abortController.signal.aborted
            ? abortController.signal.reason
            : error,
        ),
      );
    } finally {
      this.#clearMountDeadline();
    }
  }

  pause(): void {
    this.#pausedByUser = true;
    this.#stopFrame();
    this.#mountAbortController?.abort(
      new Error("widget was destroyed during loading"),
    );
    this.#clearMountDeadline();
    if (this.#status === "running") {
      this.#setStatus("paused");
    }
  }

  resume(): void {
    if (this.#status === "destroyed" || this.#status === "fallback") {
      return;
    }
    this.#pausedByUser = false;
    if (
      !this.#pausedByVisibility &&
      !this.#dependencies.prefersReducedMotion() &&
      this.#runtime
    ) {
      this.#setStatus("running");
      this.#scheduleFrame();
    }
  }

  setParameter(id: string, value: ManualValue): void {
    this.#manualParameters.set(id, value);
  }

  resetCamera(): void {
    this.#motion.releaseDrag();
    this.#runtime?.setCameraTransform(0, 0, this.#config.render.initialScale);
    this.#element.style.removeProperty("left");
    this.#element.style.removeProperty("top");
    this.#element.style.removeProperty("right");
    this.#element.style.removeProperty("bottom");
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
    this.#element.style.setProperty(
      "--inochi2d-width",
      `${this.#config.display.width}px`,
    );
    this.#element.style.setProperty(
      "--inochi2d-height",
      `${this.#config.display.height}px`,
    );
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
      this.#listen(window, "pointermove", (event) =>
        this.#handlePointerMove(event as PointerEvent),
      );
    }
    if (this.#config.interactions.pointer) {
      this.#listen(window, "blur", () => this.#motion.setPointer(0, 0));
    }
    if (this.#config.interactions.click && !this.#config.interactions.drag) {
      this.#listen(this.#canvas, "click", () => this.#triggerClick());
    }
    if (this.#config.interactions.drag) {
      this.#listen(this.#canvas, "pointerdown", (event) =>
        this.#beginDrag(event as PointerEvent),
      );
      this.#listen(this.#canvas, "pointerup", (event) =>
        this.#endDrag(event as PointerEvent, false),
      );
      this.#listen(this.#canvas, "pointercancel", (event) =>
        this.#endDrag(event as PointerEvent, true),
      );
    }
    this.#listen(this.#canvas, "dblclick", () => this.resetCamera());
    this.#listen(window, "resize", () => this.#constrainPosition());

    this.#resizeObserver = this.#dependencies.createResizeObserver(() =>
      this.#resize(),
    );
    this.#resizeObserver?.observe(this.#element);
  }

  #listen(target: EventTarget, type: string, listener: EventListener): void {
    target.addEventListener(type, listener);
    this.#removeListeners.push(() =>
      target.removeEventListener(type, listener),
    );
  }

  #handlePointerMove(event: PointerEvent): void {
    const bounds = this.#canvas.getBoundingClientRect();
    if (
      this.#config.interactions.pointer &&
      bounds.width > 0 &&
      bounds.height > 0
    ) {
      const viewportWidth = Math.max(
        1,
        document.documentElement.clientWidth || window.innerWidth,
      );
      const viewportHeight = Math.max(
        1,
        document.documentElement.clientHeight || window.innerHeight,
      );
      this.#motion.setPointer(
        (event.clientX - (bounds.left + bounds.width / 2)) /
          (viewportWidth * 0.4),
        (event.clientY - (bounds.top + bounds.height / 2)) /
          (viewportHeight * 0.4),
      );
    }
    if (this.#dragOrigin && event.pointerId === this.#dragOrigin.pointerId) {
      const deltaX = event.clientX - this.#dragOrigin.pointerX;
      const deltaY = event.clientY - this.#dragOrigin.pointerY;
      if (
        !this.#dragOrigin.moved &&
        deltaX * deltaX + deltaY * deltaY < DRAG_START_DISTANCE_SQUARED
      ) {
        return;
      }
      if (!this.#dragOrigin.moved) {
        this.#dragOrigin.moved = true;
        this.#element.dataset.inochi2dDragging = "";
      }
      const viewportWidth = Math.max(
        1,
        document.documentElement.clientWidth || window.innerWidth,
      );
      const viewportHeight = Math.max(
        1,
        document.documentElement.clientHeight || window.innerHeight,
      );
      const left = clamp(
        this.#dragOrigin.elementLeft + deltaX,
        0,
        Math.max(0, viewportWidth - bounds.width),
      );
      const top = clamp(
        this.#dragOrigin.elementTop + deltaY,
        0,
        Math.max(0, viewportHeight - bounds.height),
      );
      this.#setElementPosition(left, top);
      this.#motion.setDragBody(deltaX / Math.max(1, bounds.width * 0.35));
    }
  }

  #beginDrag(event: PointerEvent): void {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    const bounds = this.#element.getBoundingClientRect();
    this.#canvas.setPointerCapture?.(event.pointerId);
    this.#dragOrigin = {
      pointerId: event.pointerId,
      pointerX: event.clientX,
      pointerY: event.clientY,
      elementLeft: bounds.left,
      elementTop: bounds.top,
      moved: false,
    };
  }

  #endDrag(event: PointerEvent, canceled: boolean): void {
    if (!this.#dragOrigin || event.pointerId !== this.#dragOrigin.pointerId) {
      return;
    }
    const triggerClick =
      !canceled && !this.#dragOrigin.moved && this.#config.interactions.click;
    this.#canvas.releasePointerCapture?.(event.pointerId);
    this.#dragOrigin = undefined;
    delete this.#element.dataset.inochi2dDragging;
    this.#motion.releaseDrag();
    if (triggerClick) {
      this.#triggerClick();
    }
  }

  #triggerClick(): void {
    const click = this.#config.interactions.click;
    if (click) {
      this.#animations.trigger(click.animation, performance.now());
    }
  }

  #setElementPosition(left: number, top: number): void {
    this.#element.style.left = `${Math.round(left)}px`;
    this.#element.style.top = `${Math.round(top)}px`;
    this.#element.style.right = "auto";
    this.#element.style.bottom = "auto";
  }

  #constrainPosition(): void {
    if (!this.#element.style.left || !this.#element.style.top) {
      return;
    }
    const bounds = this.#element.getBoundingClientRect();
    const viewportWidth = Math.max(
      1,
      document.documentElement.clientWidth || window.innerWidth,
    );
    const viewportHeight = Math.max(
      1,
      document.documentElement.clientHeight || window.innerHeight,
    );
    this.#setElementPosition(
      clamp(bounds.left, 0, Math.max(0, viewportWidth - bounds.width)),
      clamp(bounds.top, 0, Math.max(0, viewportHeight - bounds.height)),
    );
  }

  #resize(): void {
    if (!this.#runtime) {
      return;
    }
    const bounds = this.#element.getBoundingClientRect();
    const width = bounds.width || this.#config.display.width;
    const height = bounds.height || this.#config.display.height;
    const dpr = Math.min(
      this.#dependencies.devicePixelRatio(),
      this.#config.render.maxDevicePixelRatio,
    );
    this.#runtime.resize(width, height, dpr);
  }

  #scheduleFrame(): void {
    if (this.#frameHandle !== undefined || this.#status !== "running") {
      return;
    }
    this.#frameHandle = this.#dependencies.requestFrame((timestamp) => {
      this.#frameHandle = undefined;
      const interval = 1000 / this.#config.render.fps;
      // Choose the refresh nearest to the theoretical deadline. Staying just
      // below half a frame prevents an exact tie from rendering too early.
      const tolerance = Math.max(
        FRAME_SCHEDULING_EPSILON_MS,
        interval / 2 - FRAME_SCHEDULING_EPSILON_MS,
      );
      this.#nextRenderAt ??= timestamp;
      if (timestamp + tolerance >= this.#nextRenderAt) {
        this.#render(timestamp, false);
        const elapsedIntervals = Math.max(
          1,
          Math.floor((timestamp - this.#nextRenderAt + tolerance) / interval) +
            1,
        );
        this.#nextRenderAt += elapsedIntervals * interval;
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
      if (this.#usesFallbackBreathing) {
        const multiplier = reducedMotion
          ? 1
          : 1 +
            (idleBreathValue(timestamp) - 0.5) * FALLBACK_BREATH_SCALE_RANGE;
        this.#runtime.setCameraTransform(
          0,
          0,
          this.#config.render.initialScale * multiplier,
        );
      }
      const parameters = new Map(this.#motion.sample(timestamp, reducedMotion));
      this.#animations.apply(parameters, timestamp, reducedMotion);
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

  #configureBreathing(runtime: Inochi2dWasmRuntime): void {
    const targets = this.#config.parameters.breath;
    if (targets.length === 0) {
      this.#element.dataset.inochi2dBreathing = "disabled";
      return;
    }
    if (!isParameterEffectInspector(runtime)) {
      this.#element.dataset.inochi2dBreathing = "model";
      return;
    }
    const hasVisibleTarget = targets.some(
      (target) =>
        runtime.parameterHasVisibleEffect(target.id, target.axis) === true,
    );
    this.#usesFallbackBreathing = !hasVisibleTarget;
    this.#element.dataset.inochi2dBreathing = hasVisibleTarget
      ? "model"
      : "fallback";
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

  #clearMountDeadline(): void {
    if (this.#mountTimeoutHandle !== undefined) {
      clearTimeout(this.#mountTimeoutHandle);
      this.#mountTimeoutHandle = undefined;
    }
    this.#mountAbortController = undefined;
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

function isParameterEffectInspector(
  runtime: Inochi2dWasmRuntime,
): runtime is Inochi2dWasmRuntime & ParameterEffectInspector {
  return (
    "parameterHasVisibleEffect" in runtime &&
    typeof runtime.parameterHasVisibleEffect === "function"
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
