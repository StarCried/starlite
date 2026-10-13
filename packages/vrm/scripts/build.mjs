import { build } from "esbuild";
import { readFile, writeFile, copyFile } from "node:fs/promises";
await build({ entryPoints: ["src/index.ts"], outfile: "dist/index.js", bundle: true, format: "esm", target: "chrome131", minify: true, legalComments: "eof" });
for (const name of ["config", "inspect", "prepare"]) {
  await build({ entryPoints: [`src/${name}.ts`], outfile: `dist/${name}.cjs`, bundle: true, format: "cjs", platform: "node", target: "node22" });
}
await writeFile("dist/widget.css", await readFile("src/widget.css", "utf8") + "\n" + await readFile(new URL(import.meta.resolve("@starcried/starlite-core/bubble.css")), "utf8"));
