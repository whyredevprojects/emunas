/**
 * Pure helpers shared by the command bar and the search page: grouping API results by shiur,
 * choosing the display title, and building links for suggestions and results.
 */
import type { Ed } from "@emunas/corpus/public";
import { livePaths, parseMomentId } from "@emunas/links";
import type { ApiResponse, ApiResult } from "./api.ts";
import type { Suggestion } from "./engine.ts";

const paths = livePaths();

export interface ShiurGroup {
  shiurId: string;
  /** Hits in rank order. */
  hits: ApiResult[];
  /** Total hits for the shiur reported by the API (≥ hits.length). */
  count: number;
}

/** Groups results by shiur in the order each shiur first appears (the API ranks results already). */
export function groupByShiur(responses: readonly ApiResponse[]): ShiurGroup[] {
  const groups = new Map<string, ShiurGroup>();
  const counts = new Map<string, number>();
  for (const r of responses) for (const g of r.groups) counts.set(g.shiurId, Math.max(counts.get(g.shiurId) ?? 0, g.count));
  for (const r of responses) {
    for (const hit of r.results) {
      let g = groups.get(hit.shiurId);
      if (!g) {
        g = { shiurId: hit.shiurId, hits: [], count: 0 };
        groups.set(hit.shiurId, g);
      }
      if (!g.hits.some((h) => h.momentId === hit.momentId)) g.hits.push(hit);
    }
  }
  for (const g of groups.values()) g.count = Math.max(g.hits.length, counts.get(g.shiurId) ?? 0);
  return [...groups.values()];
}

/** The hit's generated title in the reading language, else the other language. */
export function hitTitle(hit: Pick<ApiResult, "title">, lang: Ed): { text: string; lang: Ed } | null {
  const own = hit.title[lang];
  if (own) return { text: own, lang };
  const other: Ed = lang === "en" ? "yi" : "en";
  const alt = hit.title[other];
  return alt ? { text: alt, lang: other } : null;
}

/** Link to the moment in the listening room: `?t=` always, `&m=` when the id is a page moment id. */
export function hitHref(ui: Ed, hit: Pick<ApiResult, "shiurId" | "momentId" | "t">): string {
  const parsed = parseMomentId(hit.momentId);
  const m = parsed && parsed.shiurId === hit.shiurId ? hit.momentId : undefined;
  return paths.shiur(ui, hit.shiurId, { t: hit.t, ...(m ? { m } : {}) });
}

export function shiurHref(ui: Ed, shiurId: string): string {
  return paths.shiur(ui, shiurId);
}

export function searchHref(ui: Ed, q: string): string {
  return paths.search(ui, q.trim());
}

/** Explore filtered to one Hebrew year (Explore's URL state, W4.1). */
export function yearHref(ui: Ed, year: number): string {
  return `/${ui}/explore?year=${year}`;
}

export function suggestionHref(ui: Ed, s: Suggestion): string {
  switch (s.type) {
    case "occasion":
      return paths.occasion(ui, s.key);
    case "work":
      return paths.work(ui, s.key);
    case "person":
      return paths.person(ui, s.key);
    case "concept":
      return paths.concept(ui, s.key);
    case "series":
      return paths.series(ui, s.key);
    case "series-part":
      return paths.shiur(ui, s.shiurId);
    case "year":
      return yearHref(ui, s.year);
  }
}

/** Stable id for a suggestion (React key, option id). */
export function suggestionId(s: Suggestion): string {
  switch (s.type) {
    case "series-part":
      return `sp:${s.seriesKey}:${s.how}:${s.n}`;
    case "year":
      return `y:${s.year}`;
    default:
      return `${s.type}:${s.key}`;
  }
}

/** The API needs at least this many characters before searching on idle (Enter always searches). */
export const MIN_IDLE_CHARS = 3;
/** Idle time before a full search runs while typing. */
export const IDLE_MS = 250;
