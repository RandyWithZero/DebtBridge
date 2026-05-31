import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appName = process.argv[2];

if (!appName || !["client", "admin"].includes(appName)) {
  console.error("Usage: node apps/static-server.js <client|admin>");
  process.exit(1);
}

const root = path.resolve(__dirname, appName);
const port = Number(process.env.PORT ?? (appName === "client" ? 3001 : 3002));

const server = http.createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: { message: "仅支持静态资源 GET/HEAD 请求" } }));
    return;
  }

  const url = new URL(request.url, "http://localhost");
  const pathname = decodeURIComponent(url.pathname);
  const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
  const requestedPath = path.resolve(root, relativePath);
  const safePath = requestedPath.startsWith(root) ? requestedPath : path.join(root, "index.html");

  try {
    const fileStat = await stat(safePath);
    if (fileStat.isFile()) return streamFile(safePath, response);
  } catch {
    // Fall through to index.html for client-side routes.
  }

  return streamFile(path.join(root, "index.html"), response);
});

server.listen(port, () => {
  console.log(`DebtBridge ${appName} frontend listening on http://localhost:${port}`);
});

function streamFile(filePath, response) {
  response.writeHead(200, { "content-type": contentType(filePath) });
  createReadStream(filePath).pipe(response);
}

function contentType(filePath) {
  const extension = path.extname(filePath);
  return (
    {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".svg": "image/svg+xml"
    }[extension] ?? "application/octet-stream"
  );
}
