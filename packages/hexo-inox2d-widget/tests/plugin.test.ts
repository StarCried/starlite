import { describe, expect, it, vi } from "vitest";

import { collectRuntimeAssets } from "../src/assets";
import { createBootstrapSource } from "../src/bootstrap";
import { registerHexoWidget } from "../src/index";
import type { HexoLike } from "../src/types";

interface Registrations {
  generator?: () => Array<{ path: string; data: Buffer }> | undefined;
  injector?: () => string | undefined;
}

function fakeHexo(config: HexoLike["config"]): { hexo: HexoLike; registrations: Registrations } {
  const registrations: Registrations = {};
  return {
    registrations,
    hexo: {
      config,
      extend: {
        generator: {
          register: vi.fn((_name, generator) => {
            registrations.generator = generator;
          }),
        },
        injector: {
          register: vi.fn((_point, injector) => {
            registrations.injector = injector;
          }),
        },
      },
      log: { warn: vi.fn() },
    },
  };
}

describe("Hexo adapter", () => {
  it("emits stable content-hashed runtime routes", () => {
    const first = collectRuntimeAssets();
    const second = collectRuntimeAssets();

    expect(first.hash).toMatch(/^[a-f0-9]{12}$/u);
    expect(second.hash).toBe(first.hash);
    expect(first.assets.some((asset) => asset.relativePath === "generated/runtime_bg.wasm")).toBe(true);
  });

  it("generates no routes or markup when disabled", () => {
    const { hexo, registrations } = fakeHexo({ root: "/blog/" });
    registerHexoWidget(hexo);

    expect(registrations.generator?.()).toBeUndefined();
    expect(registrations.injector?.()).toBeUndefined();
  });

  it("injects hashed assets and site-root-relative model URLs", () => {
    const { hexo, registrations } = fakeHexo({
      root: "/blog/",
      inochi2d_widget: {
        enable: true,
        model: "models/puppet.inp",
        fallback: "images/puppet.png",
      },
    });
    registerHexoWidget(hexo);

    const routes = registrations.generator?.();
    const html = registrations.injector?.();

    expect(routes?.some((route) => route.path.endsWith("/generated/runtime_bg.wasm"))).toBe(true);
    expect(html).toContain('/blog/inochi2d-widget/');
    expect(html).toContain('/blog/models/puppet.inp');
    expect(html).toContain('data-inochi2d-widget-host');
  });

  it("places the mobile guard before the dynamic import", () => {
    const source = createBootstrapSource({
      entryUrl: "/assets/index.js",
      config: { model: "/model.inp", fallback: "/fallback.png" },
      breakpoint: 768,
      showOnMobile: false,
    });

    expect(source.indexOf("matchMedia")).toBeLessThan(source.indexOf("import(options.entryUrl)"));
    expect(source).toContain("__hexoInox2dWidgetState");
    expect(source).toContain("listenerBound");
  });
});
