import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  OfficialInochi2dSdk,
  type OfficialDrawList,
  type OfficialParameter,
  type OfficialPuppet,
} from "../src/official/sdk.js";

const MODEL_PATH = process.env.INOCHI2D_MANNEQUIN_TEST_MODEL_PATH;

afterEach(() => {
  vi.restoreAllMocks();
});

describe.skipIf(!MODEL_PATH)("prepared Mannequin compatibility profile", () => {
  it("loads the merged rig, MeshGroups, ColorBurn draws, and browser-safe textures", async () => {
    await withMannequin(async (sdk, puppet) => {
      expect(puppet.parameters.size).toBe(82);
      expect(puppet.physics).toEqual({
        enabled: true,
        driverCount: 33,
        resolvedDriverCount: 21,
        springDriverCount: 33,
        xyDriverCount: 26,
        nonzeroScaleCount: 33,
      });

      expectParameter(puppet, "Physics - Right Lower Arm", 2, 4);
      expectParameter(puppet, "Left Eye - Gaze", 2);
      expectParameter(puppet, "Right Eye - Gaze", 2);
      expectParameter(puppet, "Mouth - Open/Close, Expression", 2);

      const draw = sdk.updateAndDraw(puppet, 0);
      expectDrawList(draw);
      expect(
        draw.commands.filter((command) => command.blendMode === 9).length,
      ).toBeGreaterThan(0);

      const textures = sdk.readTextures(puppet);
      expect(textures).toHaveLength(207);
      expect(
        textures.every(
          (texture) =>
            texture.width >= 1 &&
            texture.height >= 1 &&
            texture.width <= 4_096 &&
            texture.height <= 4_096,
        ),
      ).toBe(true);

      const faceTexture = textures[179]!;
      const firstPixels = new Uint8Array(faceTexture.pixels);
      const repeatedFaceTexture = sdk.readTextures(puppet)[179]!;
      expect(repeatedFaceTexture.pixels).toEqual(firstPixels);
      expect(maximumColorToAlphaRatio(repeatedFaceTexture.pixels)).toBeGreaterThan(
        0.85,
      );
    });
  });

  it("applies Mannequin head, gaze, body, and tail parameters to the draw list", async () => {
    await withMannequin(async (sdk, puppet) => {
      sdk.setPhysicsEnabled(puppet, false);
      for (const [name, axis] of [
        ["Head - Pitch/Yaw", "x"],
        ["Head - Pitch/Yaw", "y"],
        ["Left Eye - Gaze", "x"],
        ["Left Eye - Gaze", "y"],
        ["Right Eye - Gaze", "x"],
        ["Right Eye - Gaze", "y"],
        ["Head - Roll", undefined],
        ["Left Eye - Blink", undefined],
        ["Right Eye - Blink", undefined],
        ["Body - Up/Down", undefined],
        ["Tail - Left/Right Swing", undefined],
      ] as const) {
        const parameter = expectParameter(puppet, name);
        expect(
          sdk.parameterHasDrawEffect(puppet, parameter, axis),
          `${name}${axis ? `:${axis}` : ""} has no draw effect`,
        ).toBe(true);
      }
      // The tip parameter rotates the tail's physics anchor rather than a
      // visible mesh, so its effect is asserted through the physics test.
      expectParameter(puppet, "Tail - Left/Right Tip Swing", 1, 1);
    });
  });

  it("keeps cubic deformation finite and advances head and tail physics", async () => {
    await withMannequin(async (sdk, puppet) => {
      sdk.setPhysicsEnabled(puppet, false);
      const cubic = expectParameter(puppet, "Physics - Head (Front)");
      const snapshots: Float32Array[] = [];
      for (let step = 0; step <= 20; step += 1) {
        sdk.setParameter(cubic, [-2 + step * 0.2, 0.35]);
        const draw = sdk.updateAndDraw(puppet, 0);
        expectDrawList(draw);
        snapshots.push(new Float32Array(draw.vertices));
      }
      const changes = snapshots.slice(1).map((current, index) =>
        changedVertices(snapshots[index]!, current),
      );
      expect(Math.min(...changes)).toBeGreaterThan(0);

      sdk.setParameter(cubic, [0, 0]);
      sdk.setPhysicsEnabled(puppet, true);
      for (let frame = 0; frame < 180; frame += 1) {
        sdk.updateAndDraw(puppet, 1 / 60);
      }

      const watched = [
        "Physics - Head (Front)",
        "Physics - Head (Back)",
        "Physics - Left Ear",
        "Physics - Left Upper Arm",
        "Physics - Left Lower Arm",
        "Physics - Right Upper Arm",
        "Physics - Right Lower Arm",
        "Physics - Tail (Left/Right Swing)",
      ].map((name) => [name, expectParameter(puppet, name)] as const);
      const baseline = new Map(
        watched.map(([name, parameter]) => [
          name,
          sdk.readParameterValue(parameter),
        ]),
      );

      sdk.setParameter(expectParameter(puppet, "Head - Pitch/Yaw"), [0.45, 0.35]);
      sdk.setParameter(expectParameter(puppet, "Body - Roll"), 0.2);
      let maximumHeadChange = 0;
      let maximumArmChange = 0;
      let maximumTailChange = 0;
      for (let frame = 0; frame < 90; frame += 1) {
        const tail = Math.sin((frame / 90) * Math.PI * 2) * 0.55;
        sdk.setParameter(
          expectParameter(puppet, "Tail - Left/Right Swing"),
          tail,
        );
        sdk.setParameter(
          expectParameter(puppet, "Tail - Left/Right Tip Swing"),
          Math.sin((frame / 90) * Math.PI * 2 + Math.PI / 3) * 0.35,
        );
        const draw = sdk.updateAndDraw(puppet, 1 / 60);
        expectDrawList(draw);
        for (const [name, parameter] of watched) {
          const initial = baseline.get(name)!;
          const current = sdk.readParameterValue(parameter);
          const maximum = Math.max(
            ...current.map((value, axis) =>
              Math.abs(value - (initial[axis] ?? 0)),
            ),
          );
          if (name.startsWith("Physics - Head") || name.includes("Ear")) {
            maximumHeadChange = Math.max(maximumHeadChange, maximum);
          } else if (name.includes("Arm")) {
            maximumArmChange = Math.max(maximumArmChange, maximum);
          } else {
            maximumTailChange = Math.max(maximumTailChange, maximum);
          }
        }
      }

      expect(maximumHeadChange).toBeGreaterThan(0.005);
      expect(maximumArmChange).toBeGreaterThan(0.005);
      expect(maximumTailChange).toBeGreaterThan(0.005);
    });
  });
});

async function withMannequin(
  callback: (
    sdk: OfficialInochi2dSdk,
    puppet: OfficialPuppet,
  ) => Promise<void>,
): Promise<void> {
  const wasm = await readFile(resolve(process.cwd(), "src/generated/inochi2d.wasm"));
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(wasm));
  const sdk = await OfficialInochi2dSdk.create(
    new URL("https://fixture.invalid/inochi2d.wasm"),
  );
  const model = await readFile(MODEL_PATH!);
  const puppet = sdk.loadPuppet(new Uint8Array(model));
  try {
    await callback(sdk, puppet);
  } finally {
    sdk.freePuppet(puppet);
    sdk.destroy();
  }
}

function expectParameter(
  puppet: OfficialPuppet,
  name: string,
  dimensions?: 1 | 2,
  bindingCount?: number,
): OfficialParameter {
  const parameter = puppet.parameters.get(name);
  expect(parameter, `missing Mannequin parameter: ${name}`).toBeDefined();
  if (dimensions !== undefined) {
    expect(parameter!.dimensions).toBe(dimensions);
  }
  if (bindingCount !== undefined) {
    expect(parameter!.bindingCount).toBe(bindingCount);
    expect(parameter!.boundBindingCount).toBe(bindingCount);
  }
  return parameter!;
}

function expectDrawList(draw: OfficialDrawList): void {
  expect(draw.commands.length).toBeGreaterThan(0);
  expect(draw.vertices.length).toBeGreaterThan(0);
  expect(draw.indices.length).toBeGreaterThan(0);
  expect(draw.vertices.every(Number.isFinite)).toBe(true);
  expect(draw.commands.every((command) => command.variables.every(Number.isFinite))).toBe(
    true,
  );
}

function maximumColorToAlphaRatio(pixels: Uint8Array): number {
  let maximum = 0;
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const alpha = pixels[offset + 3]!;
    if (alpha < 60 || alpha > 68) {
      continue;
    }
    maximum = Math.max(
      maximum,
      Math.max(pixels[offset]!, pixels[offset + 1]!, pixels[offset + 2]!) /
        alpha,
    );
  }
  return maximum;
}

function changedVertices(before: Float32Array, after: Float32Array): number {
  expect(after.length).toBe(before.length);
  let changed = 0;
  for (let vertex = 0; vertex < after.length; vertex += 4) {
    if (
      Math.abs(after[vertex]! - before[vertex]!) > 1e-4 ||
      Math.abs(after[vertex + 1]! - before[vertex + 1]!) > 1e-4
    ) {
      changed += 1;
    }
  }
  return changed;
}
