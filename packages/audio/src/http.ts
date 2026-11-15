/**
 * Small HTTP helpers for the audio handler: byte-range parsing (RFC 9110 §14)
 * and conditional-request evaluation (RFC 9110 §13). Pure.
 */

/** Same shape as R2's `R2Range`. */
export type ByteRange = { offset: number; length?: number } | { suffix: number };

export type ParsedRange =
  | { kind: "none" } // no Range header, or one we ignore (multi-range, other unit, bad syntax)
  | { kind: "range"; range: ByteRange };

const SINGLE_RANGE = /^bytes\s*=\s*(\d*)\s*-\s*(\d*)\s*$/i;

/**
 * Parses a single `bytes=` range. Multi-range requests and invalid syntax are
 * ignored (the full representation is served, which RFC 9110 allows).
 */
export function parseRangeHeader(value: string | null): ParsedRange {
  if (value === null) return { kind: "none" };
  const m = SINGLE_RANGE.exec(value.trim());
  if (!m) return { kind: "none" };
  const [, a = "", b = ""] = m;
  if (a === "" && b === "") return { kind: "none" };
  if (a === "") {
    const suffix = Number(b);
    return Number.isSafeInteger(suffix) ? { kind: "range", range: { suffix } } : { kind: "none" };
  }
  const offset = Number(a);
  if (!Number.isSafeInteger(offset)) return { kind: "none" };
  if (b === "") return { kind: "range", range: { offset } };
  const last = Number(b);
  if (!Number.isSafeInteger(last) || last < offset) return { kind: "none" };
  return { kind: "range", range: { offset, length: last - offset + 1 } };
}

/** Inclusive byte span actually served, or null when unsatisfiable for `size`. */
export function resolveRange(range: ByteRange, size: number): { start: number; end: number } | null {
  if (size <= 0) return null;
  if ("suffix" in range) {
    if (range.suffix <= 0) return null;
    const n = Math.min(range.suffix, size);
    return { start: size - n, end: size - 1 };
  }
  if (range.offset >= size) return null;
  const end = range.length === undefined ? size - 1 : Math.min(size - 1, range.offset + range.length - 1);
  return { start: range.offset, end };
}

function parseEtagList(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function opaque(tag: string): string {
  return tag.startsWith("W/") ? tag.slice(2) : tag;
}

function strongMatch(header: string, etag: string): boolean {
  if (etag.startsWith("W/")) return false;
  return parseEtagList(header).some((t) => t === "*" || (!t.startsWith("W/") && t === etag));
}

function weakMatch(header: string, etag: string): boolean {
  return parseEtagList(header).some((t) => t === "*" || opaque(t) === opaque(etag));
}

function parseHttpDate(value: string | null): number | null {
  if (value === null) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/** HTTP dates have one-second precision. */
function toSeconds(ms: number): number {
  return Math.floor(ms / 1000);
}

export type ConditionalOutcome = "ok" | "not-modified" | "precondition-failed";

/** RFC 9110 §13.2.2 evaluation order, for GET/HEAD. */
export function evaluateConditionals(headers: Headers, etag: string, lastModified: Date): ConditionalOutcome {
  const lm = toSeconds(lastModified.getTime());
  const ifMatch = headers.get("if-match");
  if (ifMatch !== null) {
    if (!strongMatch(ifMatch, etag)) return "precondition-failed";
  } else {
    const ius = parseHttpDate(headers.get("if-unmodified-since"));
    if (ius !== null && lm > toSeconds(ius)) return "precondition-failed";
  }
  const ifNoneMatch = headers.get("if-none-match");
  if (ifNoneMatch !== null) {
    if (weakMatch(ifNoneMatch, etag)) return "not-modified";
  } else {
    const ims = parseHttpDate(headers.get("if-modified-since"));
    if (ims !== null && lm <= toSeconds(ims)) return "not-modified";
  }
  return "ok";
}

/** RFC 9110 §13.1.5: If-Range holds when it strongly matches the ETag or exactly equals Last-Modified. */
export function ifRangeHolds(value: string, etag: string, lastModified: Date): boolean {
  const v = value.trim();
  if (v.startsWith('"') || v.startsWith("W/")) return !v.startsWith("W/") && !etag.startsWith("W/") && v === etag;
  const d = parseHttpDate(v);
  return d !== null && toSeconds(d) === toSeconds(lastModified.getTime());
}
