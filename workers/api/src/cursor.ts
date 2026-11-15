/**
 * Opaque pagination cursor: base64url of {o: offset, r: corpus_rev}. A cursor from an older
 * corpus revision is refused (409 stale_cursor) so the client restarts instead of skipping or
 * repeating results.
 */

export interface Cursor {
  offset: number;
  rev: string;
}

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): string {
  const b64 = s.replaceAll("-", "+").replaceAll("_", "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function encodeCursor(c: Cursor): string {
  return toBase64Url(JSON.stringify({ o: c.offset, r: c.rev }));
}

/** Returns null for anything that is not a well-formed cursor. */
export function decodeCursor(s: string): Cursor | null {
  try {
    const v: unknown = JSON.parse(fromBase64Url(s));
    if (typeof v !== "object" || v === null) return null;
    const { o, r } = v as { o?: unknown; r?: unknown };
    if (typeof o !== "number" || !Number.isInteger(o) || o < 0 || o > 10_000) return null;
    if (typeof r !== "string" || r.length > 100) return null;
    return { offset: o, rev: r };
  } catch {
    return null;
  }
}
