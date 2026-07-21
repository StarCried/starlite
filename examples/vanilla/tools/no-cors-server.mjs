import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";

const fixture = resolve(import.meta.dirname, "../public/models/puppet.inp");
const server = createServer(async (request, response) => {
  if (request.url !== "/puppet.inp") {
    response.writeHead(404).end();
    return;
  }
  const bytes = await readFile(fixture);
  // Deliberately omit Access-Control-Allow-Origin for the CORS failure test.
  response.writeHead(200, { "Content-Type": "application/octet-stream" });
  response.end(bytes);
});

server.listen(4175, "127.0.0.1");
