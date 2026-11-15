/**
 * Token interning and a shingle (n-gram) index used for the verbatim scan.
 *
 * Tokens are interned to non-negative integers. Two negative values are reserved:
 *   BREAK   (-1) separates documents (recordings) in a concatenated token stream;
 *   UNKNOWN (-2) is a shipped-text token that never occurs in any transcript.
 * Neither can be part of a match.
 *
 * The index stores every K-token window of the transcript stream under a 32-bit
 * hash, bucketed by counting sort (linear time, no sorting, no BigInt). A lookup
 * verifies candidates token by token, so hash collisions never produce a finding.
 */

export const BREAK = -1;
export const UNKNOWN = -2;

export class Vocabulary {
  private readonly ids = new Map<string, number>();

  /** Id of `token`, adding it when new (transcript side). */
  intern(token: string): number {
    let id = this.ids.get(token);
    if (id === undefined) {
      id = this.ids.size;
      this.ids.set(token, id);
    }
    return id;
  }

  /** Id of `token`, or UNKNOWN when no transcript contains it (shipped-text side). */
  lookup(token: string): number {
    return this.ids.get(token) ?? UNKNOWN;
  }

  get size(): number {
    return this.ids.size;
  }
}

/** Murmur3-style 32-bit hash of tokens[p .. p+k). */
export function hashWindow(tokens: Int32Array, p: number, k: number): number {
  let h = 0x9747b28c;
  for (let j = 0; j < k; j++) {
    let x = Math.imul(tokens[p + j]!, 0xcc9e2d51);
    x = (x << 15) | (x >>> 17);
    x = Math.imul(x, 0x1b873593);
    h ^= x;
    h = (h << 13) | (h >>> 19);
    h = (Math.imul(h, 5) + 0xe6546b64) | 0;
  }
  h ^= k;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * For each position i, the index of the first negative token at or after i
 * (tokens.length when none). A K-window at p is valid iff nextNegative[p] >= p + K.
 */
function nextNegativeTable(tokens: Int32Array): Int32Array {
  const out = new Int32Array(tokens.length + 1);
  out[tokens.length] = tokens.length;
  for (let i = tokens.length - 1; i >= 0; i--) {
    out[i] = tokens[i]! < 0 ? i : out[i + 1]!;
  }
  return out;
}

/** Concatenate token arrays with BREAK between them. */
export function concatWithBreaks(parts: readonly Int32Array[]): Int32Array {
  let n = 0;
  for (const p of parts) n += p.length + 1;
  const out = new Int32Array(Math.max(0, n - 1));
  let o = 0;
  parts.forEach((p, idx) => {
    out.set(p, o);
    o += p.length;
    if (idx < parts.length - 1) out[o++] = BREAK;
  });
  return out;
}

export interface Run {
  /** Token offset in the query where the run starts. */
  start: number;
  /** Number of consecutive tokens shared with the indexed stream. */
  length: number;
}

/** Candidate positions examined per window; repeated boilerplate can't blow up the scan. */
const MAX_CANDIDATES = 64;

export class ShingleIndex {
  readonly k: number;
  readonly tokens: Int32Array;
  private readonly shift: number;
  private readonly bucketStart: Uint32Array;
  private readonly positions: Int32Array;
  private readonly hashes: Uint32Array;

  constructor(tokens: Int32Array, k: number) {
    if (!Number.isInteger(k) || k < 1) throw new Error(`shingle size must be a positive integer, got ${k}`);
    this.k = k;
    this.tokens = tokens;
    const next = nextNegativeTable(tokens);
    const valid: number[] = [];
    for (let p = 0; p + k <= tokens.length; p++) if (next[p]! >= p + k) valid.push(p);

    const bits = Math.min(24, Math.max(4, Math.ceil(Math.log2(valid.length + 1))));
    this.shift = 32 - bits;
    const buckets = 1 << bits;
    const counts = new Uint32Array(buckets + 1);
    const hs = new Uint32Array(valid.length);
    valid.forEach((p, i) => {
      const h = hashWindow(tokens, p, k);
      hs[i] = h;
      counts[(h >>> this.shift) + 1]!++;
    });
    for (let b = 0; b < buckets; b++) counts[b + 1]! += counts[b]!;
    this.bucketStart = counts.slice();
    const fill = counts;
    this.positions = new Int32Array(valid.length);
    this.hashes = new Uint32Array(valid.length);
    valid.forEach((p, i) => {
      const h = hs[i]!;
      const slot = fill[h >>> this.shift]!++;
      this.positions[slot] = p;
      this.hashes[slot] = h;
    });
  }

  get size(): number {
    return this.positions.length;
  }

  /** Does the K-window query[i .. i+K) occur in the index? (Caller guarantees the window has no negatives.) */
  containsWindow(query: Int32Array, i: number): boolean {
    return this.longestAt(query, i, this.k) >= this.k;
  }

  /**
   * Longest common run starting at query[i], over all indexed positions whose
   * K-window equals query's K-window at i. Returns 0 when there is none.
   */
  longestAt(query: Int32Array, i: number, cap = Number.POSITIVE_INFINITY): number {
    const h = hashWindow(query, i, this.k);
    const b = h >>> this.shift;
    const end = this.bucketStart[b + 1]!;
    let best = 0;
    let seen = 0;
    for (let s = this.bucketStart[b]!; s < end && seen < MAX_CANDIDATES; s++) {
      if (this.hashes[s] !== h) continue;
      seen++;
      const p = this.positions[s]!;
      let len = 0;
      while (
        i + len < query.length &&
        p + len < this.tokens.length &&
        query[i + len]! >= 0 &&
        query[i + len] === this.tokens[p + len] &&
        len < cap
      ) {
        len++;
      }
      if (len >= this.k && len > best) best = len;
      if (best >= cap) break;
    }
    return best;
  }

  /**
   * Maximal shared runs of at least K tokens between `query` and the index.
   * A run that starts inside an earlier run and ends no later is not reported again.
   */
  findRuns(query: Int32Array): Run[] {
    const runs: Run[] = [];
    if (query.length < this.k || this.size === 0) return runs;
    const next = nextNegativeTable(query);
    let coveredTo = 0;
    for (let i = 0; i + this.k <= query.length; i++) {
      if (next[i]! < i + this.k) {
        i = next[i]!; // skip past the negative token
        continue;
      }
      const len = this.longestAt(query, i);
      if (len >= this.k && i + len > coveredTo) {
        runs.push({ start: i, length: len });
        coveredTo = i + len;
      }
    }
    return runs;
  }
}

/** Longest run length in `runs` (0 when empty). */
export function maxRun(runs: readonly Run[]): number {
  let m = 0;
  for (const r of runs) if (r.length > m) m = r.length;
  return m;
}
