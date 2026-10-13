import { copyFile } from "node:fs/promises";
await copyFile("src/bubble.css", "dist/bubble.css");
