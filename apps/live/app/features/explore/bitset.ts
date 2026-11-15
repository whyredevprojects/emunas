/**
 * Fixed-size bitsets over row indices (tech-live §4.3). 997 rows fit in 32 words, so an AND plus a
 * popcount over a facet value costs a few dozen operations; facet counts for the whole corpus are
 * recomputed in well under a millisecond.
 */

export type Bitset = Uint32Array;

export function wordsFor(size: number): number {
  return Math.ceil(size / 32);
}

export function emptySet(size: number): Bitset {
  return new Uint32Array(wordsFor(size));
}

/** A set with bits 0 … size-1 on. */
export function fullSet(size: number): Bitset {
  const b = new Uint32Array(wordsFor(size));
  b.fill(0xffffffff);
  const rest = size % 32;
  if (rest !== 0 && b.length > 0) b[b.length - 1] = (2 ** rest - 1) >>> 0;
  return b;
}

export function setBit(b: Bitset, i: number): void {
  b[i >>> 5]! |= 1 << (i & 31);
}

export function hasBit(b: Bitset, i: number): boolean {
  return ((b[i >>> 5]! >>> (i & 31)) & 1) === 1;
}

/** Population count of one 32-bit word (SWAR). */
export function popcount32(x: number): number {
  let v = x >>> 0;
  v = v - ((v >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  v = (v + (v >>> 4)) & 0x0f0f0f0f;
  return Math.imul(v, 0x01010101) >>> 24;
}

export function count(b: Bitset): number {
  let n = 0;
  for (let i = 0; i < b.length; i++) n += popcount32(b[i]!);
  return n;
}

/** |a ∩ b| without allocating. */
export function countAnd(a: Bitset, b: Bitset): number {
  let n = 0;
  for (let i = 0; i < a.length; i++) n += popcount32(a[i]! & b[i]!);
  return n;
}

/** `into ← into ∩ other`. */
export function andInto(into: Bitset, other: Bitset): Bitset {
  for (let i = 0; i < into.length; i++) into[i] = into[i]! & other[i]!;
  return into;
}

/** `into ← into ∪ other`. */
export function orInto(into: Bitset, other: Bitset): Bitset {
  for (let i = 0; i < into.length; i++) into[i] = into[i]! | other[i]!;
  return into;
}

/** The set bits in ascending order. */
export function indices(b: Bitset): Uint32Array {
  const out = new Uint32Array(count(b));
  let k = 0;
  for (let w = 0; w < b.length; w++) {
    let word = b[w]!;
    while (word !== 0) {
      const low = word & -word;
      out[k++] = (w << 5) + (31 - Math.clz32(low));
      word = (word ^ low) >>> 0;
    }
  }
  return out;
}
