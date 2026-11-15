// @ts-check
/**
 * Minimal static server for the Live e2e tests: serves `build/client` the way the site Worker's
 * static assets do (`not_found_handling: "single-page-application"` → `__spa-fallback.html` for
 * page paths). `/data/*` falls back to the committed contract fixtures when the build has no data,
 * so wave-3 pages can be tested before the real emitter (W3.6) runs.
 *
 *   node test/e2e/serve.js [port]
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const clientDir = join(appDir, "build", "client");
const fixtureDir = join(appDir, "app", "data", "fixtures", "data");
const port = Number(process.argv[2] ?? process.env["PORT"] ?? 4173);

/** @type {Record<string, string>} */
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
};

/** @param {string} root @param {string} rel */
function fileIn(root, rel) {
  const p = normalize(join(root, rel));
  if (!p.startsWith(root)) return null;
  return existsSync(p) && statSync(p).isFile() ? p : null;
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  let path;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  let file = fileIn(clientDir, path) ?? (path.endsWith("/") ? fileIn(clientDir, join(path, "index.html")) : null);
  if (!file && path.startsWith("/data/")) file = fileIn(fixtureDir, path.slice("/data/".length));
  if (!file && extname(path) === "") {
    file = fileIn(clientDir, "__spa-fallback.html") ?? fileIn(clientDir, "index.html");
  }
  if (!file) {
    res.writeHead(404, { "content-type": "text/plain" }).end("not found");
    return;
  }
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`live e2e server on http://127.0.0.1:${port}`);
});
