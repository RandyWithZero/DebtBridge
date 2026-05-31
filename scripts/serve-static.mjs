import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";

const rootArg = process.argv[2] || "apps/client";
const port = Number(process.argv[3] || process.env.PORT || 5173);
const root = path.resolve(rootArg);

const server = http.createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: { message: "Method Not Allowed" } }));
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  const pathname = decodeURIComponent(url.pathname);
  const requested = path.resolve(root, pathname === "/" ? "index.html" : pathname.slice(1));
  const filePath = requested.startsWith(root) ? requested : path.join(root, "index.html");
  await streamExistingFile(filePath, response);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`DebtBridge client frontend: http://localhost:${port}`);
});

async function streamExistingFile(filePath, response) {
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) throw new Error("not a file");
    response.writeHead(200, { "content-type": contentType(filePath) });
    createReadStream(filePath).pipe(response);
  } catch {
    const fallback = path.join(root, "index.html");
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    createReadStream(fallback).pipe(response);
  }
}

function contentType(filePath) {
  return (
    {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".svg": "image/svg+xml"
    }[path.extname(filePath)] ?? "application/octet-stream"
  );
}
