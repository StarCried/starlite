import { beforeEach, describe, expect, it, vi } from "vitest";

import { mountWithDependencies } from "../src/controller.js";
import type { Inochi2dWasmRuntime, WidgetDependencies } from "../src/types.js";

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

function dependencies(overrides: Partial<WidgetDependencies> = {}): WidgetDependencies {
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

beforeEach(() => {
  document.body.replaceChildren();
});

describe("mountWithDependencies", () => {
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

  it("renders one neutral frame and starts no loop for reduced motion", async () => {
    const element = document.createElement("div");
    const runtime = fakeRuntime();
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
    expect(runtime.renderFrame).toHaveBeenCalledOnce();
    expect(deps.requestFrame).not.toHaveBeenCalled();
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
    expect(element.querySelector("img")?.getAttribute("src")).toBe("/fallback.png");
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
});
