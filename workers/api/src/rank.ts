/**
 * Reciprocal-rank fusion of the lexical and semantic lists, the catalogued/confidence
 * adjustment, and grouping by shiur.
 */

export const RRF_K = 60;

/** A ranked list of moment ids, best first. Duplicates keep their first (best) position. */
export type RankedList = readonly string[];

export function dedupe(ids: Iterable<string>): string[] {
  return [...new Set(ids)];
}

export function rrf(lists: readonly RankedList[], k = RRF_K): Map<string, number> {
  const scores = new Map<string, number>();
  for (const list of lists) {
    dedupe(list).forEach((id, rank) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank + 1));
    });
  }
  return scores;
}

export interface RankFacts {
  shiurId: string;
  catalogued: boolean;
  confidence: number | null;
}

/** Catalogued shiurim get a small boost; low-confidence items a small penalty. */
export function adjust(score: number, facts: RankFacts): number {
  const catalogue = facts.catalogued ? 1.1 : 1;
  const conf = facts.confidence === null ? 1 : 0.75 + 0.25 * Math.min(1, Math.max(0, facts.confidence));
  return score * catalogue * conf;
}

export interface Scored {
  id: string;
  shiurId: string;
  score: number;
}

/**
 * Order results grouped by shiur: shiurim by their best moment, moments within a shiur by
 * score. Ties break on id so the order (and therefore cursors) is deterministic.
 */
export function groupByShiur(items: readonly Scored[]): { ordered: Scored[]; groups: { shiurId: string; count: number }[] } {
  const byScore = (a: Scored, b: Scored) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const buckets = new Map<string, Scored[]>();
  for (const item of [...items].sort(byScore)) {
    const bucket = buckets.get(item.shiurId);
    if (bucket) bucket.push(item);
    else buckets.set(item.shiurId, [item]);
  }
  const ordered: Scored[] = [];
  const groups: { shiurId: string; count: number }[] = [];
  for (const [shiurId, bucket] of buckets) {
    ordered.push(...bucket);
    groups.push({ shiurId, count: bucket.length });
  }
  return { ordered, groups };
}

/** Scores are rounded so responses are stable and compact. */
export function roundScore(score: number): number {
  return Math.round(score * 1e6) / 1e6;
}
