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
const apiTarget = process.env.API_TARGET || "http://localhost:3000";

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost");
  if (url.pathname.startsWith("/api/")) return proxyApiRequest(request, response, url);

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: { message: "仅支持静态资源 GET/HEAD 请求" } }));
    return;
  }

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

async function proxyApiRequest(request, response, url) {
  try {
    const targetUrl = new URL(`${url.pathname}${url.search}`, apiTarget);
    const upstream = await fetch(targetUrl, {
      method: request.method,
      headers: forwardedHeaders(request.headers),
      body: ["GET", "HEAD"].includes(request.method) ? undefined : await readBody(request)
    });
    const headers = Object.fromEntries(upstream.headers.entries());
    response.writeHead(upstream.status, headers);
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    response.end(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: { message: "API 代理请求失败", detail: error.message } }));
  }
}

function forwardedHeaders(headers) {
  const result = { ...headers };
  delete result.host;
  delete result.connection;
  delete result["content-length"];
  return result;
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

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
