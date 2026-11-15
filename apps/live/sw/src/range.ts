/**
 * HTTP Range serving from a cached Blob (tech-live §4.5). iOS Safari only plays and seeks `<audio>`
 * when the source answers `Range` with `206 Partial Content`; the media host does that online, and
 * the service worker does it for downloaded files by slicing the Blob in Cache Storage.
 *
 * Supports one range per request (`bytes=a-b`, `bytes=a-`, `bytes=-n`), which is what media
 * elements send. Multi-range and malformed headers are answered with the whole file (RFC 9110
 * §14.2 allows ignoring Range); an unsatisfiable range gets 416.
 */

export interface ByteRange {
  /** First byte, inclusive. */
  start: number;
  /** Last byte, inclusive. */
  end: number;
}

/**
 * Parses a `Range` header against a resource of `size` bytes.
 * - `null`: no usable range (absent, malformed, multi-range, other unit) → serve 200 with the whole body.
 * - `"unsatisfiable"`: a valid single range that lies outside the resource → 416.
 */
export function parseRange(header: string | null, size: number): ByteRange | "unsatisfiable" | null {
  if (header === null) return null;
  const m = /^\s*bytes\s*=\s*(\d*)\s*-\s*(\d*)\s*$/iu.exec(header);
  if (!m) return null;
  const [, a = "", b = ""] = m;
  if (a === "" && b === "") return null;
  if (a === "") {
    // Suffix range: the last n bytes.
    const n = Number(b);
    if (!Number.isSafeInteger(n)) return null;
    if (n === 0 || size === 0) return "unsatisfiable";
    return { start: Math.max(0, size - n), end: size - 1 };
  }
  const start = Number(a);
  if (!Number.isSafeInteger(start)) return null;
  const last = b === "" ? Number.MAX_SAFE_INTEGER : Number(b);
  if (!Number.isSafeInteger(last) || last < start) return null;
  if (start >= size) return "unsatisfiable";
  return { start, end: Math.min(last, size - 1) };
}

/** Headers copied from the cached response onto range responses. */
const KEPT_HEADERS = ["content-type", "last-modified", "etag"];

/**
 * Answers `rangeHeader` from `cached` (a full 200 response from Cache Storage).
 * Returns 206 with `Content-Range`, 200 with the whole body when there is no usable range,
 * or 416 with `Content-Range: bytes * /size` when the range is outside the file.
 */
export async function rangeResponse(cached: Response, rangeHeader: string | null): Promise<Response> {
  const blob = await cached.blob();
  const size = blob.size;
  const headers = new Headers();
  for (const name of KEPT_HEADERS) {
    const v = cached.headers.get(name);
    if (v !== null) headers.set(name, v);
  }
  if (!headers.has("content-type") && blob.type) headers.set("content-type", blob.type);
  headers.set("accept-ranges", "bytes");

  const range = parseRange(rangeHeader, size);
  if (range === "unsatisfiable") {
    headers.delete("content-type");
    headers.set("content-range", `bytes */${size}`);
    return new Response(null, { status: 416, statusText: "Range Not Satisfiable", headers });
  }
  if (range === null) {
    headers.set("content-length", String(size));
    return new Response(blob, { status: 200, statusText: "OK", headers });
  }
  const part = blob.slice(range.start, range.end + 1, blob.type);
  headers.set("content-range", `bytes ${range.start}-${range.end}/${size}`);
  headers.set("content-length", String(part.size));
  return new Response(part, { status: 206, statusText: "Partial Content", headers });
}
