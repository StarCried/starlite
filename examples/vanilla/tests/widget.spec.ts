import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

interface MannequinPoseCentroids {
  iris: { count: number; x: number; y: number };
  face: { count: number; x: number; y: number };
}

function captureFirstPageError(page: Page): {
  promise: Promise<never>;
  dispose(): void;
} {
  let handler: (error: Error) => void = () => undefined;
  const promise = new Promise<never>((_resolve, reject) => {
    handler = (error) => reject(error);
  });
  page.on("pageerror", handler);
  return {
    promise,
    dispose: () => page.off("pageerror", handler),
  };
}

async function mannequinPoseCentroids(
  page: Page,
  png: Buffer,
): Promise<MannequinPoseCentroids> {
  return page.evaluate(async (pngBase64) => {
    const binary = atob(pngBase64);
    const bytes = Uint8Array.from(binary, (value) => value.charCodeAt(0));
    const bitmap = await createImageBitmap(
      new Blob([bytes], { type: "image/png" }),
    );
    const scratch = document.createElement("canvas");
    scratch.width = bitmap.width;
    scratch.height = bitmap.height;
    const context = scratch.getContext("2d", { willReadFrequently: true });
    if (!context) {
      bitmap.close();
      throw new Error("2D canvas is unavailable for Mannequin pose analysis");
    }
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const pixels = context.getImageData(
      0,
      0,
      scratch.width,
      scratch.height,
    ).data;
    const iris = { count: 0, x: 0, y: 0 };
    const face = { count: 0, x: 0, y: 0 };
    const minimumX = Math.floor(scratch.width * 0.35);
    const maximumX = Math.ceil(scratch.width * 0.65);
    const minimumY = Math.floor(scratch.height * 0.07);
    const maximumY = Math.ceil(scratch.height * 0.21);

    for (let y = minimumY; y < maximumY; y += 1) {
      for (let x = minimumX; x < maximumX; x += 1) {
        const offset = (y * scratch.width + x) * 4;
        const red = pixels[offset] ?? 0;
        const green = pixels[offset + 1] ?? 0;
        const blue = pixels[offset + 2] ?? 0;
        if (
          y >= scratch.height * 0.09 &&
          y < scratch.height * 0.2 &&
          red > 70 &&
          green > 25 &&
          blue < 105 &&
          red - blue > 35 &&
          green - blue > 5
        ) {
          iris.count += 1;
          iris.x += x;
          iris.y += y;
        }
        if (
          red > 150 &&
          green > 85 &&
          blue > 75 &&
          red - green > 20 &&
          red - blue > 15
        ) {
          face.count += 1;
          face.x += x;
          face.y += y;
        }
      }
    }
    if (iris.count === 0 || face.count === 0) {
      throw new Error("Mannequin face landmarks are missing from the render");
    }
    return {
      iris: {
        count: iris.count,
        x: iris.x / iris.count,
        y: iris.y / iris.count,
      },
      face: {
        count: face.count,
        x: face.x / face.count,
        y: face.y / face.count,
      },
    };
  }, png.toString("base64"));
}

async function maximumFaceDisplacement(
  page: Page,
  canvas: Locator,
  baseline: MannequinPoseCentroids,
): Promise<number> {
  let maximum = 0;
  for (let sample = 0; sample < 7; sample += 1) {
    await page.waitForTimeout(100);
    const pose = await mannequinPoseCentroids(page, await canvas.screenshot());
    maximum = Math.max(
      maximum,
      Math.hypot(
        pose.face.x - baseline.face.x,
        pose.face.y - baseline.face.y,
      ),
    );
  }
  return maximum;
}

test("vanilla example loads a synthetic puppet through real WASM", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));

  await page.goto("http://127.0.0.1:4173/");
  await expect(page.locator('[data-inochi2d-status="running"]')).toBeVisible();
  expect(requests.some((url) => url.includes("inochi2d") && url.endsWith(".wasm"))).toBe(true);
  expect(requests.some((url) => url.includes("puppet.inp"))).toBe(true);
});

test("desktop default leaves clearance for fixed bottom controls", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("http://127.0.0.1:4173/");
  const widget = page.locator('[data-inochi2d-status="running"]');
  await expect(widget).toBeVisible();
  const bounds = await widget.boundingBox();
  expect(bounds).not.toBeNull();
  expect(900 - (bounds!.y + bounds!.height)).toBeGreaterThanOrEqual(80);
});

test("entry and click scenes show safe dialogue above the model", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("http://127.0.0.1:4173/?dialogue=1");

  const widget = page.locator('[data-inochi2d-status="running"]');
  const bubble = widget.locator('[role="status"]');
  await expect(widget).toBeVisible();
  await expect(bubble).toHaveText("Welcome <b>friend</b>");
  await expect(bubble.locator("b")).toHaveCount(0);

  const widgetBounds = await widget.boundingBox();
  const bubbleBounds = await bubble.boundingBox();
  expect(widgetBounds).not.toBeNull();
  expect(bubbleBounds).not.toBeNull();
  expect(bubbleBounds!.y + bubbleBounds!.height).toBeLessThanOrEqual(
    widgetBounds!.y,
  );

  await widget.click({ position: { x: 130, y: 180 } });
  await expect(bubble).toHaveText("Clicked <img src=x>");
  await expect(bubble).toHaveAttribute("data-model-animation", "Click");
  await expect(bubble.locator("img")).toHaveCount(0);
});

test("pipeline output loads through real WASM when supplied", async ({ page }) => {
  test.setTimeout(60_000);
  const modelPath = process.env.INOCHI2D_TEST_MODEL_PATH;
  test.skip(!modelPath, "set INOCHI2D_TEST_MODEL_PATH to validate a prepared public model");
  const model = readFileSync(modelPath!);
  const manifest = readFileSync(resolve(dirname(modelPath!), "manifest.json"));
  await page.route("**/models/puppet.inp", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/octet-stream",
      body: model,
    });
  });
  await page.route("**/models/manifest.json", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: manifest,
    });
  });

  const pageError = captureFirstPageError(page);
  const widget = page.locator(".inochi2d-widget");
  try {
    await page.goto("http://127.0.0.1:4173/?profile=aka");
    await Promise.race([
      expect
        .poll(
          async () => ({
            status: await widget.getAttribute("data-inochi2d-status"),
            error: await widget.getAttribute("data-inochi2d-error"),
          }),
          {
            // The public Aka fixture is close to the 8 MiB release limit. Keep
            // the assertion strict, but allow the runtime's loading window.
            timeout: 30_000,
          },
        )
        .toEqual({ status: "running", error: null }),
      pageError.promise,
    ]);
  } finally {
    pageError.dispose();
  }
  const canvas = widget.locator(".inochi2d-widget__canvas");
  await expect(canvas).toHaveCount(1);
  await expect(widget).toHaveAttribute("data-inochi2d-breathing", "model");

  const orientationScreenshot = await canvas.screenshot();
  const orientation = await page.evaluate(async (pngBase64) => {
    const binary = atob(pngBase64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const scratch = document.createElement("canvas");
    scratch.width = bitmap.width;
    scratch.height = bitmap.height;
    const context = scratch.getContext("2d", { willReadFrequently: true });
    if (!context) {
      return { upperCenterOrange: 0, lowerCenterOrange: 0 };
    }
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const pixels = context.getImageData(0, 0, scratch.width, scratch.height).data;
    let upperCenterOrange = 0;
    let lowerCenterOrange = 0;
    for (let y = 0; y < scratch.height; y += 1) {
      for (let x = 0; x < scratch.width; x += 1) {
        const offset = (y * scratch.width + x) * 4;
        const red = pixels[offset] ?? 0;
        const green = pixels[offset + 1] ?? 0;
        const blue = pixels[offset + 2] ?? 0;
        if (
          x >= scratch.width * 0.2 &&
          x < scratch.width * 0.75 &&
          red > 140 &&
          green > 55 &&
          red > green * 1.15 &&
          green > blue * 1.05
        ) {
          if (y < scratch.height / 2) {
            upperCenterOrange += 1;
          } else {
            lowerCenterOrange += 1;
          }
        }
      }
    }
    return { upperCenterOrange, lowerCenterOrange };
  }, orientationScreenshot.toString("base64"));
  expect(
    orientation.upperCenterOrange,
    `public Aka orientation metric: ${JSON.stringify(orientation)}`,
  ).toBeGreaterThan(orientation.lowerCenterOrange);

  const before = await widget.boundingBox();
  expect(before).not.toBeNull();
  await page.mouse.move(before!.x + before!.width / 2, before!.y + before!.height / 2);
  await page.waitForTimeout(650);
  const idleStart = await canvas.screenshot();
  await page.waitForTimeout(800);
  const idleEnd = await canvas.screenshot();
  expect(idleEnd.equals(idleStart)).toBe(false);

  const beforeClick = await canvas.screenshot();
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(300);
  const clickPeak = await canvas.screenshot();
  expect(clickPeak.equals(beforeClick)).toBe(false);
  const armDelta = await page.evaluate(
    async ({ beforeBase64, afterBase64 }) => {
      const decode = async (base64: string): Promise<ImageData> => {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) {
          bytes[index] = binary.charCodeAt(index);
        }
        const bitmap = await createImageBitmap(
          new Blob([bytes], { type: "image/png" }),
        );
        const scratch = document.createElement("canvas");
        scratch.width = bitmap.width;
        scratch.height = bitmap.height;
        const context = scratch.getContext("2d", {
          willReadFrequently: true,
        });
        if (!context) {
          bitmap.close();
          throw new Error("2D canvas is unavailable for arm delta");
        }
        context.drawImage(bitmap, 0, 0);
        bitmap.close();
        return context.getImageData(0, 0, scratch.width, scratch.height);
      };
      const before = await decode(beforeBase64);
      const after = await decode(afterBase64);
      let screenLeftChangedPixels = 0;
      let screenRightChangedPixels = 0;
      for (
        let y = Math.floor(before.height * 0.25);
        y < Math.floor(before.height * 0.75);
        y += 1
      ) {
        for (let x = 0; x < before.width; x += 1) {
          const offset = (y * before.width + x) * 4;
          const maximumChannelDelta = Math.max(
            Math.abs(before.data[offset]! - after.data[offset]!),
            Math.abs(before.data[offset + 1]! - after.data[offset + 1]!),
            Math.abs(before.data[offset + 2]! - after.data[offset + 2]!),
            Math.abs(before.data[offset + 3]! - after.data[offset + 3]!),
          );
          if (maximumChannelDelta > 30) {
            if (x < before.width / 2) {
              screenLeftChangedPixels += 1;
            } else {
              screenRightChangedPixels += 1;
            }
          }
        }
      }
      return { screenLeftChangedPixels, screenRightChangedPixels };
    },
    {
      beforeBase64: beforeClick.toString("base64"),
      afterBase64: clickPeak.toString("base64"),
    },
  );
  expect(
    armDelta.screenLeftChangedPixels + armDelta.screenRightChangedPixels,
    `public Aka arm animation changed ${JSON.stringify(armDelta)}`,
  ).toBeGreaterThan(600);
  expect(
    Math.max(
      armDelta.screenLeftChangedPixels,
      armDelta.screenRightChangedPixels,
    ),
    `public Aka animated arm changed ${JSON.stringify(armDelta)}`,
  ).toBeGreaterThan(400);
  await expect(widget).not.toHaveAttribute("style", /(?:left|top):/u);

  await page.mouse.move(before!.x + before!.width / 2, before!.y + before!.height / 2);
  await page.mouse.down();
  await page.mouse.move(before!.x - 240, before!.y - 160, { steps: 5 });
  await page.mouse.up();
  const after = await widget.boundingBox();
  expect(after).not.toBeNull();
  expect(after!.x).toBeLessThan(before!.x - 200);
  expect(after!.y).toBeLessThan(before!.y - 120);
  expect(after!.width).toBe(before!.width);
  expect(after!.height).toBe(before!.height);

  await page.mouse.move(20, 360);
  await page.waitForTimeout(500);
  const leftPose = await canvas.screenshot();
  await page.mouse.move(1260, 360);
  await page.waitForTimeout(500);
  const rightPose = await canvas.screenshot();
  expect(rightPose.equals(leftPose)).toBe(false);
});

test("Mannequin output auto-fits and runs inferred motion through real WASM", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript(() => {
    Math.random = () => 0.99;
  });
  const modelPath = process.env.INOCHI2D_MANNEQUIN_TEST_MODEL_PATH;
  test.skip(
    !modelPath,
    "set INOCHI2D_MANNEQUIN_TEST_MODEL_PATH to validate a prepared Mannequin model",
  );
  const model = readFileSync(modelPath!);
  const manifest = readFileSync(resolve(dirname(modelPath!), "manifest.json"));
  await page.route("**/models/puppet.inp", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/octet-stream",
      body: model,
    });
  });
  await page.route("**/models/manifest.json", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: manifest,
    });
  });

  const pageError = captureFirstPageError(page);
  const widget = page.locator(".inochi2d-widget");
  try {
    await page.goto(
      "http://127.0.0.1:4173/?profile=mannequin&dialogue=1&idle=fast",
    );
    await Promise.race([
      expect
        .poll(
          async () => ({
            status: await widget.getAttribute("data-inochi2d-status"),
            error: await widget.getAttribute("data-inochi2d-error"),
          }),
          { timeout: 15_000 },
        )
        .toEqual({ status: "running", error: null }),
      pageError.promise,
    ]);
  } finally {
    pageError.dispose();
  }
  await expect(widget).toHaveAttribute("data-inochi2d-breathing", "model");
  const bubble = widget.locator('[role="status"]');
  await expect(bubble).toContainText(/模型已加载|欢迎来到/);
  await expect(bubble).toHaveAttribute("data-inochi2d-scene", "enter");
  const canvas = widget.locator(".inochi2d-widget__canvas");
  await page.waitForTimeout(500);
  const enterPoseCentroids = await mannequinPoseCentroids(
    page,
    await canvas.screenshot(),
  );
  await expect(widget).toHaveCSS("width", "390px");
  await expect(widget).toHaveCSS("height", "540px");
  expect(
    await canvas.evaluate((element) => {
      const canvasElement = element as HTMLCanvasElement;
      return {
        cssWidth: canvasElement.getBoundingClientRect().width,
        cssHeight: canvasElement.getBoundingClientRect().height,
        backingWidth: canvasElement.width,
        backingHeight: canvasElement.height,
        devicePixelRatio: window.devicePixelRatio,
      };
    }),
  ).toEqual({
    cssWidth: 390,
    cssHeight: 540,
    backingWidth: 390,
    backingHeight: 540,
    devicePixelRatio: 1,
  });
  const neutral = await canvas.screenshot();
  const alphaBounds = await page.evaluate(async (pngBase64) => {
    const binary = atob(pngBase64);
    const bytes = Uint8Array.from(binary, (value) => value.charCodeAt(0));
    const bitmap = await createImageBitmap(
      new Blob([bytes], { type: "image/png" }),
    );
    const scratch = document.createElement("canvas");
    scratch.width = bitmap.width;
    scratch.height = bitmap.height;
    const context = scratch.getContext("2d", { willReadFrequently: true });
    if (!context) {
      bitmap.close();
      throw new Error("2D canvas is unavailable for Mannequin bounds");
    }
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const pixels = context.getImageData(
      0,
      0,
      scratch.width,
      scratch.height,
    ).data;
    let minX = scratch.width;
    let minY = scratch.height;
    let maxX = -1;
    let maxY = -1;
    const background = [
      pixels[0] ?? 0,
      pixels[1] ?? 0,
      pixels[2] ?? 0,
    ];
    for (let y = 0; y < scratch.height; y += 1) {
      for (let x = 0; x < scratch.width; x += 1) {
        const offset = (y * scratch.width + x) * 4;
        const colorDelta = Math.max(
          Math.abs((pixels[offset] ?? 0) - background[0]!),
          Math.abs((pixels[offset + 1] ?? 0) - background[1]!),
          Math.abs((pixels[offset + 2] ?? 0) - background[2]!),
        );
        if (colorDelta > 12) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }
    return {
      canvasWidth: scratch.width,
      canvasHeight: scratch.height,
      minX,
      minY,
      maxX,
      maxY,
    };
  }, neutral.toString("base64"));
  expect(alphaBounds.maxX - alphaBounds.minX).toBeGreaterThan(40);
  expect(alphaBounds.maxY - alphaBounds.minY).toBeGreaterThan(240);
  expect(alphaBounds.minY).toBeGreaterThanOrEqual(4);
  expect(alphaBounds.maxY).toBeLessThan(alphaBounds.canvasHeight - 4);

  await page.waitForTimeout(1_200);
  const settledPoseCentroids = await mannequinPoseCentroids(
    page,
    await canvas.screenshot(),
  );
  expect(
    Math.hypot(
      enterPoseCentroids.face.x - settledPoseCentroids.face.x,
      enterPoseCentroids.face.y - settledPoseCentroids.face.y,
    ),
  ).toBeGreaterThan(0.5);
  await expect(bubble).toHaveAttribute("data-inochi2d-scene", "idle", {
    timeout: 12_000,
  });
  await expect(bubble).toContainText(/自然状态对话|头发和袖子/);
  expect(
    await maximumFaceDisplacement(page, canvas, settledPoseCentroids),
  ).toBeGreaterThan(0.5);
  await page.waitForTimeout(800);
  await widget.evaluate((element) => {
    element.style.left = "445px";
    element.style.right = "auto";
    element.style.top = "180px";
    element.style.bottom = "auto";
  });
  const bounds = await widget.boundingBox();
  expect(bounds).not.toBeNull();
  const pointerTargets = {
    neutral: {
      x: bounds!.x + bounds!.width / 2,
      y: bounds!.y + bounds!.height / 2,
    },
    left: { x: 20, y: bounds!.y + bounds!.height / 2 },
    right: { x: 1_260, y: bounds!.y + bounds!.height / 2 },
    up: { x: bounds!.x + bounds!.width / 2, y: 20 },
    down: { x: bounds!.x + bounds!.width / 2, y: 880 },
  };
  const poseCentroids = {} as Record<
    keyof typeof pointerTargets,
    MannequinPoseCentroids
  >;
  for (const [name, target] of Object.entries(pointerTargets) as Array<
    [keyof typeof pointerTargets, { x: number; y: number }]
  >) {
    await page.mouse.move(target.x, target.y, { steps: 8 });
    await page.waitForTimeout(500);
    poseCentroids[name] = await mannequinPoseCentroids(
      page,
      await canvas.screenshot(),
    );
  }
  expect(poseCentroids.left.iris.count).toBeGreaterThan(8);
  expect(poseCentroids.right.iris.count).toBeGreaterThan(8);
  expect(poseCentroids.up.iris.count).toBeGreaterThan(8);
  expect(poseCentroids.down.iris.count).toBeGreaterThan(8);
  const horizontalIrisSpread =
    poseCentroids.right.iris.x - poseCentroids.left.iris.x;
  expect(horizontalIrisSpread).toBeGreaterThan(3);
  expect(horizontalIrisSpread).toBeLessThan(16);
  expect(
    poseCentroids.down.iris.y - poseCentroids.up.iris.y,
  ).toBeGreaterThan(1.5);
  const horizontalFaceSpread =
    poseCentroids.right.face.x - poseCentroids.left.face.x;
  expect(horizontalFaceSpread).toBeGreaterThan(0.5);
  expect(horizontalFaceSpread).toBeLessThan(8);
  expect(
    poseCentroids.down.face.y - poseCentroids.up.face.y,
  ).toBeGreaterThan(0.75);

  const ambientStart = await canvas.screenshot();
  await page.waitForTimeout(1_100);
  const ambientEnd = await canvas.screenshot();
  expect(ambientEnd.equals(ambientStart)).toBe(false);

  const clickBounds = await widget.boundingBox();
  expect(clickBounds).not.toBeNull();
  await page.mouse.move(clickBounds!.x + 130, clickBounds!.y + 180);
  await page.waitForTimeout(500);
  const beforeClickCentroids = await mannequinPoseCentroids(
    page,
    await canvas.screenshot(),
  );
  await widget.click({ position: { x: 130, y: 180 } });
  await expect(bubble).toHaveAttribute("data-inochi2d-scene", "click");
  await expect(bubble).toContainText(/你点击了模型|Click 动画/);
  expect(
    await maximumFaceDisplacement(page, canvas, beforeClickCentroids),
  ).toBeGreaterThan(0.5);
  await page.waitForTimeout(800);

  const beforeDrag = await widget.boundingBox();
  expect(beforeDrag).not.toBeNull();
  await page.mouse.move(
    beforeDrag!.x + beforeDrag!.width / 2,
    beforeDrag!.y + beforeDrag!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    beforeDrag!.x + beforeDrag!.width / 2 + 200,
    beforeDrag!.y + beforeDrag!.height / 2 + 100,
    { steps: 8 },
  );
  await page.mouse.up();
  const afterDrag = await widget.boundingBox();
  expect(afterDrag).not.toBeNull();
  expect(afterDrag!.x).toBeCloseTo(beforeDrag!.x + 200, 0);
  expect(afterDrag!.y).toBeCloseTo(beforeDrag!.y + 100, 0);

  await canvas.dblclick({ position: { x: 195, y: 270 } });
  await page.waitForTimeout(100);
  const afterReset = await widget.boundingBox();
  expect(afterReset).not.toBeNull();
  expect(afterReset!.x).toBeCloseTo(874, 0);
  expect(afterReset!.y).toBeCloseTo(280, 0);
  await expect(widget).toHaveAttribute("data-inochi2d-status", "running");
});

for (const failure of ["missing", "corrupt", "cross-origin"] as const) {
  test(`vanilla example shows fallback for a ${failure} model`, async ({ page }) => {
    await page.goto(`http://127.0.0.1:4173/?model=${failure}`);
    const widget = page.locator('[data-inochi2d-status="fallback"]');
    await expect(widget).toBeVisible();
    await expect(widget.locator("canvas")).toBeHidden();
    await expect(widget.locator("img")).toHaveAttribute("src", "/fallback.svg");
    await expect(widget.locator("img")).toBeVisible();
  });
}

test("Hexo mobile bootstrap fetches no runtime JavaScript, WASM, or model", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));

  await page.goto("http://127.0.0.1:4174/");
  await expect(page.locator("[data-starlite-widget-host]")).toHaveCount(0);
  expect(requests.some((url) => url.endsWith("/index.js"))).toBe(false);
  expect(requests.some((url) => url.endsWith(".wasm"))).toBe(false);
  expect(requests.some((url) => url.endsWith(".inp"))).toBe(false);
  await context.close();
});

test("twenty PJAX completions keep one Hexo canvas and one asset load", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));

  await page.goto("http://127.0.0.1:4174/");
  await expect(page.locator('[data-inochi2d-status="running"]')).toBeVisible();
  await page.evaluate(() => {
    for (let index = 0; index < 20; index += 1) {
      document.dispatchEvent(new Event("pjax:complete"));
    }
  });

  await expect(page.locator(".inochi2d-widget__canvas")).toHaveCount(1);
  expect(
    requests.filter((url) => url.includes("inochi2d") && url.endsWith(".wasm")),
  ).toHaveLength(1);
  expect(requests.filter((url) => url.endsWith("puppet.inp"))).toHaveLength(1);
});

test("raw Hexo Inochi2D distribution toggles performance metrics without reloading its canvas", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("http://127.0.0.1:4174/");
  const host = page.locator(".inochi2d-widget");
  await expect(host).toHaveAttribute("data-inochi2d-status", "running");
  const panel = host.locator("[data-model-performance]");
  await expect(panel).toHaveCount(0);
  await page.evaluate(() => {
    const state = (globalThis as unknown as {__hexoStarLiteWidgetState: {controller: {setPerformanceVisible(value: boolean): void}}}).__hexoStarLiteWidgetState;
    state.controller.setPerformanceVisible(true);
  });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("CPU p95");
  await expect(panel).toContainText(/\d+\.\d FPS/);
  expect(await panel.evaluate(element => getComputedStyle(element).pointerEvents)).toBe("none");
  await page.evaluate(() => {
    const state = (globalThis as unknown as {__hexoStarLiteWidgetState: {controller: {pause(): void}}}).__hexoStarLiteWidgetState;
    state.controller.pause();
  });
  await expect(panel).toHaveText("StarLite · paused");
  await page.evaluate(() => {
    const state = (globalThis as unknown as {__hexoStarLiteWidgetState: {controller: {resume(): void; setPerformanceVisible(value: boolean): void}}}).__hexoStarLiteWidgetState;
    state.controller.resume(); state.controller.setPerformanceVisible(false);
  });
  await expect(panel).toHaveCount(0);
  await expect(host).toHaveAttribute("data-inochi2d-status", "running");
  await expect(host.locator("canvas")).toHaveCount(1);
  expect(errors).toEqual([]);
});
