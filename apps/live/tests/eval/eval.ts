/**
 * Semantic search eval (integration-plan W3.10, tech-live §9, decision O10): 60 queries
 * (20 English, 20 Yiddish/Hebrew-script, 20 cross-language/transliteration), each with expected
 * shiur ids. For a model, every vector unit the sync would index (same text, same embedding
 * cache) and every query is embedded; moments are ranked by cosine, then shiurim by their best
 * moment; recall@10 and MRR are averaged per set and overall.
 *
 * Expected ids come from selectors over the generated metadata (occasion/parsha key, cited
 * work, person, optionally the recording language), never from transcripts, and are frozen in
 * queries.json so a data change does not silently move the target. `--refresh` re-resolves them.
 */
import type { MomentRow } from "@emunas/search-core";
import { embedCached, type BlobStore, type Embedder } from "../../../../workers/api/sync/src/embed.ts";
import { wantedUnits } from "../../../../workers/api/sync/src/vector-sync.ts";
import { dot, mean, normalize, reciprocalRank, recallAt, shiurRanking, topK } from "./metrics.ts";

export type QuerySet = "en" | "yi" | "cross";

export interface Selector {
  occasion?: string;
  work?: string;
  person?: string;
  /** Only shiurim recorded in this language. */
  audio?: "en" | "yi";
}

export interface EvalQuery {
  id: string;
  set: QuerySet;
  q: string;
  select: Selector;
  expected: string[];
}

export interface QueriesFile {
  version: 1;
  note: string;
  queries: EvalQuery[];
}

/** Full shiurim matching a selector (a moment carries the facet/entity). */
export function resolveExpected(sel: Selector, rows: readonly MomentRow[]): string[] {
  const out = new Set<string>();
  for (const r of rows) {
    if (sel.audio !== undefined && r.lang !== sel.audio) continue;
    if (sel.occasion !== undefined && r.facets.occasion !== sel.occasion) continue;
    if (sel.work !== undefined && !r.entities.works.includes(sel.work)) continue;
    if (sel.person !== undefined && !r.entities.people.includes(sel.person)) continue;
    out.add(r.shiurId);
  }
  return [...out].sort();
}

export interface QueryResult {
  id: string;
  set: QuerySet;
  q: string;
  expected: number;
  recall10: number;
  rr: number;
  /** Rank (1-based) of the first relevant shiur, null if not in the top 100. */
  firstHit: number | null;
}

export interface SetSummary {
  queries: number;
  recall10: number;
  mrr: number;
}

export interface ModelResult {
  model: string;
  dims: number;
  units: number;
  summary: Record<QuerySet | "all", SetSummary>;
  queries: QueryResult[];
  embed: { unitsEmbedded: number; unitsFromCache: number };
}

const SETS: QuerySet[] = ["en", "yi", "cross"];
const RANK_DEPTH = 100;
/** Moments considered per query before grouping by shiur. */
const MOMENT_DEPTH = 2000;

export async function evaluateModel(
  rows: readonly MomentRow[],
  queries: readonly EvalQuery[],
  embedder: Embedder,
  store: BlobStore,
  log: (m: string) => void = () => {},
): Promise<ModelResult> {
  const { units } = wantedUnits(rows);
  log(`${embedder.model}: ${units.length} units, ${queries.length} queries`);
  const unitVecs = await embedCached(units.map((u) => u.text), embedder, store, { log });
  const queryVecs = await embedCached(queries.map((q) => q.q), embedder, store);
  const matrix = units.map((u) => normalize(unitVecs.vectors.get(u.text) as number[]));
  const shiurOf = units.map((u) => u.metadata.shiurId);

  const results: QueryResult[] = queries.map((q) => {
    const qv = normalize(queryVecs.vectors.get(q.q) as number[]);
    const scores = new Float32Array(matrix.length);
    for (let i = 0; i < matrix.length; i++) scores[i] = dot(qv, matrix[i] as Float32Array);
    const ranked = shiurRanking(topK(scores, Math.min(MOMENT_DEPTH, matrix.length)).map((i) => shiurOf[i] as string)).slice(0, RANK_DEPTH);
    const relevant = new Set(q.expected);
    const rr = reciprocalRank(ranked, relevant);
    return {
      id: q.id,
      set: q.set,
      q: q.q,
      expected: q.expected.length,
      recall10: recallAt(ranked, relevant, 10),
      rr,
      firstHit: rr === 0 ? null : Math.round(1 / rr),
    };
  });

  const summarize = (rs: QueryResult[]): SetSummary => ({
    queries: rs.length,
    recall10: round(mean(rs.map((r) => r.recall10))),
    mrr: round(mean(rs.map((r) => r.rr))),
  });
  const summary = Object.fromEntries([
    ...SETS.map((s) => [s, summarize(results.filter((r) => r.set === s))]),
    ["all", summarize(results)],
  ]) as Record<QuerySet | "all", SetSummary>;
  return {
    model: embedder.model,
    dims: embedder.dims,
    units: units.length,
    summary,
    queries: results.map((r) => ({ ...r, recall10: round(r.recall10), rr: round(r.rr) })),
    embed: { unitsEmbedded: unitVecs.stats.embedded, unitsFromCache: unitVecs.stats.cacheHits },
  };
}

export const round = (x: number): number => Math.round(x * 10_000) / 10_000;

/** Pick the model with the higher overall MRR + recall@10, Yiddish set as tie-break (O10 gate). */
export function chooseModel(results: readonly ModelResult[]): ModelResult | null {
  const score = (r: ModelResult) => r.summary.all.mrr + r.summary.all.recall10;
  return (
    [...results].sort((a, b) => score(b) - score(a) || b.summary.yi.mrr - a.summary.yi.mrr || (a.model < b.model ? -1 : 1))[0] ?? null
  );
}

export interface Regression {
  model: string;
  set: QuerySet | "all";
  metric: "recall10" | "mrr";
  before: number;
  after: number;
}

/** Drops of more than `points` (0.05 = 5 points) against a baseline report, per model and set. */
export function regressions(baseline: readonly ModelResult[], current: readonly ModelResult[], points = 0.05): Regression[] {
  const out: Regression[] = [];
  for (const cur of current) {
    const base = baseline.find((b) => b.model === cur.model);
    if (!base) continue;
    for (const set of [...SETS, "all"] as const) {
      for (const metric of ["recall10", "mrr"] as const) {
        const before = base.summary[set][metric];
        const after = cur.summary[set][metric];
        if (before - after > points + 1e-9) out.push({ model: cur.model, set, metric, before, after });
      }
    }
  }
  return out;
}
