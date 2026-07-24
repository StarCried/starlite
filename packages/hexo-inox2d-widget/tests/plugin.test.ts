import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { collectModelAssets, collectRuntimeAssets } from "../src/assets";
import { createBootstrapSource } from "../src/bootstrap";
import { registerHexoWidget } from "../src/index";
import type { HexoLike } from "../src/types";

interface Registrations {
  generator?: () => Array<{ path: string; data: Buffer }> | undefined;
  injector?: () => string | undefined;
}

const pipelineClick = {
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
        { frame: 5, value: 1, tension: 0 },
        { frame: 10, value: 0, tension: 0 },
      ],
    },
  ],
};

function fakeHexo(
  config: HexoLike["config"],
  baseDirectory = process.cwd(),
): { hexo: HexoLike; registrations: Registrations } {
  const registrations: Registrations = {};
  return {
    registrations,
    hexo: {
      base_dir: baseDirectory,
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

function withPipelineBundle(
  callback: (directory: string, modelFile: string, fallbackFile: string) => void,
  animations: unknown = [pipelineClick],
): void {
  const directory = mkdtempSync(join(tmpdir(), "inochi2d-widget-bundle-"));
  try {
    const model = Buffer.from("synthetic-model");
    const fallback = Buffer.from("synthetic-fallback");
    const modelHash = createHash("sha256").update(model).digest("hex");
    const fallbackHash = createHash("sha256").update(fallback).digest("hex");
    const modelFile = `model.${modelHash.slice(0, 12)}.inp`;
    const fallbackFile = `fallback.${fallbackHash.slice(0, 12)}.png`;
    writeFileSync(join(directory, modelFile), model);
    writeFileSync(join(directory, fallbackFile), fallback);
    writeFileSync(
      join(directory, "manifest.json"),
      `${JSON.stringify({
        schemaVersion: 1,
        model: {
          file: modelFile,
          sha256: modelHash,
          bytes: model.byteLength,
          sourceSha256: modelHash,
          sourceBytes: model.byteLength,
        },
        fallback: { file: fallbackFile, sha256: fallbackHash, bytes: fallback.byteLength },
        compatibility: { supported: true },
        publication: { requiresConfirmation: true, issues: [] },
        parameters: [
          { name: "Breath", isVector: false },
          { name: "Head:: Yaw-Pitch", isVector: true },
          { name: "Body:: Yaw-Pitch", isVector: true },
          { name: "Eye:: Left:: Blink", isVector: false },
          { name: "Eye:: Right:: Blink", isVector: false },
          { name: "Arm:: Left:: Move", isVector: false },
          { name: "Arm:: Right:: Move", isVector: false },
        ],
        animations,
      })}\n`,
    );
    callback(directory, modelFile, fallbackFile);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe("Hexo adapter", () => {
  it("emits stable content-hashed runtime routes", () => {
    const first = collectRuntimeAssets();
    const second = collectRuntimeAssets();

    expect(first.hash).toMatch(/^[a-f0-9]{12}$/u);
    expect(second.hash).toBe(first.hash);
    expect(first.assets.some((asset) => asset.relativePath === "generated/inochi2d.wasm")).toBe(true);
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
        interactions: { click: false },
      },
    });
    registerHexoWidget(hexo);

    const routes = registrations.generator?.();
    const html = registrations.injector?.();

    expect(routes?.some((route) => route.path.endsWith("/generated/inochi2d.wasm"))).toBe(true);
    expect(html).toContain('/blog/inochi2d-widget/');
    expect(html).toContain('/blog/models/puppet.inp');
    expect(html).toContain('data-inochi2d-widget-host');
  });

  it("verifies and publishes a pipeline bundle with generated model URLs", () => {
    withPipelineBundle((directory, modelFile, fallbackFile) => {
      const { hexo, registrations } = fakeHexo(
        {
          root: "/blog/",
          inochi2d_widget: {
            enable: true,
            bundle: ".",
            publication: {
              confirm: true,
              allowRedistribution: true,
              sourceSha256: createHash("sha256")
                .update("synthetic-model")
                .digest("hex"),
            },
          },
        },
        directory,
      );
      registerHexoWidget(hexo);

      const routes = registrations.generator?.();
      const html = registrations.injector?.();
      const modelRoute = routes?.find((route) => route.path.endsWith(`/${modelFile}`));

      expect(modelRoute?.data.toString()).toBe("synthetic-model");
      expect(routes?.some((route) => route.path.endsWith(`/${fallbackFile}`))).toBe(true);
      expect(routes?.some((route) => route.path.endsWith("/manifest.json"))).toBe(true);
      expect(html).toContain(`/blog/inochi2d-model/`);
      expect(html).toContain(`/${modelFile}`);
      expect(html).toContain(`/${fallbackFile}`);
      expect(html).toContain("Head:: Yaw-Pitch");
      expect(html).toContain('"axis":"x"');
      expect(html).toContain('"scale":-1');
      expect(html).toContain('"animation":"Click"');
      expect(html).toContain('"parameter":"Arm:: Right:: Move"');
      expect(html).not.toContain('"clickAmplitude"');
    });
  });

  it("requires an explicit publication confirmation for pipeline bundles", () => {
    withPipelineBundle((directory) => {
      const { hexo, registrations } = fakeHexo(
        {
          inochi2d_widget: {
            enable: true,
            bundle: ".",
          },
        },
        directory,
      );
      registerHexoWidget(hexo);

      expect(() => registrations.generator?.()).toThrow(
        /publication\.confirm/u,
      );
      expect(() => registrations.injector?.()).toThrow(
        /publication\.confirm/u,
      );
    });
  });

  it("refuses a bundle when the reviewed source hash does not match", () => {
    withPipelineBundle((directory) => {
      const { hexo, registrations } = fakeHexo(
        {
          inochi2d_widget: {
            enable: true,
            bundle: ".",
            publication: {
              confirm: true,
              allowRedistribution: true,
              sourceSha256: "f".repeat(64),
            },
          },
        },
        directory,
      );
      registerHexoWidget(hexo);

      expect(() => registrations.generator?.()).toThrow(/sourceSha256/u);
      expect(() => registrations.injector?.()).toThrow(/sourceSha256/u);
    });
  });

  it("rejects a pipeline bundle whose artifact hash does not match", () => {
    withPipelineBundle((directory, modelFile) => {
      writeFileSync(join(directory, modelFile), "tampered");
      expect(() => collectModelAssets(".", directory)).toThrow(/size mismatch|SHA-256 mismatch/u);
    });
  });

  it("stops Hexo generation when the configured Click animation is missing", () => {
    withPipelineBundle(
      (directory) => {
        const { hexo, registrations } = fakeHexo(
          {
            inochi2d_widget: {
              enable: true,
              bundle: ".",
              publication: {
                confirm: true,
                allowRedistribution: true,
                sourceSha256: createHash("sha256")
                  .update("synthetic-model")
                  .digest("hex"),
              },
            },
          },
          directory,
        );
        registerHexoWidget(hexo);

        expect(() => registrations.generator?.()).toThrow(
          /Click.*not present/u,
        );
      },
      [],
    );
  });

  it("stops before publication when animation data is malformed", () => {
    expect(() =>
      withPipelineBundle(
        (directory) => collectModelAssets(".", directory),
        [{ ...pipelineClick, weight: 0.5 }],
      ),
    ).toThrow(/invalid animations/u);
  });

  it("stops before publication when animation names are duplicated", () => {
    expect(() =>
      withPipelineBundle(
        (directory) => collectModelAssets(".", directory),
        [pipelineClick, structuredClone(pipelineClick)],
      ),
    ).toThrow(/duplicate animations/u);
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
