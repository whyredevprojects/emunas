/**
 * Retrieval metrics for the search eval: per query, a ranked list of shiur ids is compared with
 * the expected (relevant) shiur ids.
 */

/**
 * recall@k = |relevant ∩ top k| / min(|relevant|, k). Normalised by min(…, k) so a query with
 * more than k relevant shiurim can still reach 1.
 */
export function recallAt(ranked: readonly string[], relevant: ReadonlySet<string>, k = 10): number {
  if (relevant.size === 0) return 0;
  const top = ranked.slice(0, k);
  const hits = top.filter((id) => relevant.has(id)).length;
  return hits / Math.min(relevant.size, k);
}

/** Reciprocal rank of the first relevant shiur (0 when none is ranked). */
export function reciprocalRank(ranked: readonly string[], relevant: ReadonlySet<string>): number {
  const i = ranked.findIndex((id) => relevant.has(id));
  return i === -1 ? 0 : 1 / (i + 1);
}

export function mean(xs: readonly number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Shiur ids in order of their best-ranked moment. */
export function shiurRanking(momentShiurIds: readonly string[]): string[] {
  return [...new Set(momentShiurIds)];
}

export function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] as number) * (b[i] as number);
  return s;
}

export function normalize(v: readonly number[]): Float32Array {
  const out = Float32Array.from(v);
  let n = 0;
  for (const x of out) n += x * x;
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < out.length; i++) out[i] = (out[i] as number) / n;
  return out;
}

/** Indices of the `k` largest scores, best first (ties by index). */
export function topK(scores: Float32Array, k: number): number[] {
  const idx: number[] = [];
  for (let i = 0; i < scores.length; i++) {
    if (idx.length < k) {
      idx.push(i);
      if (idx.length === k) idx.sort((a, b) => (scores[b] as number) - (scores[a] as number) || a - b);
      continue;
    }
    const last = idx[k - 1] as number;
    if ((scores[i] as number) > (scores[last] as number)) {
      let j = k - 1;
      while (j > 0 && (scores[idx[j - 1] as number] as number) < (scores[i] as number)) {
        idx[j] = idx[j - 1] as number;
        j--;
      }
      idx[j] = i;
    }
  }
  if (idx.length < k) idx.sort((a, b) => (scores[b] as number) - (scores[a] as number) || a - b);
  return idx;
}
