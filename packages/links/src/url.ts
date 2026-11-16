/**
 * A tiny URL splitter. The package avoids the WHATWG `URL` global so it needs no DOM or
 * Node lib types and behaves the same in browsers, Workers, Node and Astro builds.
 */

export interface SplitUrl {
  /** `scheme://host[:port]`, lowercased, or null for a root-relative path. */
  readonly origin: string | null;
  /** Always starts with `/`. Not decoded. */
  readonly path: string;
  /** Decoded query pairs, in order. */
  readonly query: readonly (readonly [string, string])[];
  /** Fragment without `#`, not decoded. Empty when absent. */
  readonly hash: string;
}

const URL_RE = /^(?:([a-z][a-z0-9+.-]*:\/\/[^/?#]*))?([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/i;

export function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

export function splitUrl(input: string): SplitUrl | null {
  const m = URL_RE.exec(input.trim());
  if (!m) return null;
  const origin = m[1] ? m[1].toLowerCase().replace(/\/+$/, "") : null;
  let path = m[2] ?? "";
  if (origin === null && !path.startsWith("/")) return null; // relative paths are ambiguous
  if (path === "") path = "/";
  const query: (readonly [string, string])[] = [];
  for (const part of (m[3] ?? "").split("&")) {
    if (part === "") continue;
    const eq = part.indexOf("=");
    const rawKey = eq === -1 ? part : part.slice(0, eq);
    const rawVal = eq === -1 ? "" : part.slice(eq + 1);
    const key = safeDecode(rawKey.replace(/\+/g, " "));
    const val = safeDecode(rawVal.replace(/\+/g, " "));
    if (key === null || val === null) continue;
    query.push([key, val]);
  }
  return { origin, path, query, hash: m[4] ?? "" };
}

export function queryGet(query: SplitUrl["query"], key: string): string | undefined {
  for (const [k, v] of query) if (k === key) return v;
  return undefined;
}

/** Path segments, decoded; empty segments (double or trailing slashes) dropped. Null if undecodable. */
export function pathSegments(path: string): string[] | null {
  const out: string[] = [];
  for (const raw of path.split("/")) {
    if (raw === "") continue;
    const seg = safeDecode(raw);
    if (seg === null || seg === "" || seg.includes("/")) return null;
    out.push(seg);
  }
  return out;
}

export function seg(value: string): string {
  return encodeURIComponent(value);
}

export function buildQuery(pairs: readonly (readonly [string, string | undefined])[]): string {
  const parts: string[] = [];
  for (const [k, v] of pairs) if (v !== undefined) parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

/** Seconds as written in URLs: whole, non-negative. Undefined for anything that is not a usable time. */
export function formatSeconds(t: number | undefined): string | undefined {
  if (t === undefined || !Number.isFinite(t) || t < 0) return undefined;
  return String(Math.round(t));
}

/**
 * Seconds kept to the millisecond (`582.12`, `754`): Quiet's `#t=` page hash, which the player seeks
 * to exactly, so a link lands on the item that starts at 582.12 rather than on the one before it.
 */
export function formatExactSeconds(t: number | undefined): string | undefined {
  if (t === undefined || !Number.isFinite(t) || t < 0) return undefined;
  return String(Math.round(t * 1000) / 1000);
}

/** Parses `754` or `582.12`, kept to the millisecond. Undefined for anything else. */
export function parseExactSeconds(value: string | undefined): number | undefined {
  if (value === undefined || !/^\d{1,7}(?:\.\d+)?$/.test(value)) return undefined;
  return Math.round(Number(value) * 1000) / 1000;
}

/** Parses `754` or `754.5` (rounded). Undefined for anything else. */
export function parseSeconds(value: string | undefined): number | undefined {
  if (value === undefined || !/^\d{1,7}(?:\.\d+)?$/.test(value)) return undefined;
  return Math.round(Number(value));
}
