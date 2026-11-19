/**
 * Shared playlists without a server (tech-live §1 routing, §4.2): `/:ui/pl#<base64url(JSON)>` where
 * the JSON is `[shiurId, t, end?][]` in global seconds. The fragment never reaches a server, so a
 * shared list stays between the people who share it.
 *
 * Times are rounded to 0.1 s to keep links short; `decodePlaylist(encodePlaylist(x))` returns `x`
 * for any list whose times are already on that grid. A decoded link is untrusted: malformed input
 * yields `null`, never a partial list.
 */
import type { UiLang } from "@emunas/i18n";
import { LIMITS, type MomentRef } from "./schema.ts";
import { momentRef } from "./validate.ts";

export type PlaylistTuple = [shiurId: string, t: number] | [shiurId: string, t: number, end: number];

/** Longest fragment accepted (characters). */
export const MAX_PLAYLIST_HASH = 64 * 1024;

function round(t: number): number {
  return Math.round(t * 10) / 10;
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  try {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

export function toTuples(items: readonly Pick<MomentRef, "shiurId" | "start" | "end">[]): PlaylistTuple[] {
  return items.map((it) =>
    it.end === null ? [it.shiurId, round(it.start)] : [it.shiurId, round(it.start), round(it.end)],
  );
}

/** The fragment (without `#`) for a list of moments. */
export function encodePlaylist(items: readonly Pick<MomentRef, "shiurId" | "start" | "end">[]): string {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(toTuples(items))));
}

/** `null` for anything that is not a valid, non-empty playlist fragment. Accepts a leading `#`. */
export function decodePlaylist(hash: string): MomentRef[] | null {
  const s = hash.startsWith("#") ? hash.slice(1) : hash;
  if (s.length === 0 || s.length > MAX_PLAYLIST_HASH) return null;
  const bytes = fromBase64Url(s);
  if (!bytes) return null;
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
  if (!Array.isArray(body) || body.length === 0 || body.length > LIMITS.playlistItems) return null;
  const out: MomentRef[] = [];
  for (const tuple of body) {
    if (!Array.isArray(tuple) || tuple.length < 2 || tuple.length > 3) return null;
    const ref = momentRef({ shiurId: tuple[0], start: tuple[1], end: tuple.length === 3 ? tuple[2] : null });
    if (!ref) return null;
    out.push(ref);
  }
  return out;
}

/** Path plus fragment for the shared playlist page in interface language `ui`. */
export function playlistPath(ui: UiLang, items: readonly Pick<MomentRef, "shiurId" | "start" | "end">[]): string {
  return `/${ui}/pl#${encodePlaylist(items)}`;
}
