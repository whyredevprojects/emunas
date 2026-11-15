/**
 * Stable keys for parsha, zman, work, person and concept values. The projector only talks to this
 * interface; W2.1 supplies an implementation backed by @emunas/normalize. The default here is a
 * table-free "identity slug": deterministic, never throws, and reports every value as unmapped.
 */

export type KeyKind = "parsha" | "zman" | "work" | "person" | "concept";

export interface KeyResult {
  key: string;
  /** false when no alias table knew the value (the key is then a fallback slug); goes to build-report. */
  mapped: boolean;
}

export interface Keyer {
  /** Name and version both feed every shiur fingerprint; bump the version when tables change. */
  readonly id: string;
  readonly version: string;
  key(kind: KeyKind, raw: string): KeyResult;
}

const NIKUD = /[֑-ׇ]/g;

/** NFC, strip nikud/cantillation, unify quote marks and maqaf, lowercase, collapse whitespace. */
export function foldForKey(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(NIKUD, "")
    .replace(/[״”“"]/g, '"')
    .replace(/[׳’‘']/g, "'")
    .replace(/[־–—]/g, "-")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Lowercase letter/digit runs joined by '-'; Hebrew letters are kept as they are. Never empty. */
export function slugKey(raw: string): string {
  const folded = foldForKey(raw).replace(/["']/g, "");
  const parts = folded.match(/[\p{L}\p{N}]+/gu) ?? [];
  const slug = parts.join("-");
  return slug.length > 0 ? slug : `x-${fnv1a(raw)}`;
}

/** Small deterministic hash (hex) for keys of values without letters or digits. */
export function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export const identitySlugKeyer: Keyer = {
  id: "identity-slug",
  version: "1",
  key(_kind, raw) {
    return { key: slugKey(raw), mapped: false };
  },
};
