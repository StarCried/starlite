import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { OfficialInochi2dSdk } from "../src/official/sdk.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("official SDK compatibility profile", () => {
  it("preserves legacy 2D parameter ranges and composite colors", async () => {
    const wasm = await readFile(
      resolve(process.cwd(), "src/generated/inochi2d.wasm"),
    );
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(wasm));
    const sdk = await OfficialInochi2dSdk.create(
      new URL("https://fixture.invalid/inochi2d.wasm"),
    );
    const puppet = sdk.loadPuppet(await compatibilityFixture());

    try {
      const parameter = puppet.parameters.get("Pointer");
      expect(parameter).toBeDefined();
      expect(parameter!.lowerBounds).toEqual([-1, -1]);
      expect(parameter!.upperBounds).toEqual([1, 1]);
      const scalar = puppet.parameters.get("Legacy scalar");
      expect(scalar).toBeDefined();
      expect(scalar!.lowerBounds).toEqual([-2]);
      expect(scalar!.upperBounds).toEqual([2]);
      sdk.setParameter(scalar!, -2);
      const lower = new Float32Array(sdk.updateAndDraw(puppet, 0).vertices);
      sdk.setParameter(scalar!, 2);
      const upper = sdk.updateAndDraw(puppet, 0).vertices;
      let deformedVertices = 0;
      for (let vertex = 0; vertex < upper.length; vertex += 4) {
        if (
          Math.abs(upper[vertex]! - lower[vertex]!) > 1e-4 ||
          Math.abs(upper[vertex + 1]! - lower[vertex + 1]!) > 1e-4
        ) {
          deformedVertices += 1;
        }
      }
      expect(deformedVertices).toBe(3);
      sdk.setParameter(scalar!, 0);

      sdk.setParameter(parameter!, [100, -100]);
      expect(() => sdk.updateAndDraw(puppet, 0)).not.toThrow();
      expect(() => sdk.setParameter(parameter!, [Number.NaN, 0])).toThrow(
        "parameter values must be finite numbers",
      );

      const drawList = sdk.updateAndDraw(puppet, 0);
      const composite = drawList.commands.find(
        (command) => command.state === 6,
      );
      expect(composite).toBeDefined();
      expect(Array.from(composite!.variables.slice(0, 3))).toEqual([
        0.25, 0.5, 0.75,
      ]);
      expect(composite!.variables[7]).toBeCloseTo(0.8);
    } finally {
      sdk.freePuppet(puppet);
      sdk.destroy();
    }
  });

  it.skipIf(!process.env.INOCHI2D_TEST_MODEL_PATH)(
    "moves the public Aka head parameter continuously across its full range",
    async () => {
      const wasm = await readFile(
        resolve(process.cwd(), "src/generated/inochi2d.wasm"),
      );
      vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(wasm));
      const sdk = await OfficialInochi2dSdk.create(
        new URL("https://fixture.invalid/inochi2d.wasm"),
      );
      const model = await readFile(process.env.INOCHI2D_TEST_MODEL_PATH!);
      const puppet = sdk.loadPuppet(new Uint8Array(model));

      try {
        const parameter = puppet.parameters.get("Head:: Yaw-Pitch");
        expect(parameter).toBeDefined();
        expect(parameter!.lowerBounds).toEqual([-1, -1]);
        expect(parameter!.upperBounds).toEqual([1, 1]);

        let previous: Float32Array | undefined;
        const steps: Array<{ changed: number; rms: number; maximum: number }> =
          [];
        for (let index = 0; index <= 40; index += 1) {
          sdk.setParameter(parameter!, [-1 + index * 0.05, 0]);
          const current = new Float32Array(
            sdk.updateAndDraw(puppet, 0).vertices,
          );
          if (previous) {
            let changed = 0;
            let sumSquares = 0;
            let maximum = 0;
            for (let vertex = 0; vertex < current.length; vertex += 4) {
              const dx = current[vertex]! - previous[vertex]!;
              const dy = current[vertex + 1]! - previous[vertex + 1]!;
              if (Math.abs(dx) > 1e-4 || Math.abs(dy) > 1e-4) {
                changed += 1;
              }
              sumSquares += dx * dx + dy * dy;
              maximum = Math.max(maximum, Math.abs(dx), Math.abs(dy));
            }
            steps.push({
              changed,
              rms: Math.sqrt(sumSquares / (current.length / 2)),
              maximum,
            });
          }
          previous = current;
        }

        const rms = steps.map((step) => step.rms);
        expect(Math.min(...steps.map((step) => step.changed))).toBeGreaterThan(
          1_000,
        );
        expect(Math.min(...rms)).toBeGreaterThan(1);
        expect(Math.max(...rms) / Math.min(...rms)).toBeLessThan(1.5);
        expect(Math.max(...steps.map((step) => step.maximum))).toBeLessThan(20);
      } finally {
        sdk.freePuppet(puppet);
        sdk.destroy();
      }
    },
  );

  it.skipIf(!process.env.INOCHI2D_TEST_MODEL_PATH)(
    "deforms the public Aka model with its idle and click parameters",
    async () => {
      const wasm = await readFile(
        resolve(process.cwd(), "src/generated/inochi2d.wasm"),
      );
      vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(wasm));
      const sdk = await OfficialInochi2dSdk.create(
        new URL("https://fixture.invalid/inochi2d.wasm"),
      );
      const model = await readFile(process.env.INOCHI2D_TEST_MODEL_PATH!);
      const puppet = sdk.loadPuppet(new Uint8Array(model));

      try {
        const metrics = Object.fromEntries(
          [
            ["Breath", 0, 1],
            ["Arm:: Left:: Move", 0, 1],
            ["Arm:: Right:: Move", 0, 1],
            ["Arm:: Right:: Sleeve:: Physics", [0, 0], [1, 1]],
          ].map(([id, start, end]) => [
            id,
            measureScalarParameter(
              sdk,
              puppet,
              id as string,
              start as number | readonly [number, number],
              end as number | readonly [number, number],
            ),
          ]),
        );
        const breath = puppet.parameters.get("Breath");
        const leftArm = puppet.parameters.get("Arm:: Left:: Move");
        const rightArm = puppet.parameters.get("Arm:: Right:: Move");
        const rightSleevePhysics = puppet.parameters.get(
          "Arm:: Right:: Sleeve:: Physics",
        );
        expect(breath?.boundBindingCount).toBe(3);
        expect(leftArm?.boundBindingCount).toBe(7);
        expect(rightArm?.boundBindingCount).toBe(4);
        expect(rightSleevePhysics?.boundBindingCount).toBe(1);
        expect(sdk.parameterHasDrawEffect(puppet, breath!, undefined)).toBe(
          true,
        );
        expect(sdk.parameterHasDrawEffect(puppet, leftArm!, undefined)).toBe(
          true,
        );
        expect(sdk.parameterHasDrawEffect(puppet, rightArm!, undefined)).toBe(
          true,
        );
        expect(metrics.Breath!.changed).toBeGreaterThan(20);
        expect(metrics["Arm:: Left:: Move"]!.changed).toBeGreaterThan(50);
        expect(
          metrics["Arm:: Right:: Sleeve:: Physics"]!.changed,
        ).toBeGreaterThan(20);
        expect(metrics["Arm:: Right:: Move"]!.changed).toBeGreaterThan(50);
        expect(metrics["Arm:: Right:: Move"]!.maximum).toBeGreaterThan(300);
      } finally {
        sdk.freePuppet(puppet);
        sdk.destroy();
      }
    },
  );

  it.skipIf(!process.env.INOCHI2D_TEST_MODEL_PATH)(
    "keeps the public Aka arm deformation stable across repeated frames",
    async () => {
      const wasm = await readFile(
        resolve(process.cwd(), "src/generated/inochi2d.wasm"),
      );
      vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(wasm));
      const sdk = await OfficialInochi2dSdk.create(
        new URL("https://fixture.invalid/inochi2d.wasm"),
      );
      const model = await readFile(process.env.INOCHI2D_TEST_MODEL_PATH!);
      const puppet = sdk.loadPuppet(new Uint8Array(model));

      try {
        const parameter = puppet.parameters.get("Arm:: Right:: Move");
        expect(parameter).toBeDefined();
        sdk.setParameter(parameter!, 1);
        const first = new Float32Array(sdk.updateAndDraw(puppet, 0).vertices);
        let maximumDrift = 0;

        for (let frame = 0; frame < 20; frame += 1) {
          const current = sdk.updateAndDraw(puppet, 0).vertices;
          for (let index = 0; index < current.length; index += 1) {
            maximumDrift = Math.max(
              maximumDrift,
              Math.abs(current[index]! - first[index]!),
            );
          }
        }

        expect(maximumDrift).toBeLessThan(1e-4);
      } finally {
        sdk.freePuppet(puppet);
        sdk.destroy();
      }
    },
  );
});

function measureScalarParameter(
  sdk: OfficialInochi2dSdk,
  puppet: ReturnType<OfficialInochi2dSdk["loadPuppet"]>,
  id: string,
  start: number | readonly [number, number],
  end: number | readonly [number, number],
): { changed: number; rms: number; maximum: number; changedVariables: number } {
  const parameter = puppet.parameters.get(id);
  expect(parameter, `missing Aka parameter: ${id}`).toBeDefined();
  sdk.setParameter(parameter!, start);
  const beforeDraw = sdk.updateAndDraw(puppet, 0);
  const before = new Float32Array(beforeDraw.vertices);
  const beforeVariables = beforeDraw.commands.map(
    (command) => new Float32Array(command.variables),
  );
  sdk.setParameter(parameter!, end);
  const afterDraw = sdk.updateAndDraw(puppet, 0);
  const after = new Float32Array(afterDraw.vertices);
  sdk.setParameter(parameter!, start);

  let changed = 0;
  let sumSquares = 0;
  let maximum = 0;
  for (let vertex = 0; vertex < after.length; vertex += 4) {
    const dx = after[vertex]! - before[vertex]!;
    const dy = after[vertex + 1]! - before[vertex + 1]!;
    if (Math.abs(dx) > 1e-4 || Math.abs(dy) > 1e-4) {
      changed += 1;
    }
    sumSquares += dx * dx + dy * dy;
    maximum = Math.max(maximum, Math.abs(dx), Math.abs(dy));
  }
  let changedVariables = 0;
  for (let command = 0; command < afterDraw.commands.length; command += 1) {
    const beforeCommand = beforeVariables[command]!;
    const afterCommand = afterDraw.commands[command]!.variables;
    for (let index = 0; index < afterCommand.length; index += 1) {
      if (Math.abs(afterCommand[index]! - beforeCommand[index]!) > 1e-6) {
        changedVariables += 1;
      }
    }
  }
  return {
    changed,
    rms: Math.sqrt(sumSquares / (after.length / 2)),
    maximum,
    changedVariables,
  };
}

async function compatibilityFixture(): Promise<Uint8Array> {
  const payload = await readFile(
    resolve(process.cwd(), "../../fixtures/official-sdk-compatibility.json"),
  );
  const payloadLength = Buffer.allocUnsafe(4);
  payloadLength.writeUInt32BE(payload.length);
  return Buffer.concat([
    Buffer.from("TRNSRTS\0", "binary"),
    payloadLength,
    payload,
    Buffer.from("TEX_SECT", "ascii"),
    Buffer.alloc(4),
  ]);
}
