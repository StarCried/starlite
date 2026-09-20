import { build } from "esbuild";
import { copyFile } from "node:fs/promises";
await build({ entryPoints: ["src/index.ts"], outfile: "dist/index.js", bundle: true, format: "esm", target: "chrome131", minify: true, legalComments: "eof" });
for (const name of ["config", "inspect", "prepare"]) {
  await build({ entryPoints: [`src/${name}.ts`], outfile: `dist/${name}.cjs`, bundle: true, format: "cjs", platform: "node", target: "node22" });
}
await copyFile("src/widget.css", "dist/widget.css");
