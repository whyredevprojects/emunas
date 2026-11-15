/**
 * Deterministic choice for "a moment for today" (concept-live §5.1): the same civil date always picks
 * the same item from the same pool, on every device and after every reload, with no server and no
 * stored state. FNV-1a (32-bit) over a seed string is enough: it only has to spread neighbouring
 * dates over the pool, not resist anyone.
 */

/** FNV-1a 32-bit hash of the UTF-16 code units of `s`, as an unsigned integer. */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Picks one element of `pool` for `seed` (e.g. `"2026-11-15|vayeitzei"`). The pool is sorted by
 * `idOf` first, so the result does not depend on the order the data file happened to list it in.
 * Null for an empty pool.
 */
export function pickForDay<T>(pool: readonly T[], seed: string, idOf: (item: T) => string): T | null {
  if (pool.length === 0) return null;
  const sorted = [...pool].sort((a, b) => {
    const x = idOf(a);
    const y = idOf(b);
    return x < y ? -1 : x > y ? 1 : 0;
  });
  return sorted[fnv1a(seed) % sorted.length] ?? null;
}
