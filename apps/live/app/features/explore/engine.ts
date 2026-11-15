/**
 * The facet engine (tech-live §4.3): one bitset per facet value over the rows of `corpus.json`.
 * Runs in a Web Worker in the browser (`facet.worker.ts`) and in-thread where workers are missing
 * (tests, very old browsers); the code is the same.
 *
 * A query returns the matching row indices (in corpus order) and, for every facet, the count of each
 * value with all *other* facets applied (see `model.ts`). The work per query is
 * O(facets × words) for the masks plus O(values × words) for the counts, with words = ⌈rows / 32⌉.
 */
import { andInto, count, countAnd, emptySet, fullSet, indices, orInto, setBit, type Bitset } from "./bitset.ts";
import { FACET_KEYS, rowValues, yearMatches, type ExploreFilters, type FacetKey, type FacetRow } from "./model.ts";

export type FacetCounts = Record<FacetKey, Record<string, number>>;

export interface QueryResult {
  /** Number of matching rows. */
  total: number;
  /** Matching row indices, ascending (corpus order). */
  matches: Uint32Array;
  counts: FacetCounts;
}

export class FacetEngine {
  readonly size: number;
  /** facet → value → rows having it. */
  private readonly index: Map<FacetKey, Map<string, Bitset>>;
  private readonly all: Bitset;

  constructor(rows: readonly FacetRow[]) {
    this.size = rows.length;
    this.all = fullSet(rows.length);
    this.index = new Map(FACET_KEYS.map((k) => [k, new Map<string, Bitset>()]));
    rows.forEach((row, i) => {
      for (const facet of FACET_KEYS) {
        const byValue = this.index.get(facet)!;
        for (const v of rowValues(row, facet)) {
          let b = byValue.get(v);
          if (!b) byValue.set(v, (b = emptySet(rows.length)));
          setBit(b, i);
        }
      }
    });
  }

  /** Every value seen for a facet. */
  values(facet: FacetKey): string[] {
    return [...this.index.get(facet)!.keys()];
  }

  /** The rows a facet's current selection allows, or null when the facet is not filtering. */
  private mask(facet: FacetKey, filters: ExploreFilters): Bitset | null {
    const byValue = this.index.get(facet)!;
    if (facet === "year") {
      const yf = filters.year;
      if (yf === null) return null;
      const m = emptySet(this.size);
      for (const [v, b] of byValue) if (yearMatches(v, yf)) orInto(m, b);
      return m;
    }
    const selected = filters.sets[facet];
    if (!selected || selected.length === 0) return null;
    const m = emptySet(this.size);
    for (const v of selected) {
      const b = byValue.get(v);
      if (b) orInto(m, b);
    }
    return m;
  }

  query(filters: ExploreFilters): QueryResult {
    const masks = FACET_KEYS.map((f) => this.mask(f, filters));
    const n = masks.length;
    // prefix[i] = AND of masks[0..i-1]; suffix[i] = AND of masks[i..n-1]
    const prefix: Bitset[] = [this.all];
    for (let i = 0; i < n; i++) {
      const m = masks[i];
      prefix.push(m ? andInto(prefix[i]!.slice(), m) : prefix[i]!);
    }
    const suffix: Bitset[] = new Array<Bitset>(n + 1);
    suffix[n] = this.all;
    for (let i = n - 1; i >= 0; i--) {
      const m = masks[i];
      suffix[i] = m ? andInto(suffix[i + 1]!.slice(), m) : suffix[i + 1]!;
    }
    const result = prefix[n]!;
    const counts = {} as FacetCounts;
    FACET_KEYS.forEach((facet, i) => {
      const base = andInto(prefix[i]!.slice(), suffix[i + 1]!);
      const out: Record<string, number> = {};
      for (const [v, b] of this.index.get(facet)!) out[v] = countAnd(base, b);
      counts[facet] = out;
    });
    return { total: count(result), matches: indices(result), counts };
  }
}
