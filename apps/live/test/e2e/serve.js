// @ts-check
/**
 * Minimal static server for the Live e2e tests: serves `build/client` the way the site Worker's
 * static assets do: `x.html` at `/x`, `x/index.html` at `/x/`, and the SPA fallback
 * (`not_found_handling: "single-page-application"` → `index.html`) for other page paths.
 *
 * `/data/*` is always answered from the committed contract fixtures (`app/data/fixtures/data`), never
 * from `build/client/data`: a local `npm run data:build` writes the real corpus into
 * `public/data/`, which the build copies into `build/client/data`, and the specs assert on fixture
 * shiurim. Set `LIVE_E2E_DATA=build` to serve the built data instead (a manual smoke run).
 *
 *   node test/e2e/serve.js [port]
 */
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, constants as zlibConstants, gzipSync } from "node:zlib";

const appDir = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const clientDir = join(appDir, "build", "client");
const fixtureDir = join(appDir, "app", "data", "fixtures", "data");
const port = Number(process.argv[2] ?? process.env["PORT"] ?? 4173);
const dataDir = process.env["LIVE_E2E_DATA"] === "build" ? join(clientDir, "data") : fixtureDir;

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
  const isData = path.startsWith("/data/");
  let file = isData
    ? fileIn(dataDir, path.slice("/data/".length))
    : (fileIn(clientDir, path) ??
      (path.endsWith("/") ? fileIn(clientDir, join(path, "index.html")) : fileIn(clientDir, `${path}.html`)));
  if (!file && !isData && extname(path) === "") {
    file = fileIn(clientDir, "__spa-fallback.html") ?? fileIn(clientDir, "index.html");
  }
  if (!file) {
    res.writeHead(404, { "content-type": "text/plain" }).end("not found");
    return;
  }
  const type = TYPES[extname(file)] ?? "application/octet-stream";
  // Text is compressed as Cloudflare does in production (brotli, else gzip), so Lighthouse measures
  // transfer sizes close to the real ones.
  const accept = String(req.headers["accept-encoding"] ?? "");
  const encoding = !COMPRESSIBLE.test(type) ? null : /\bbr\b/u.test(accept) ? "br" : /\bgzip\b/u.test(accept) ? "gzip" : null;
  if (!encoding) {
    res.writeHead(200, { "content-type": type });
    createReadStream(file).pipe(res);
    return;
  }
  const body = compressed(file, encoding);
  res.writeHead(200, { "content-type": type, "content-encoding": encoding, "content-length": body.length, vary: "accept-encoding" });
  res.end(body);
});

const COMPRESSIBLE = /^(text\/|application\/(json|javascript|manifest\+json)|image\/svg)/u;
/** @type {Map<string, Buffer>} */
const compressCache = new Map();

/** @param {string} file @param {"br" | "gzip"} encoding */
function compressed(file, encoding) {
  const key = `${encoding}:${file}:${statSync(file).mtimeMs}`;
  let out = compressCache.get(key);
  if (!out) {
    const raw = readFileSync(file);
    out =
      encoding === "br"
        ? brotliCompressSync(raw, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 5 } })
        : gzipSync(raw, { level: 6 });
    compressCache.set(key, out);
  }
  return out;
}

server.listen(port, "127.0.0.1", () => {
  console.log(`live e2e server on http://127.0.0.1:${port}`);
});
