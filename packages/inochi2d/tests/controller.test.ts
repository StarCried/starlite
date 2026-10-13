import { beforeEach, describe, expect, it, vi } from "vitest";

import { mountWithDependencies } from "../src/controller.js";
import { MissingModelParameterError } from "../src/errors.js";
import type {
  AnimationClip,
  Inochi2dWasmRuntime,
  WidgetDependencies,
} from "../src/types.js";

const clickAnimation: AnimationClip = {
  name: "Click",
  timestepMs: 100,
  length: 10,
  leadIn: 0,
  leadOut: 8,
  weight: 1,
  lanes: [
    {
      parameter: "Arm:: Right:: Move",
      defaultValues: [0, 0],
      interpolation: "linear",
      keyframes: [
        { frame: 0, value: 0, tension: 0 },
        { frame: 3, value: 1, tension: 0 },
        { frame: 10, value: 0, tension: 0 },
      ],
    },
  ],
};

function fakeRuntime(): Inochi2dWasmRuntime {
  return {
    loadModel: vi.fn(),
    setParameterScalar: vi.fn(),
    setParameterVector: vi.fn(),
    setCameraTransform: vi.fn(),
    resize: vi.fn(),
    renderFrame: vi.fn(),
    destroy: vi.fn(),
  };
}

function inspectableRuntime(
  counts: Readonly<Record<string, number | undefined>>,
): Inochi2dWasmRuntime {
  return Object.assign(fakeRuntime(), {
    parameterHasVisibleEffect: vi.fn((id: string) => counts[id] === 1),
  });
}

function dependencies(
  overrides: Partial<WidgetDependencies> = {},
): WidgetDependencies {
  return {
    fetchModel: vi.fn(async () => new Uint8Array([1, 2, 3])),
    createRuntime: vi.fn(async () => fakeRuntime()),
    requestFrame: vi.fn(() => 7),
    cancelFrame: vi.fn(),
    isMobile: vi.fn(() => false),
    prefersReducedMotion: vi.fn(() => false),
    isWebGl2Available: vi.fn(() => true),
    devicePixelRatio: vi.fn(() => 2),
    createResizeObserver: vi.fn(() => undefined),
    random: vi.fn(() => 0.5),
    ...overrides,
  };
}

function pointerEvent(
  type: string,
  init: MouseEventInit & { pointerId: number },
): PointerEvent {
  const event = new MouseEvent(type, init);
  Object.defineProperty(event, "pointerId", { value: init.pointerId });
  return event as unknown as PointerEvent;
}

beforeEach(() => {
  document.body.replaceChildren();
});

describe("mountWithDependencies", () => {
  it("observes page clicks in pass-through mode and removes the observer on destroy", async () => {
    const element = document.createElement("div"), link = document.createElement("a"), clicked = vi.fn();
    document.body.append(link, element); link.addEventListener("click", clicked);
    const controller = await mountWithDependencies(element, {
      model: "/model.inp", fallback: "/fallback.png", animations: [clickAnimation],
      interactions: { passThrough: true }, dialogue: { click: { animation: "Click", lines: ["Hello page."] } },
    }, dependencies());
    const canvas = element.querySelector("canvas")!;
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({ left: 20, top: 30, right: 120, bottom: 230, width: 100, height: 200 } as DOMRect);
    const gesture = () => {
      link.dispatchEvent(pointerEvent("pointerdown", { bubbles: true, button: 0, pointerId: 1, clientX: 50, clientY: 60 }));
      link.dispatchEvent(pointerEvent("pointerup", { bubbles: true, button: 0, pointerId: 1, clientX: 50, clientY: 60 }));
      const event = new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1, clientX: 50, clientY: 60, ctrlKey: true });
      link.dispatchEvent(event); return event;
    };
    expect(element.hasAttribute("data-model-pass-through")).toBe(true);
    expect(gesture().defaultPrevented).toBe(false); expect(clicked).toHaveBeenCalledOnce();
    const bubble = element.querySelector<HTMLElement>(".model-widget__bubble")!;
    expect(bubble.textContent).toBe("Hello page.");
    controller.pause(); gesture(); expect(bubble.hidden).toBe(true);
    controller.destroy(); gesture(); expect(element.hasAttribute("data-model-pass-through")).toBe(false); expect(element.childElementCount).toBe(0);
  });
  it("does not create DOM or fetch runtime/model when mobile is hidden", async () => {
    const element = document.createElement("div");
    const deps = dependencies({ isMobile: vi.fn(() => true) });

    const controller = await mountWithDependencies(
      element,
      { model: "/model.inp", fallback: "/fallback.png" },
      deps,
    );

    expect(controller.status).toBe("disabled");
    expect(element.children).toHaveLength(0);
    expect(deps.fetchModel).not.toHaveBeenCalled();
    expect(deps.createRuntime).not.toHaveBeenCalled();
  });

  it("loads bytes, caps DPR, and schedules exactly one frame", async () => {
    const element = document.createElement("div");
    const runtime = fakeRuntime();
    const deps = dependencies({ createRuntime: vi.fn(async () => runtime) });

    const controller = await mountWithDependencies(
      element,
      { model: "/model.inp", fallback: "/fallback.png" },
      deps,
    );

    expect(controller.status).toBe("running");
    expect(runtime.loadModel).toHaveBeenCalledOnce();
    expect(runtime.resize).toHaveBeenCalledWith(260, 360, 1.25);
    expect(deps.requestFrame).toHaveBeenCalledOnce();

    controller.resume();
    expect(deps.requestFrame).toHaveBeenCalledOnce();
  });

  it("rejects malformed manual parameter writes synchronously", async () => {
    const element = document.createElement("div");
    const controller = await mountWithDependencies(
      element,
      { model: "/model.inp", fallback: "/fallback.png" },
      dependencies(),
    );

    expect(() => controller.setParameter("", 0)).toThrow(/parameter id/u);
    expect(() => controller.setParameter("HeadX", Number.NaN)).toThrow(
      /parameter value/u,
    );
    expect(() =>
      controller.setParameter(
        "HeadXY",
        [0, Number.POSITIVE_INFINITY] as readonly [number, number],
      ),
    ).toThrow(/parameter value/u);
  });

  it("centers and contains SDK draw bounds when automatic fitting is enabled", async () => {
    const element = document.createElement("div");
    const runtime = Object.assign(fakeRuntime(), {
      modelBounds: vi.fn(() => ({
        minX: 100,
        minY: -100,
        maxX: 300,
        maxY: 500,
      })),
    });
    const deps = dependencies({ createRuntime: vi.fn(async () => runtime) });

    await mountWithDependencies(
      element,
      {
        model: "/model.inp",
        fallback: "/fallback.png",
        render: { autoFit: true, fitPadding: 0.9 },
      },
      deps,
    );

    expect(runtime.setCameraTransform).toHaveBeenCalledWith(-200, -200, 0.54);
  });

  it("renders at 30 FPS on a 60 Hz animation-frame timeline", async () => {
    const element = document.createElement("div");
    const runtime = fakeRuntime();
    const callbacks: FrameRequestCallback[] = [];
    const deps = dependencies({
      createRuntime: vi.fn(async () => runtime),
      requestFrame: vi.fn((callback) => {
        callbacks.push(callback);
        return callbacks.length;
      }),
    });
    await mountWithDependencies(
      element,
      {
        model: "/model.inp",
        fallback: "/fallback.png",
        render: { fps: 30 },
      },
      deps,
    );

    for (let frame = 0; frame < 180; frame += 1) {
      const callback = callbacks.shift();
      expect(callback).toBeDefined();
      callback!(frame * (1_000 / 60));
    }

    expect(runtime.renderFrame).toHaveBeenCalledTimes(90);
  });

  it("drives configured ambient tail parameters on every rendered frame", async () => {
    const element = document.createElement("div");
    const runtime = fakeRuntime();
    const callbacks: FrameRequestCallback[] = [];
    const deps = dependencies({
      createRuntime: vi.fn(async () => runtime),
      requestFrame: vi.fn((callback) => {
        callbacks.push(callback);
        return callbacks.length;
      }),
    });
    await mountWithDependencies(
      element,
      {
        model: "/model.inp",
        fallback: "/fallback.png",
        ambient: {
          parameters: [
            {
              id: "Tail - Left/Right Swing",
              minimum: -0.55,
              maximum: 0.55,
              periodMs: 4_200,
            },
          ],
        },
      },
      deps,
    );

    callbacks.shift()!(0);
    callbacks.shift()!(1_050);
    expect(runtime.setParameterScalar).toHaveBeenCalledWith(
      "Tail - Left/Right Swing",
      0,
    );
    expect(runtime.setParameterScalar).toHaveBeenLastCalledWith(
      "Tail - Left/Right Swing",
      0.55,
    );
  });

  it("keeps 30 FPS when display callbacks run only slightly above 30 Hz", async () => {
    const element = document.createElement("div");
    const runtime = fakeRuntime();
    const callbacks: FrameRequestCallback[] = [];
    const deps = dependencies({
      createRuntime: vi.fn(async () => runtime),
      requestFrame: vi.fn((callback) => {
        callbacks.push(callback);
        return callbacks.length;
      }),
    });
    await mountWithDependencies(
      element,
      {
        model: "/model.inp",
        fallback: "/fallback.png",
        render: { fps: 30 },
      },
      deps,
    );

    for (let frame = 0; frame < 180; frame += 1) {
      const callback = callbacks.shift();
      expect(callback).toBeDefined();
      callback!(frame * (1_000 / 32.5));
    }

    expect(runtime.renderFrame).toHaveBeenCalledTimes(166);
  });

  it("uses a camera breathing fallback when the configured model parameter is unbound", async () => {
    const element = document.createElement("div");
    const runtime = inspectableRuntime({ Breath: 0 });
    const callbacks: FrameRequestCallback[] = [];
    const deps = dependencies({
      createRuntime: vi.fn(async () => runtime),
      requestFrame: vi.fn((callback) => {
        callbacks.push(callback);
        return callbacks.length;
      }),
    });
    await mountWithDependencies(
      element,
      { model: "/model.inp", fallback: "/fallback.png" },
      deps,
    );

    expect(element.dataset.inochi2dBreathing).toBe("fallback");
    callbacks.shift()!(0);
    callbacks.shift()!((700 * Math.PI) / 2);
    expect(runtime.setCameraTransform).toHaveBeenLastCalledWith(
      0,
      0,
      0.15 * 1.008,
    );
  });

  it("renders one neutral frame and starts no loop for reduced motion", async () => {
    const element = document.createElement("div");
    const runtime = inspectableRuntime({ Breath: 0 });
    const deps = dependencies({
      createRuntime: vi.fn(async () => runtime),
      prefersReducedMotion: vi.fn(() => true),
    });

    const controller = await mountWithDependencies(
      element,
      { model: "/model.inp", fallback: "/fallback.png" },
      deps,
    );

    expect(controller.status).toBe("paused");
    expect(element.dataset.inochi2dBreathing).toBe("fallback");
    expect(runtime.setCameraTransform).toHaveBeenCalledWith(0, 0, 0.15);
    expect(runtime.renderFrame).toHaveBeenCalledOnce();
    expect(deps.requestFrame).not.toHaveBeenCalled();
  });

  it("caches only genuinely missing optional model parameters", async () => {
    const element = document.createElement("div");
    const runtime = fakeRuntime();
    const callbacks: FrameRequestCallback[] = [];
    vi.mocked(runtime.setParameterScalar).mockImplementation((id) => {
      if (id === "Breath") {
        throw new MissingModelParameterError(id);
      }
    });
    const deps = dependencies({
      createRuntime: vi.fn(async () => runtime),
      requestFrame: vi.fn((callback) => {
        callbacks.push(callback);
        return callbacks.length;
      }),
    });
    await mountWithDependencies(
      element,
      { model: "/model.inp", fallback: "/fallback.png" },
      deps,
    );

    callbacks.shift()!(0);
    callbacks.shift()!(34);

    const breathWrites = vi
      .mocked(runtime.setParameterScalar)
      .mock.calls.filter(([id]) => id === "Breath");
    expect(breathWrites).toHaveLength(1);
    expect(runtime.renderFrame).toHaveBeenCalledTimes(2);
  });

  it("fails over instead of hiding a runtime parameter trap", async () => {
    const element = document.createElement("div");
    const runtime = fakeRuntime();
    const callbacks: FrameRequestCallback[] = [];
    vi.mocked(runtime.setParameterScalar).mockImplementation((id) => {
      if (id === "Breath") {
        throw new Error("parameter WASM trap");
      }
    });
    const deps = dependencies({
      createRuntime: vi.fn(async () => runtime),
      requestFrame: vi.fn((callback) => {
        callbacks.push(callback);
        return callbacks.length;
      }),
    });
    const controller = await mountWithDependencies(
      element,
      { model: "/model.inp", fallback: "/fallback.png" },
      deps,
    );

    callbacks.shift()!(0);

    expect(controller.status).toBe("fallback");
    expect(element.dataset.inochi2dError).toBe("parameter WASM trap");
    expect(runtime.destroy).toHaveBeenCalledOnce();
    expect(runtime.renderFrame).not.toHaveBeenCalled();
  });

  it("shows an enter sentence only after the model renders successfully", async () => {
    const element = document.createElement("div");
    const runtime = fakeRuntime();
    const callbacks: FrameRequestCallback[] = [];
    const deps = dependencies({
      createRuntime: vi.fn(async () => runtime),
      requestFrame: vi.fn((callback) => {
        callbacks.push(callback);
        return callbacks.length;
      }),
      random: vi.fn(() => 0),
    });
    await mountWithDependencies(
      element,
      {
        model: "/model.inp",
        fallback: "/fallback.png",
        animations: [clickAnimation],
        dialogue: {
          enter: {
            animation: "Click",
            lines: ["<img src=x onerror=alert(1)>"],
          },
        },
      },
      deps,
    );
    const bubble = element.querySelector<HTMLElement>(
      ".model-widget__bubble",
    );
    expect(bubble?.hidden).toBe(true);

    callbacks.shift()!(0);

    expect(runtime.renderFrame).toHaveBeenCalledOnce();
    expect(bubble?.hidden).toBe(false);
    expect(bubble?.textContent).toBe("<img src=x onerror=alert(1)>");
    expect(bubble?.querySelector("img")).toBeNull();
    expect(bubble?.dataset.modelScene).toBe("enter");
  });

  it("triggers the configured click animation and sentence without a fallback", async () => {
    const element = document.createElement("div");
    const runtime = fakeRuntime();
    const callbacks: FrameRequestCallback[] = [];
    const deps = dependencies({
      createRuntime: vi.fn(async () => runtime),
      requestFrame: vi.fn((callback) => {
        callbacks.push(callback);
        return callbacks.length;
      }),
      random: vi.fn(() => 0),
    });
    vi.spyOn(performance, "now").mockReturnValue(100);
    await mountWithDependencies(
      element,
      {
        model: "/model.inp",
        fallback: "/fallback.png",
        animations: [clickAnimation],
        interactions: { drag: false },
        dialogue: {
          click: {
            animation: "Click",
            lines: ["You clicked me."],
          },
        },
      },
      deps,
    );
    const canvas = element.querySelector("canvas")!;
    canvas.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const bubble = element.querySelector<HTMLElement>(
      ".model-widget__bubble",
    );
    expect(bubble?.textContent).toBe("You clicked me.");
    expect(bubble?.dataset.modelScene).toBe("click");

    callbacks.shift()!(400);
    expect(runtime.setParameterScalar).toHaveBeenCalledWith(
      "Arm:: Right:: Move",
      1,
    );
  });

  it("exposes and drives model-authored animations through the public controller", async () => {
    const element = document.createElement("div");
    const runtime = fakeRuntime();
    const callbacks: FrameRequestCallback[] = [];
    const deps = dependencies({
      createRuntime: vi.fn(async () => runtime),
      requestFrame: vi.fn((callback) => {
        callbacks.push(callback);
        return callbacks.length;
      }),
    });
    vi.spyOn(performance, "now").mockReturnValue(100);
    const controller = await mountWithDependencies(
      element,
      {
        model: "/model.inp",
        fallback: "/fallback.png",
        animations: [clickAnimation],
        interactions: { click: false, drag: false, pointer: false },
      },
      deps,
    );

    expect(controller.getAnimations()).toEqual([
      { name: "Click", durationMs: 1_000 },
    ]);
    const playback = controller.playAnimation("Click");
    callbacks.shift()!(400);
    expect(runtime.setParameterScalar).toHaveBeenCalledWith(
      "Arm:: Right:: Move",
      1,
    );
    callbacks.shift()!(1_100);
    await expect(playback).resolves.toBe("completed");
  });

  it("shows idle dialogue at its configured randomized interval", async () => {
    const element = document.createElement("div");
    const runtime = fakeRuntime();
    const callbacks: FrameRequestCallback[] = [];
    const deps = dependencies({
      createRuntime: vi.fn(async () => runtime),
      requestFrame: vi.fn((callback) => {
        callbacks.push(callback);
        return callbacks.length;
      }),
      random: vi.fn(() => 0),
    });
    await mountWithDependencies(
      element,
      {
        model: "/model.inp",
        fallback: "/fallback.png",
        animations: [clickAnimation],
        render: { fps: 60 },
        dialogue: {
          idle: {
            animation: "Click",
            lines: ["Idle line"],
            intervalMinMs: 5_000,
            intervalMaxMs: 5_000,
          },
        },
      },
      deps,
    );
    callbacks.shift()!(0);
    callbacks.shift()!(4_999);
    expect(
      element.querySelector<HTMLElement>(".model-widget__bubble")?.hidden,
    ).toBe(true);

    callbacks.shift()!(5_017);
    expect(
      element.querySelector<HTMLElement>(".model-widget__bubble")
        ?.textContent,
    ).toBe("Idle line");
  });

  it("shows enter text but keeps animation static for reduced motion", async () => {
    vi.useFakeTimers();
    const element = document.createElement("div");
    const runtime = fakeRuntime();
    const deps = dependencies({
      createRuntime: vi.fn(async () => runtime),
      prefersReducedMotion: vi.fn(() => true),
      random: vi.fn(() => 0),
    });
    const controller = await mountWithDependencies(
      element,
      {
        model: "/model.inp",
        fallback: "/fallback.png",
        animations: [clickAnimation],
        dialogue: {
          enter: {
            animation: "Click",
            lines: ["Welcome"],
            delayMs: 20_000,
          },
        },
      },
      deps,
    );

    expect(
      element.querySelector<HTMLElement>(".model-widget__bubble")
        ?.textContent,
    ).toBe("Welcome");
    expect(runtime.setParameterScalar).not.toHaveBeenCalledWith(
      "Arm:: Right:: Move",
      expect.any(Number),
    );
    expect(deps.requestFrame).not.toHaveBeenCalled();
    vi.advanceTimersByTime(4_999);
    expect(
      element.querySelector<HTMLElement>(".model-widget__bubble")?.hidden,
    ).toBe(false);
    vi.advanceTimersByTime(1);
    expect(
      element.querySelector<HTMLElement>(".model-widget__bubble")?.hidden,
    ).toBe(true);
    controller.destroy();
    vi.useRealTimers();
  });

  it("shows a lazy fallback when model loading fails", async () => {
    const element = document.createElement("div");
    const deps = dependencies({
      fetchModel: vi.fn(async () => {
        throw new Error("HTTP 404");
      }),
    });

    const controller = await mountWithDependencies(
      element,
      { model: "/missing.inp", fallback: "/fallback.png" },
      deps,
    );

    expect(controller.status).toBe("fallback");
    expect(element.dataset.inochi2dError).toBe("HTTP 404");
    expect(element.querySelector("img")?.getAttribute("src")).toBe(
      "/fallback.png",
    );
  });

  it("still reaches fallback when a trapped runtime also fails to destroy", async () => {
    const element = document.createElement("div");
    const runtime = fakeRuntime();
    vi.mocked(runtime.loadModel).mockImplementation(() => {
      throw new Error("WASM trap");
    });
    vi.mocked(runtime.destroy).mockImplementation(() => {
      throw new Error("poisoned WASM borrow");
    });
    const deps = dependencies({ createRuntime: vi.fn(async () => runtime) });

    const controller = await mountWithDependencies(
      element,
      { model: "/model.inp", fallback: "/fallback.png" },
      deps,
    );

    expect(controller.status).toBe("fallback");
    expect(element.dataset.inochi2dError).toBe("WASM trap");
    expect(runtime.destroy).toHaveBeenCalledOnce();
  });

  it("switches to fallback and releases runtime after WebGL context loss", async () => {
    const element = document.createElement("div");
    const runtime = fakeRuntime();
    const deps = dependencies({ createRuntime: vi.fn(async () => runtime) });
    const controller = await mountWithDependencies(
      element,
      { model: "/model.inp", fallback: "/fallback.png" },
      deps,
    );

    element
      .querySelector("canvas")
      ?.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));

    expect(controller.status).toBe("fallback");
    expect(runtime.destroy).toHaveBeenCalledOnce();
    expect(element.dataset.inochi2dError).toBe("WebGL context was lost");
  });

  it("destroy is idempotent and releases listeners/runtime", async () => {
    const element = document.createElement("div");
    const runtime = fakeRuntime();
    const deps = dependencies({ createRuntime: vi.fn(async () => runtime) });
    const controller = await mountWithDependencies(
      element,
      { model: "/model.inp", fallback: "/fallback.png" },
      deps,
    );

    controller.destroy();
    controller.destroy();

    expect(controller.status).toBe("destroyed");
    expect(runtime.destroy).toHaveBeenCalledOnce();
    expect(element.children).toHaveLength(0);
  });

  it("drags the whole widget in viewport pixels and double-click resets it", async () => {
    Object.defineProperty(document.documentElement, "clientWidth", {
      configurable: true,
      value: 1200,
    });
    Object.defineProperty(document.documentElement, "clientHeight", {
      configurable: true,
      value: 800,
    });
    const element = document.createElement("div");
    const runtime = fakeRuntime();
    const deps = dependencies({ createRuntime: vi.fn(async () => runtime) });
    await mountWithDependencies(
      element,
      { model: "/model.inp", fallback: "/fallback.png" },
      deps,
    );
    const canvas = element.querySelector("canvas");
    expect(canvas).not.toBeNull();
    const bounds = {
      x: 900,
      y: 400,
      left: 900,
      top: 400,
      right: 1160,
      bottom: 760,
      width: 260,
      height: 360,
      toJSON: () => ({}),
    };
    vi.spyOn(element, "getBoundingClientRect").mockReturnValue(bounds);
    vi.spyOn(canvas!, "getBoundingClientRect").mockReturnValue(bounds);

    canvas!.dispatchEvent(
      pointerEvent("pointerdown", {
        bubbles: true,
        button: 0,
        clientX: 1000,
        clientY: 500,
        pointerId: 1,
      }),
    );
    window.dispatchEvent(
      pointerEvent("pointermove", {
        clientX: 700,
        clientY: 300,
        pointerId: 1,
      }),
    );

    expect(element.style.left).toBe("600px");
    expect(element.style.top).toBe("200px");
    expect(runtime.setCameraTransform).not.toHaveBeenCalled();

    canvas!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(element.style.left).toBe("");
    expect(element.style.top).toBe("");
    expect(runtime.setCameraTransform).toHaveBeenCalledWith(0, 0, 0.15);
  });

  it("treats a stationary drag gesture as a click without detaching the widget", async () => {
    const element = document.createElement("div");
    const runtime = fakeRuntime();
    const callbacks: FrameRequestCallback[] = [];
    const deps = dependencies({
      createRuntime: vi.fn(async () => runtime),
      requestFrame: vi.fn((callback) => {
        callbacks.push(callback);
        return callbacks.length;
      }),
    });
    vi.spyOn(performance, "now").mockReturnValue(100);
    await mountWithDependencies(
      element,
      {
        model: "/model.inp",
        fallback: "/fallback.png",
        animations: [clickAnimation],
        interactions: { click: { animation: "Click" }, drag: true },
      },
      deps,
    );
    const canvas = element.querySelector("canvas");
    expect(canvas).not.toBeNull();
    vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
      x: 900,
      y: 400,
      left: 900,
      top: 400,
      right: 1160,
      bottom: 760,
      width: 260,
      height: 360,
      toJSON: () => ({}),
    });

    canvas!.dispatchEvent(
      pointerEvent("pointerdown", {
        bubbles: true,
        button: 0,
        cancelable: true,
        clientX: 1_000,
        clientY: 500,
        pointerId: 2,
      }),
    );
    canvas!.dispatchEvent(
      pointerEvent("pointerup", {
        bubbles: true,
        button: 0,
        clientX: 1_000,
        clientY: 500,
        pointerId: 2,
      }),
    );
    callbacks.shift()!(400);

    expect(element.style.left).toBe("");
    expect(element.style.top).toBe("");
    expect(runtime.setParameterScalar).toHaveBeenCalledWith(
      "Arm:: Right:: Move",
      1,
    );
  });

  it("clears drag state when pointer capture was already released", async () => {
    const element = document.createElement("div");
    const runtime = fakeRuntime();
    const deps = dependencies({ createRuntime: vi.fn(async () => runtime) });
    await mountWithDependencies(
      element,
      { model: "/model.inp", fallback: "/fallback.png" },
      deps,
    );
    const canvas = element.querySelector("canvas")!;
    Object.defineProperties(canvas, {
      hasPointerCapture: {
        configurable: true,
        value: vi.fn(() => true),
      },
      releasePointerCapture: {
        configurable: true,
        value: vi.fn(() => {
          throw new DOMException("capture was released", "NotFoundError");
        }),
      },
    });

    canvas.dispatchEvent(
      pointerEvent("pointerdown", {
        bubbles: true,
        button: 0,
        cancelable: true,
        clientX: 100,
        clientY: 100,
        pointerId: 9,
      }),
    );
    expect(() =>
      canvas.dispatchEvent(
        pointerEvent("pointercancel", {
          bubbles: true,
          button: 0,
          clientX: 100,
          clientY: 100,
          pointerId: 9,
        }),
      ),
    ).not.toThrow();
    expect(element.dataset.inochi2dDragging).toBeUndefined();
  });

  it("promotes pointer travel to a drag and suppresses the click animation", async () => {
    const element = document.createElement("div");
    const runtime = fakeRuntime();
    const callbacks: FrameRequestCallback[] = [];
    const deps = dependencies({
      createRuntime: vi.fn(async () => runtime),
      requestFrame: vi.fn((callback) => {
        callbacks.push(callback);
        return callbacks.length;
      }),
    });
    vi.spyOn(performance, "now").mockReturnValue(100);
    await mountWithDependencies(
      element,
      {
        model: "/model.inp",
        fallback: "/fallback.png",
        animations: [clickAnimation],
        interactions: { click: { animation: "Click" }, drag: true },
      },
      deps,
    );
    const canvas = element.querySelector("canvas")!;
    const bounds = {
      x: 900,
      y: 400,
      left: 900,
      top: 400,
      right: 1160,
      bottom: 760,
      width: 260,
      height: 360,
      toJSON: () => ({}),
    };
    vi.spyOn(element, "getBoundingClientRect").mockReturnValue(bounds);
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue(bounds);

    canvas.dispatchEvent(
      pointerEvent("pointerdown", {
        bubbles: true,
        button: 0,
        cancelable: true,
        clientX: 1_000,
        clientY: 500,
        pointerId: 3,
      }),
    );
    window.dispatchEvent(
      pointerEvent("pointermove", {
        clientX: 1_020,
        clientY: 500,
        pointerId: 3,
      }),
    );
    canvas.dispatchEvent(
      pointerEvent("pointerup", {
        bubbles: true,
        button: 0,
        clientX: 1_020,
        clientY: 500,
        pointerId: 3,
      }),
    );
    callbacks.shift()!(400);

    expect(element.style.left).toBe("920px");
    const armValues = vi
      .mocked(runtime.setParameterScalar)
      .mock.calls.filter(([id]) => id === "Arm:: Right:: Move")
      .map(([, value]) => value);
    expect(armValues).toEqual([]);
  });
});
