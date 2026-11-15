/**
 * Explore's facet model (concept-live §5.2, tech-live §4.3): which facets exist, which values a
 * `corpus.json` row has for each, and the filter state the facet engine evaluates.
 *
 * Semantics (the usual "disjunctive" faceting): values selected within one facet are OR-ed; facets
 * are AND-ed with each other. A facet's counts are computed with every *other* facet applied, so a
 * value's count is the number of results the list would show if that value were added to its facet.
 * Values whose count is zero are dimmed, never hidden.
 */
import type { CorpusRow } from "./live-data.ts";

/** Multi-select facets, in display order. */
export const SET_FACETS = [
  "lang",
  "category",
  "occasion",
  "series",
  "work",
  "person",
  "concept",
  "duration",
  "stories",
  "ai",
  "catalogued",
] as const;

export type SetFacet = (typeof SET_FACETS)[number];

/** Every facet the engine counts. `year` is filtered by a range, not a set. */
export type FacetKey = SetFacet | "year";

export const FACET_KEYS: readonly FacetKey[] = [...SET_FACETS, "year"];

/** The year value of a shiur without `hebrewYears` (same key as `facets.json`). */
export const UNDATED = "unknown";

/** A year filter: an inclusive range of Hebrew years, or only the undated shiurim. */
export type YearFilter = { kind: "range"; from: number; to: number } | { kind: "undated" };

export interface ExploreFilters {
  /** Selected values per facet; a missing or empty list means "no filter". */
  sets: Partial<Record<SetFacet, readonly string[]>>;
  year: YearFilter | null;
}

export const NO_FILTERS: ExploreFilters = { sets: {}, year: null };

/** Duration buckets, in minutes: [0, 30), [30, 60), [60, 90), [90, ∞). */
export const DURATION_BUCKETS = ["lt30", "30to60", "60to90", "gte90"] as const;
export type DurationBucket = (typeof DURATION_BUCKETS)[number];

export function durationBucket(seconds: number): DurationBucket {
  const m = seconds / 60;
  if (m < 30) return "lt30";
  if (m < 60) return "30to60";
  if (m < 90) return "60to90";
  return "gte90";
}

/** The fields of a `corpus.json` row the facets read (the worker receives only these). */
export type FacetRow = Pick<
  CorpusRow,
  "lang" | "category" | "parsha" | "zman" | "series" | "years" | "entities" | "duration" | "counts" | "status" | "derived"
>;

/** The facet values of one row. Every row has at least one value for each facet except entity facets. */
export function rowValues(row: FacetRow, facet: FacetKey): readonly string[] {
  switch (facet) {
    case "lang":
      return [row.lang];
    case "category":
      return [row.category];
    case "occasion": {
      const out: string[] = [];
      if (row.parsha !== null) out.push(row.parsha);
      if (row.zman !== null && row.zman !== row.parsha) out.push(row.zman);
      return out;
    }
    case "series":
      return row.series ? [row.series.id] : [];
    case "year":
      return row.years.length === 0 ? [UNDATED] : [...new Set(row.years.map(String))];
    case "work":
      return row.entities.works;
    case "person":
      return row.entities.people;
    case "concept":
      return row.entities.concepts;
    case "duration":
      return [durationBucket(row.duration)];
    case "stories":
      return [row.counts.stories > 0 ? "yes" : "no"];
    case "ai":
      return [row.status];
    case "catalogued":
      return [row.derived === "catalog" ? "catalogued" : "uncatalogued"];
  }
}

/** Whether a year value (a facet key) falls inside a year filter. */
export function yearMatches(value: string, filter: YearFilter): boolean {
  if (filter.kind === "undated") return value === UNDATED;
  if (value === UNDATED) return false;
  const y = Number(value);
  return y >= filter.from && y <= filter.to;
}

/** True when no facet and no year filter is active. */
export function isEmptyFilters(f: ExploreFilters): boolean {
  return f.year === null && SET_FACETS.every((k) => (f.sets[k]?.length ?? 0) === 0);
}
