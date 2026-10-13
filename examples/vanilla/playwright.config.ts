import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  timeout: 30_000,
  use: {
    browserName: "chromium",
    trace: "retain-on-failure",
  },
  webServer: [
    {command: "npm run serve --workspace @starcried/starlite-hexo-vrm-example",port:4182,reuseExistingServer:true},
    {
      command: "npm run dev",
      port: 4173,
      reuseExistingServer: true,
    },
    {
      command: "npm run serve --workspace @starcried/starlite-hexo-example",
      port: 4174,
      reuseExistingServer: true,
    },
    {
      command: "node tools/no-cors-server.mjs",
      port: 4175,
      reuseExistingServer: true,
    },
  ],
});
