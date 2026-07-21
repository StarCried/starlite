import { copyFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    {
      name: "copy-inox2d-wasm",
      async closeBundle() {
        const source = resolve(import.meta.dirname, "../../packages/inochi2d-web/dist/generated/runtime_bg.wasm");
        const destinationDirectory = resolve(import.meta.dirname, "dist/assets");
        await mkdir(destinationDirectory, { recursive: true });
        await copyFile(source, resolve(destinationDirectory, "runtime_bg.wasm"));
      },
    },
  ],
});
