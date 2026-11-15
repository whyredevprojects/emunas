/**
 * Edge handler for `GET|HEAD /audio/<recordingId>.mp3` (integration-plan §3.2,
 * C12–C15), used by both site Workers (`run_worker_first: ["/audio/*"]`).
 *
 * - The id must match `^[a-z0-9-]+$` and be in the bundled audio table; the R2
 *   key is derived from the table (`<canonicalId>.mp3`), never from the client.
 * - GET → `AUDIO.get(key, { range, onlyIf })` → 200/206/304/412/416.
 * - HEAD → `AUDIO.head(key)`, conditionals and range evaluated here.
 * - `?download=1` (alias `dl=1`) → `Content-Disposition: attachment` with an
 *   ASCII-safe filename.
 * - `AUDIO_ENABLED` not true → 503 HTML page.
 *
 * The bucket bound as `AUDIO` is `emunas-audio` (mp3 only). Site Workers never
 * get a binding to the private `emunas` bucket.
 */
import { AUDIO_CACHE_CONTROL, AUDIO_CONTENT_TYPE } from "./constants.ts";
import { attachmentDisposition } from "./filename.ts";
import {
  evaluateConditionals,
  ifRangeHolds,
  parseRangeHeader,
  resolveRange,
  type ByteRange,
  type ConditionalOutcome,
} from "./http.ts";
import { publicObjectKey } from "./keys.ts";
import { parseAudioPath, wantsDownload } from "./paths.ts";
import { lookupAudio, type AudioTable, type AudioTableEntry } from "./table.ts";

export { AUDIO_CACHE_CONTROL, AUDIO_CONTENT_TYPE };

/** The parts of an R2 object the handler reads (R2Object satisfies it). */
export interface AudioObject {
  readonly size: number;
  readonly httpEtag: string;
  readonly uploaded: Date;
}

/** An R2 object with a body (R2ObjectBody satisfies it). */
export interface AudioObjectBody extends AudioObject {
  readonly body: ReadableStream;
}

/** The parts of an R2 bucket binding the handler uses (R2Bucket satisfies it). */
export interface AudioBucket {
  head(key: string): Promise<AudioObject | null>;
  get(key: string, options: { range?: ByteRange; onlyIf: Headers }): Promise<AudioObject | AudioObjectBody | null>;
}

export interface AudioEnv {
  AUDIO: AudioBucket;
  /** Wrangler var: "true" enables audio; anything else (or missing) → 503. */
  AUDIO_ENABLED?: string | boolean | undefined;
}

export function audioEnabled(value: AudioEnv["AUDIO_ENABLED"]): boolean {
  if (value === true) return true;
  if (typeof value !== "string") return false;
  const v = value.trim().toLowerCase();
  return v === "true" || v === "1" || v === "on" || v === "yes";
}

function hasBody(obj: AudioObject | AudioObjectBody): obj is AudioObjectBody {
  return "body" in obj && obj.body !== null && obj.body !== undefined;
}

function plain(status: number, message: string, extra: Record<string, string> = {}): Response {
  return new Response(`${message}\n`, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extra,
    },
  });
}

const DISABLED_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Audio not yet available</title>
</head>
<body>
<main>
<h1>Audio not yet available</h1>
<p>The recordings are not yet available online. Please check back later.</p>
</main>
</body>
</html>
`;

function disabled(method: string): Response {
  return new Response(method === "HEAD" ? null : DISABLED_HTML, {
    status: 503,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Retry-After": "86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function baseHeaders(obj: AudioObject, entry: AudioTableEntry, id: string, download: boolean): Headers {
  const h = new Headers();
  h.set("Content-Type", AUDIO_CONTENT_TYPE);
  h.set("Accept-Ranges", "bytes");
  h.set("ETag", obj.httpEtag);
  h.set("Last-Modified", obj.uploaded.toUTCString());
  h.set("Cache-Control", AUDIO_CACHE_CONTROL);
  h.set("X-Content-Type-Options", "nosniff");
  if (download) h.set("Content-Disposition", attachmentDisposition(entry.title, id));
  return h;
}

function conditionalResponse(outcome: Exclude<ConditionalOutcome, "ok">, headers: Headers): Response {
  if (outcome === "not-modified") {
    const h = new Headers();
    for (const name of ["ETag", "Last-Modified", "Cache-Control", "Accept-Ranges"]) {
      const v = headers.get(name);
      if (v !== null) h.set(name, v);
    }
    return new Response(null, { status: 304, headers: h });
  }
  return new Response(null, { status: 412, headers: { "Cache-Control": "no-store" } });
}

function unsatisfiable(size: number, method: string): Response {
  return new Response(method === "HEAD" ? null : "Range Not Satisfiable\n", {
    status: 416,
    headers: {
      "Content-Range": `bytes */${size}`,
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "Accept-Ranges": "bytes",
    },
  });
}

/**
 * Serves `/audio/<id>.mp3`. `table` is the bundled audio table; anything not in
 * it is 404 without touching R2.
 */
export async function handleAudio(request: Request, env: AudioEnv, table: AudioTable): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    return plain(405, "Method Not Allowed", { Allow: "GET, HEAD" });
  }
  if (!audioEnabled(env.AUDIO_ENABLED)) return disabled(method);

  const url = new URL(request.url);
  const id = parseAudioPath(url.pathname);
  const entry = id === null ? null : lookupAudio(table, id);
  if (id === null || entry === null) return plain(404, "Not Found");

  const key = publicObjectKey(entry.canonicalId);
  const download = wantsDownload(url.searchParams);
  const reqHeaders = request.headers;

  let parsed = parseRangeHeader(reqHeaders.get("range"));
  const ifRange = reqHeaders.get("if-range");

  if (method === "HEAD") {
    const obj = await env.AUDIO.head(key);
    if (obj === null) return plain(404, "Not Found");
    const headers = baseHeaders(obj, entry, id, download);
    const outcome = evaluateConditionals(reqHeaders, obj.httpEtag, obj.uploaded);
    if (outcome !== "ok") return conditionalResponse(outcome, headers);
    if (parsed.kind === "range" && ifRange !== null && !ifRangeHolds(ifRange, obj.httpEtag, obj.uploaded)) {
      parsed = { kind: "none" };
    }
    if (parsed.kind === "range") {
      const span = resolveRange(parsed.range, obj.size);
      if (span === null) return unsatisfiable(obj.size, method);
      headers.set("Content-Range", `bytes ${span.start}-${span.end}/${obj.size}`);
      headers.set("Content-Length", String(span.end - span.start + 1));
      return new Response(null, { status: 206, headers });
    }
    headers.set("Content-Length", String(obj.size));
    return new Response(null, { status: 200, headers });
  }

  // GET. If-Range needs the current validators before deciding whether to honour Range.
  if (parsed.kind === "range" && ifRange !== null) {
    const current = await env.AUDIO.head(key);
    if (current === null) return plain(404, "Not Found");
    if (!ifRangeHolds(ifRange, current.httpEtag, current.uploaded)) parsed = { kind: "none" };
  }

  // Resolve the range against the table size (the published object's size) so R2
  // is only asked for satisfiable spans; the response is computed from obj.size.
  let range: ByteRange | undefined;
  if (parsed.kind === "range") {
    const span = resolveRange(parsed.range, entry.size);
    if (span === null) return unsatisfiable(entry.size, method);
    range = { offset: span.start, length: span.end - span.start + 1 };
  }

  let obj: AudioObject | AudioObjectBody | null;
  try {
    obj = await env.AUDIO.get(key, range === undefined ? { onlyIf: reqHeaders } : { range, onlyIf: reqHeaders });
  } catch {
    // R2 rejects ranges past the end of the object (stale table size).
    const head = await env.AUDIO.head(key);
    if (head === null) return plain(404, "Not Found");
    if (range !== undefined) return unsatisfiable(head.size, method);
    return plain(502, "Bad Gateway");
  }
  if (obj === null) return plain(404, "Not Found");

  const headers = baseHeaders(obj, entry, id, download);
  if (!hasBody(obj)) {
    // onlyIf failed. R2 does not say which precondition; evaluate it here.
    let outcome = evaluateConditionals(reqHeaders, obj.httpEtag, obj.uploaded);
    if (outcome === "ok") {
      const cacheValidator = reqHeaders.has("if-none-match") || reqHeaders.has("if-modified-since");
      outcome = cacheValidator ? "not-modified" : "precondition-failed";
    }
    return conditionalResponse(outcome, headers);
  }

  if (range !== undefined) {
    const span = resolveRange(range, obj.size);
    if (span === null) {
      await obj.body.cancel();
      return unsatisfiable(obj.size, method);
    }
    headers.set("Content-Range", `bytes ${span.start}-${span.end}/${obj.size}`);
    headers.set("Content-Length", String(span.end - span.start + 1));
    return new Response(obj.body, { status: 206, headers });
  }
  headers.set("Content-Length", String(obj.size));
  return new Response(obj.body, { status: 200, headers });
}
