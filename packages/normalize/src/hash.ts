/** FNV-1a 32-bit over UTF-16 code units. Tiny, deterministic, browser-safe; not cryptographic. */
export function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Six lowercase hex characters derived from `s`. Used to disambiguate lossy slugs. */
export function shortHash(s: string): string {
  return fnv1a32(s).toString(16).padStart(8, "0").slice(0, 6);
}
