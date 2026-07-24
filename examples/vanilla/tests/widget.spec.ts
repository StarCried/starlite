import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

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

test("pipeline output loads through real WASM when supplied", async ({ page }) => {
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

  await page.goto("http://127.0.0.1:4173/?profile=aka");
  const widget = page.locator(".inochi2d-widget");
  await expect
    .poll(async () => ({
      status: await widget.getAttribute("data-inochi2d-status"),
      error: await widget.getAttribute("data-inochi2d-error"),
    }))
    .toEqual({ status: "running", error: null });
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
  await expect(page.locator("[data-inochi2d-widget-host]")).toHaveCount(0);
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
