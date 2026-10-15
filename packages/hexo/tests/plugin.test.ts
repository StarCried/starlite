import { createHash } from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
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

function animation(name: string, parameter: string) {
  return {
    ...structuredClone(pipelineClick),
    name,
    lanes: [
      {
        ...structuredClone(pipelineClick.lanes[0]),
        parameter,
      },
    ],
  };
}

const defaultPipelineParameters = [
  { name: "Breath", isVector: false },
  { name: "Head:: Yaw-Pitch", isVector: true },
  { name: "Body:: Yaw-Pitch", isVector: true },
  { name: "Eye:: Left:: Blink", isVector: false },
  { name: "Eye:: Right:: Blink", isVector: false },
  { name: "Arm:: Left:: Move", isVector: false },
  { name: "Arm:: Right:: Move", isVector: false },
];

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
  parameters: unknown = defaultPipelineParameters,
  publicationIssues: unknown = [],
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
        tool: "inochi2d-pipeline",
        toolVersion: "0.1.0-alpha.1",
        model: {
          file: modelFile,
          sha256: modelHash,
          bytes: model.byteLength,
          sourceSha256: modelHash,
          sourceBytes: model.byteLength,
        },
        fallback: { file: fallbackFile, sha256: fallbackHash, bytes: fallback.byteLength },
        compatibility: { supported: true },
        publication: { requiresConfirmation: true, issues: publicationIssues },
        parameters,
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
      starlite: {
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
    expect(html).toContain('data-starlite-widget-host');
  });

  it("verifies and publishes a pipeline bundle with generated model URLs", () => {
    withPipelineBundle((directory, modelFile, fallbackFile) => {
      const { hexo, registrations } = fakeHexo(
        {
          root: "/blog/",
          starlite: {
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
      expect(html).toContain('"autoFit":true');
      expect(html).not.toContain('"clickAmplitude"');
    });
  });

  it("allows an explicit bundle configuration to disable automatic fitting", () => {
    withPipelineBundle((directory) => {
      const sourceSha256 = createHash("sha256")
        .update("synthetic-model")
        .digest("hex");
      const { hexo, registrations } = fakeHexo(
        {
          starlite: {
            enable: true,
            bundle: ".",
            publication: {
              confirm: true,
              allowRedistribution: true,
              sourceSha256,
            },
            render: { autoFit: false, initialScale: 0.2 },
          },
        },
        directory,
      );
      registerHexoWidget(hexo);

      expect(registrations.injector?.()).toContain('"autoFit":false');
    });
  });

  it("infers Mannequin motion channels and procedural tail loops", () => {
    withPipelineBundle(
      (directory) => {
        const bundle = collectModelAssets(directory);
        expect(bundle.suggestedParameters).toEqual({
          breath: { id: "Body - Up/Down", scale: 0.08 },
          eyeOpenLeft: {
            id: "Left Eye - Blink",
            scale: -1,
            offset: 1,
          },
          eyeOpenRight: {
            id: "Right Eye - Blink",
            scale: -1,
            offset: 1,
          },
          eyeX: [
            { id: "Left Eye - Gaze", axis: "x", scale: 0.4 },
            { id: "Right Eye - Gaze", axis: "x", scale: 0.4 },
          ],
          eyeY: [
            { id: "Left Eye - Gaze", axis: "y", scale: -0.55 },
            { id: "Right Eye - Gaze", axis: "y", scale: -0.55 },
          ],
          headX: [
            { id: "Head - Pitch/Yaw", axis: "x", scale: 0.35 },
            { id: "Body - Yaw", scale: 0.12 },
          ],
          headY: [
            { id: "Head - Pitch/Yaw", axis: "y", scale: 0.5 },
          ],
          bodyX: "Body - Roll",
        });
        expect(bundle.suggestedAmbient).toEqual({
          parameters: [
            {
              id: "Tail - Left/Right Swing",
              minimum: -0.55,
              maximum: 0.55,
              periodMs: 4_200,
            },
            {
              id: "Tail - Left/Right Tip Swing",
              minimum: -0.35,
              maximum: 0.35,
              periodMs: 4_200,
              phase: 1 / 6,
            },
          ],
        });
      },
      [],
      [
        { name: "Body - Up/Down", isVector: false },
        { name: "Body - Roll", isVector: false },
        { name: "Body - Yaw", isVector: false },
        { name: "Head - Pitch/Yaw", isVector: true },
        { name: "Left Eye - Blink", isVector: false },
        { name: "Right Eye - Blink", isVector: false },
        { name: "Left Eye - Gaze", isVector: true },
        { name: "Right Eye - Gaze", isVector: true },
        { name: "Tail - Left/Right Swing", isVector: false },
        { name: "Tail - Left/Right Tip Swing", isVector: false },
      ],
    );
  });

  it("injects ambient and three dialogue scenes from validated model clips", () => {
    const clips = [
      pipelineClick,
      animation("TailIdle", "Tail:: Swing"),
      animation("Greeting", "Head:: Greeting"),
      animation("Idle", "Head:: Idle"),
    ];
    withPipelineBundle(
      (directory) => {
        const sourceSha256 = createHash("sha256")
          .update("synthetic-model")
          .digest("hex");
        const { hexo, registrations } = fakeHexo(
          {
            starlite: {
              enable: true,
              bundle: ".",
              publication: {
                confirm: true,
                allowRedistribution: true,
                sourceSha256,
              },
              ambient: { animations: ["TailIdle"] },
              dialogue: {
                enter: {
                  animation: "Greeting",
                  lines: ["Welcome </script><img src=x>"],
                },
                idle: {
                  animation: "Idle",
                  lines: ["Still here"],
                  intervalMinMs: 5_000,
                  intervalMaxMs: 5_000,
                },
                click: {
                  animation: "Click",
                  animations: ["Click", "Greeting"],
                  linesByAnimation: { Click: ["Hello", "Welcome </script><img src=x>"], Greeting: ["Greetings"] },
                },
              },
            },
          },
          directory,
        );
        registerHexoWidget(hexo);

        expect(registrations.generator?.()).toBeDefined();
        const html = registrations.injector?.();
        expect(html).toContain('"animations":["TailIdle"]');
        expect(html).toContain('"animation":"Greeting"');
        expect(html).toContain('"animation":"Idle"');
        expect(html).toContain('"animation":"Click"');
        expect(html).toContain('"linesByAnimation":{"Click":["Hello","Welcome \\u003c/script>');
        expect(html).toContain('"Greeting":["Greetings"]');
        expect(html).toContain("\\u003c/script>");
        expect(html).not.toContain("</script><img");
        expect(html).toContain('"click":false');
      },
      clips,
    );
  });

  it("stops Hexo generation for missing loop/scene clips or invalid lines", () => {
    withPipelineBundle((directory) => {
      const sourceSha256 = createHash("sha256")
        .update("synthetic-model")
        .digest("hex");
      const base = {
        enable: true,
        bundle: ".",
        publication: {
          confirm: true,
          allowRedistribution: true,
          sourceSha256,
        },
        interactions: { click: false as const },
      };

      const missing = fakeHexo(
        {
          starlite: {
            ...base,
            ambient: { animations: ["Missing"] },
          },
        },
        directory,
      );
      registerHexoWidget(missing.hexo);
      expect(() => missing.registrations.generator?.()).toThrow(
        /Missing.*not present/u,
      );

      const invalidLines = fakeHexo(
        {
          starlite: {
            ...base,
            dialogue: {
              click: { animation: "Click", lines: [] },
            },
          },
        },
        directory,
      );
      registerHexoWidget(invalidLines.hexo);
      expect(() => invalidLines.registrations.generator?.()).toThrow(
        /lines.*1\.\.=128/u,
      );
    });
  });

  it("requires an explicit publication confirmation for pipeline bundles", () => {
    withPipelineBundle((directory) => {
      const { hexo, registrations } = fakeHexo(
        {
          starlite: {
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

  it("allows publication-only blockers in an isolated CLI-authorized preview", () => {
    withPipelineBundle(
      (directory, modelFile) => {
        const token = "a".repeat(64);
        const previous = process.env.STARLITE_LOCAL_PREVIEW_TOKEN;
        process.env.STARLITE_LOCAL_PREVIEW_TOKEN = token;
        try {
          const { hexo, registrations } = fakeHexo(
            {
              public_dir: join(
                directory,
                ".inochi2d",
                "preview",
                "run-test",
                "public",
              ),
              starlite: {
                enable: true,
                bundle: ".",
                localPreview: { token },
              },
            },
            directory,
          );
          registerHexoWidget(hexo);

          expect(
            registrations
              .generator?.()
              ?.some((route) => route.path.endsWith(`/${modelFile}`)),
          ).toBe(true);
          expect(registrations.injector?.()).toContain(`/${modelFile}`);
          expect(hexo.log.warn).toHaveBeenCalledWith(
            expect.stringMatching(/local preview.*deploy is disabled/iu),
          );
        } finally {
          if (previous === undefined) {
            delete process.env.STARLITE_LOCAL_PREVIEW_TOKEN;
          } else {
            process.env.STARLITE_LOCAL_PREVIEW_TOKEN = previous;
          }
        }
      },
      [pipelineClick],
      defaultPipelineParameters,
      [{ code: "rights-unknown", severity: "error" }],
    );
  });

  it("refuses a preview token when Hexo targets the normal public directory", () => {
    withPipelineBundle((directory) => {
      const token = "b".repeat(64);
      const previous = process.env.STARLITE_LOCAL_PREVIEW_TOKEN;
      process.env.STARLITE_LOCAL_PREVIEW_TOKEN = token;
      try {
        const { hexo, registrations } = fakeHexo(
          {
            public_dir: join(directory, "public"),
            starlite: {
              enable: true,
              bundle: ".",
              localPreview: { token },
            },
          },
          directory,
        );
        registerHexoWidget(hexo);
        expect(() => registrations.generator?.()).toThrow(
          /public_dir below \.inochi2d\/preview/u,
        );
      } finally {
        if (previous === undefined) {
          delete process.env.STARLITE_LOCAL_PREVIEW_TOKEN;
        } else {
          process.env.STARLITE_LOCAL_PREVIEW_TOKEN = previous;
        }
      }
    });
  });

  it("refuses a bundle when the reviewed source hash does not match", () => {
    withPipelineBundle((directory) => {
      const { hexo, registrations } = fakeHexo(
        {
          starlite: {
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

  it("rejects non-pipeline, oversized, and non-canonical bundle artifacts", () => {
    withPipelineBundle((directory) => {
      const manifestPath = join(directory, "manifest.json");
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

      manifest.tool = "other-tool";
      writeFileSync(manifestPath, JSON.stringify(manifest));
      expect(() => collectModelAssets(".", directory)).toThrow(/schema/u);

      manifest.tool = "inochi2d-pipeline";
      manifest.model.file = "model:alternate.inp";
      writeFileSync(manifestPath, JSON.stringify(manifest));
      expect(() => collectModelAssets(".", directory)).toThrow(/non-canonical/u);

      manifest.model.file = `model.${manifest.model.sha256.slice(0, 12)}.inp`;
      manifest.model.bytes = 8 * 1024 * 1024 + 1;
      writeFileSync(manifestPath, JSON.stringify(manifest));
      expect(() => collectModelAssets(".", directory)).toThrow(
        /publication limit/u,
      );
    });
  });

  it("refuses model artifacts reached through symbolic links", () => {
    withPipelineBundle((directory, modelFile, fallbackFile) => {
      rmSync(join(directory, modelFile));
      symlinkSync(fallbackFile, join(directory, modelFile));
      expect(() => collectModelAssets(".", directory)).toThrow(
        /non-symlink/u,
      );
    });
  });

  it("stops Hexo generation when the configured Click animation is missing", () => {
    withPipelineBundle(
      (directory) => {
        const { hexo, registrations } = fakeHexo(
          {
            starlite: {
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

    expect(source.indexOf("matchMedia")).toBeLessThan(source.indexOf("import(entryUrl.href)"));
    expect(source).toContain("__hexoStarLiteWidgetState");
    expect(source).toContain("listenerBound");
    expect(source).toContain("state.generation !== generation");
    expect(source.indexOf("media.matches")).toBeLessThan(source.indexOf("import(entryUrl.href)"));
  });

  it("refuses a local-preview output path containing a symbolic link", () => {
    withPipelineBundle((directory) => {
      const token = "c".repeat(64);
      const previous = process.env.STARLITE_LOCAL_PREVIEW_TOKEN;
      process.env.STARLITE_LOCAL_PREVIEW_TOKEN = token;
      mkdirSync(join(directory, "real-state", "preview", "run-test"), {
        recursive: true,
      });
      symlinkSync("real-state", join(directory, ".inochi2d"), "dir");
      try {
        const { hexo, registrations } = fakeHexo(
          {
            public_dir: join(
              directory,
              ".inochi2d",
              "preview",
              "run-test",
              "public",
            ),
            starlite: {
              enable: true,
              bundle: ".",
              localPreview: { token },
            },
          },
          directory,
        );
        registerHexoWidget(hexo);
        expect(() => registrations.generator?.()).toThrow(/symbolic-link/u);
      } finally {
        if (previous === undefined) {
          delete process.env.STARLITE_LOCAL_PREVIEW_TOKEN;
        } else {
          process.env.STARLITE_LOCAL_PREVIEW_TOKEN = previous;
        }
      }
    });
  });
});
