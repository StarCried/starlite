import { expect, test } from "@playwright/test";

test("vanilla example loads a synthetic puppet through real WASM", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));

  await page.goto("http://127.0.0.1:4173/");
  await expect(page.locator('[data-inochi2d-status="running"]')).toBeVisible();
  expect(requests.some((url) => url.includes("runtime_bg.wasm"))).toBe(true);
  expect(requests.some((url) => url.includes("puppet.inp"))).toBe(true);
});

for (const failure of ["missing", "corrupt", "cross-origin"] as const) {
  test(`vanilla example shows fallback for a ${failure} model`, async ({ page }) => {
    await page.goto(`http://127.0.0.1:4173/?model=${failure}`);
    const widget = page.locator('[data-inochi2d-status="fallback"]');
    await expect(widget).toBeVisible();
    await expect(widget.locator("img")).toHaveAttribute("src", "/fallback.svg");
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
  expect(requests.filter((url) => url.endsWith("runtime_bg.wasm"))).toHaveLength(1);
  expect(requests.filter((url) => url.endsWith("puppet.inp"))).toHaveLength(1);
});
