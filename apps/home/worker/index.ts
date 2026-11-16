/**
 * emunas-home site Worker.
 *
 * Static assets (dist/) are served by the platform without running this code.
 * `run_worker_first: ["/files/*"]` in wrangler.jsonc sends only `/files/*` here: those paths are
 * the essay and article PDFs and images copied from the old site, read from R2 (binding FILES,
 * bucket `emunas`) at key `site/files/<rest>`. Only that prefix is ever read.
 *
 * Supports GET and HEAD, single byte ranges (206, 416), and conditional requests (ETag,
 * If-None-Match / If-Modified-Since → 304, If-Match / If-Unmodified-Since → 412, If-Range).
 * A path that is not a valid file name, or a key that is not in R2, falls through to ASSETS,
 * which answers with the site's 404 page.
 *
 * Responses produced here do not get `_headers` rules, so the Worker sets its own security and
 * caching headers, and `X-Robots-Tag: noindex` on workers.dev hosts.
 */

/** The parts of a Fetcher (the assets binding) this Worker uses. */
export interface FetcherLike {
  fetch(request: Request): Promise<Response>;
}

/** The parts of an R2 object this Worker uses. */
export interface R2ObjectLike {
  readonly size: number;
  readonly httpEtag: string;
  readonly uploaded: Date;
  writeHttpMetadata(headers: Headers): void;
}

export interface R2ObjectBodyLike extends R2ObjectLike {
  readonly body: ReadableStream;
}

export interface R2GetOptionsLike {
  range?: { offset: number; length: number };
}

/** The parts of an R2 bucket binding this Worker uses. */
export interface R2BucketLike {
  head(key: string): Promise<R2ObjectLike | null>;
  get(key: string, options?: R2GetOptionsLike): Promise<R2ObjectBodyLike | null>;
}

export interface Env {
  ASSETS: FetcherLike;
  FILES: R2BucketLike;
}

export const FILES_PATH_PREFIX = "/files/";
export const R2_KEY_PREFIX = "site/files/";
export const CACHE_CONTROL = "public, max-age=86400, stale-while-revalidate=604800";

/** Lowercase path segments of letters, digits, `-`, `_` and `.`, never `.`/`..` or empty. */
const SEGMENT_RE = /^[a-z0-9][a-z0-9._-]*$/;

/** `/files/essays/noach.pdf` → `site/files/essays/noach.pdf`; null for anything else. */
export function keyForPath(pathname: string): string | null {
  if (!pathname.startsWith(FILES_PATH_PREFIX)) return null;
  const rest = pathname.slice(FILES_PATH_PREFIX.length);
  const segs = rest.split("/");
  if (segs.length === 0 || !segs.every((s) => SEGMENT_RE.test(s) && !s.includes(".."))) return null;
  return R2_KEY_PREFIX + rest;
}

export function isWorkersDevHost(hostname: string): boolean {
  return hostname === "workers.dev" || hostname.endsWith(".workers.dev");
}

export type ByteRange = { readonly offset: number; readonly length: number };

/**
 * Parses a `Range` header against an object of `size` bytes (RFC 9110 §14).
 * - `null`: no usable range (absent, another unit, several ranges, malformed): serve the whole file.
 * - `"unsatisfiable"`: a well-formed range that selects no bytes (416).
 */
export function parseRange(header: string | null, size: number): ByteRange | "unsatisfiable" | null {
  if (header === null) return null;
  const m = /^bytes=\s*(\d*)\s*-\s*(\d*)\s*$/i.exec(header.trim());
  if (!m) return null;
  const [, a = "", b = ""] = m;
  if (a === "" && b === "") return null;
  if (a === "") {
    const suffix = Number(b);
    if (suffix === 0 || size === 0) return "unsatisfiable";
    const length = Math.min(suffix, size);
    return { offset: size - length, length };
  }
  const start = Number(a);
  const end = b === "" ? size - 1 : Number(b);
  if (b !== "" && end < start) return null;
  if (start >= size) return "unsatisfiable";
  return { offset: start, length: Math.min(end, size - 1) - start + 1 };
}

/** Strong or weak entity-tag list match (weak comparison, as for If-None-Match). */
function etagListMatches(header: string, etag: string): boolean {
  if (header.trim() === "*") return true;
  const bare = (t: string) => t.trim().replace(/^W\//, "");
  return header.split(",").some((t) => bare(t) === bare(etag));
}

function parseDate(v: string | null): number | null {
  if (v === null) return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

/** Seconds precision, as HTTP dates carry. */
const seconds = (d: Date) => Math.floor(d.getTime() / 1000) * 1000;

export type Precondition = "ok" | "not-modified" | "failed";

/** Evaluates the conditional request headers in RFC 9110 §13.2.2 order. */
export function evaluatePreconditions(h: Headers, obj: R2ObjectLike): Precondition {
  const ifMatch = h.get("if-match");
  if (ifMatch !== null) {
    const strong = ifMatch.trim() === "*" || ifMatch.split(",").some((t) => t.trim() === obj.httpEtag && !t.trim().startsWith("W/"));
    if (!strong) return "failed";
  } else {
    const ius = parseDate(h.get("if-unmodified-since"));
    if (ius !== null && seconds(obj.uploaded) > ius) return "failed";
  }
  const inm = h.get("if-none-match");
  if (inm !== null) {
    if (etagListMatches(inm, obj.httpEtag)) return "not-modified";
  } else {
    const ims = parseDate(h.get("if-modified-since"));
    if (ims !== null && seconds(obj.uploaded) <= ims) return "not-modified";
  }
  return "ok";
}

/** True when `If-Range` (if any) still matches the object, so a Range may be honoured. */
export function ifRangeMatches(h: Headers, obj: R2ObjectLike): boolean {
  const v = h.get("if-range");
  if (v === null) return true;
  if (v.trim().startsWith('"')) return v.trim() === obj.httpEtag;
  const t = parseDate(v);
  return t !== null && seconds(obj.uploaded) === t;
}

function baseHeaders(obj: R2ObjectLike, url: URL): Headers {
  const h = new Headers();
  obj.writeHttpMetadata(h);
  h.set("ETag", obj.httpEtag);
  h.set("Last-Modified", obj.uploaded.toUTCString());
  h.set("Accept-Ranges", "bytes");
  h.set("Cache-Control", CACHE_CONTROL);
  h.set("X-Content-Type-Options", "nosniff");
  h.set("Referrer-Policy", "strict-origin-when-cross-origin");
  if (isWorkersDevHost(url.hostname)) h.set("X-Robots-Tag", "noindex");
  return h;
}

export async function serveFile(request: Request, env: Env, key: string): Promise<Response> {
  const url = new URL(request.url);
  const meta = await env.FILES.head(key);
  if (meta === null) return env.ASSETS.fetch(request);
  const headers = baseHeaders(meta, url);

  const pre = evaluatePreconditions(request.headers, meta);
  if (pre === "failed") return new Response(null, { status: 412, headers });
  if (pre === "not-modified") return new Response(null, { status: 304, headers });

  const range = ifRangeMatches(request.headers, meta) ? parseRange(request.headers.get("range"), meta.size) : null;
  if (range === "unsatisfiable") {
    headers.set("Content-Range", `bytes */${meta.size}`);
    headers.delete("Content-Type");
    return new Response(null, { status: 416, headers });
  }
  if (range !== null) {
    headers.set("Content-Range", `bytes ${range.offset}-${range.offset + range.length - 1}/${meta.size}`);
    headers.set("Content-Length", String(range.length));
  } else {
    headers.set("Content-Length", String(meta.size));
  }
  const status = range === null ? 200 : 206;
  if (request.method === "HEAD") return new Response(null, { status, headers });

  const obj = await env.FILES.get(key, range === null ? {} : { range });
  if (obj === null) return env.ASSETS.fetch(request);
  // The headers above describe the object `head` saw. If it was replaced before `get`, those
  // headers (ETag, length, range) would go out with the new bytes and be cached; answer 503 instead
  // and let the client retry.
  if (obj.httpEtag !== meta.httpEtag || obj.size !== meta.size) {
    obj.body.cancel().catch(() => {});
    return new Response("The file changed while it was being read. Try again.", {
      status: 503,
      headers: { "Retry-After": "1", "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  return new Response(obj.body, { status, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const key = keyForPath(url.pathname);
    if (key === null) return env.ASSETS.fetch(request);
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
    }
    return serveFile(request, env, key);
  },
};
