/**
 * Messages between the page and the facet worker. Kept free of DOM/worker globals so the same
 * handler runs inside the worker and in-thread (fallback and tests).
 */
import { FacetEngine, type QueryResult } from "./engine.ts";
import type { ExploreFilters, FacetRow } from "./model.ts";

export type FacetRequest =
  | { type: "init"; rows: FacetRow[] }
  | { type: "query"; id: number; filters: ExploreFilters };

export type FacetResponse =
  | { type: "ready"; size: number }
  | { type: "result"; id: number; result: QueryResult; ms: number }
  | { type: "error"; id: number | null; message: string };

/** The slice of a row sent to the worker (no titles or one-liners). */
export function slimRow(r: FacetRow): FacetRow {
  return {
    lang: r.lang,
    category: r.category,
    parsha: r.parsha,
    zman: r.zman,
    series: r.series,
    years: r.years,
    entities: r.entities,
    duration: r.duration,
    counts: r.counts,
    status: r.status,
    derived: r.derived,
  };
}

const now = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());

/** Holds one engine; `handle` answers one request. */
export class FacetHost {
  private engine: FacetEngine | null = null;

  handle(msg: FacetRequest): FacetResponse {
    try {
      if (msg.type === "init") {
        this.engine = new FacetEngine(msg.rows);
        // Warm the JIT so the first query the reader waits for runs at full speed.
        for (let i = 0; i < 3; i++) this.engine.query({ sets: {}, year: { kind: "undated" } });
        return { type: "ready", size: this.engine.size };
      }
      if (!this.engine) return { type: "error", id: msg.id, message: "facet engine not initialised" };
      const t0 = now();
      const result = this.engine.query(msg.filters);
      return { type: "result", id: msg.id, result, ms: now() - t0 };
    } catch (e) {
      return { type: "error", id: msg.type === "query" ? msg.id : null, message: String(e) };
    }
  }
}
