/**
 * Series (concept-live §5.6) as pure functions:
 *
 * - the index of all series, a series and its other-language sibling on one row (parallel courses,
 *   not translations);
 * - parts in catalog `seriesOrder` (parts without an order last, otherwise stable);
 * - Tanya by perek: each part filed under every perek it covers (`ו-ז`, `י"א וי"ב`), so whoever is
 *   learning perek 12 finds every part on it, in either language;
 * - progress over the parts from the personal store.
 */
import { numeralValue } from "@emunas/i18n";
import type { Ed } from "@emunas/corpus/public";
import type { FacetsFile, SeriesFacetValue, SeriesFile, SeriesPart } from "../today/live-data.ts";
import type { ProgressRecord } from "../today/personal.ts";

// ---------------------------------------------------------------------------------------------
// Index

export interface SeriesEntry extends SeriesFacetValue {
  id: string;
}

export interface SeriesIndexRow {
  /** One or two entries; with two, the first is the one listed first in the facets. */
  entries: SeriesEntry[];
}

/**
 * Every series in `facets.json` (W3.6 lists them in corpus order), siblings paired on the row of
 * whichever comes first. A sibling id that is not in the facets is ignored.
 */
export function seriesIndex(facets: Pick<FacetsFile, "series">): SeriesIndexRow[] {
  const rows: SeriesIndexRow[] = [];
  const rowOf = new Map<string, SeriesIndexRow>();
  for (const [id, v] of Object.entries(facets.series)) {
    const entry: SeriesEntry = { id, ...v };
    const partnerRow = v.sibling !== null ? rowOf.get(v.sibling) : undefined;
    if (partnerRow && partnerRow.entries.length === 1) {
      partnerRow.entries.push(entry);
      rowOf.set(id, partnerRow);
      continue;
    }
    const row: SeriesIndexRow = { entries: [entry] };
    rows.push(row);
    rowOf.set(id, row);
  }
  return rows;
}

// ---------------------------------------------------------------------------------------------
// Order

/** Parts by `order` (catalog `seriesOrder`); parts without one go last, in the order given. */
export function orderParts<T extends Pick<SeriesPart, "order">>(parts: readonly T[]): T[] {
  return parts
    .map((p, i) => ({ p, i, o: p.order ?? Number.POSITIVE_INFINITY }))
    .sort((a, b) => a.o - b.o || a.i - b.i)
    .map((x) => x.p);
}

// ---------------------------------------------------------------------------------------------
// Perakim

/** Perek number used for the introduction (הקדמה). */
export const INTRO_PEREK = 0;

const QUOTES = /["'״׳”“‘’`]/g;
const INTRO = /^הקדמה$/;
const NUMERAL = /^[א-ת]{1,3}$/;

/**
 * The perakim a catalog `perek` string covers: `"א"` → [1], `"ו-ז"` → [6, 7], `"י\"א וי\"ב"` → [11, 12],
 * `"הקדמה"` → [0]. Null when the string is not a perek reference this understands (shown as written).
 */
export function parsePerek(raw: string | null): number[] | null {
  if (raw === null) return null;
  const text = raw.replace(QUOTES, "").trim();
  if (text === "") return null;
  if (INTRO.test(text)) return [INTRO_PEREK];
  const out = new Set<number>();
  for (const piece of text.split(/\s+/)) {
    // "וי"ב" → "יב": a joining vav before a numeral
    const token = piece.length > 1 && piece.startsWith("ו") && !piece.includes("-") ? piece.slice(1) : piece;
    const range = token.split(/[-–]/);
    if (range.length > 2) return null;
    const nums: number[] = [];
    for (const r of range) {
      if (!NUMERAL.test(r)) return null;
      const n = numeralValue(r);
      if (n <= 0 || n > 200) return null;
      nums.push(n);
    }
    const [a, b = a] = nums as [number, number?];
    if (b < a || b - a > 10) return null;
    for (let n = a; n <= b; n++) out.add(n);
  }
  return out.size > 0 ? [...out].sort((x, y) => x - y) : null;
}

export interface PerekPart {
  part: SeriesPart;
  lang: Ed;
  seriesId: string;
}

export interface PerekGroup {
  /** Perek number (0 = introduction), or null for parts whose perek is missing or not understood. */
  perek: number | null;
  /** The raw strings seen for unplaced parts (for display); empty for numbered groups. */
  raw: string[];
  parts: PerekPart[];
}

/**
 * Parts of one or more series grouped by perek, in perek order; within a perek by language order
 * given and then series order. Parts without a usable perek form the last group. A series without
 * any perek yields no groups.
 */
export function perekGroups(series: readonly Pick<SeriesFile, "id" | "lang" | "parts">[]): PerekGroup[] {
  const byPerek = new Map<number, PerekPart[]>();
  const unplaced: PerekPart[] = [];
  const raw = new Set<string>();
  let anyPerek = false;
  for (const s of series) {
    for (const part of orderParts(s.parts)) {
      const pp: PerekPart = { part, lang: s.lang, seriesId: s.id };
      const nums = parsePerek(part.perek);
      if (part.perek !== null) anyPerek = true;
      if (nums === null) {
        unplaced.push(pp);
        if (part.perek !== null) raw.add(part.perek);
        continue;
      }
      for (const n of nums) {
        const list = byPerek.get(n) ?? [];
        list.push(pp);
        byPerek.set(n, list);
      }
    }
  }
  if (!anyPerek) return [];
  const groups: PerekGroup[] = [...byPerek.entries()]
    .sort(([a], [b]) => a - b)
    .map(([perek, parts]) => ({ perek, raw: [], parts }));
  if (unplaced.length > 0) groups.push({ perek: null, raw: [...raw], parts: unplaced });
  return groups;
}

// ---------------------------------------------------------------------------------------------
// Progress

export interface SeriesProgress {
  total: number;
  /** Parts finished. */
  completed: number;
  /** Parts started but not finished. */
  started: number;
  /** The part to continue with: the first unfinished part after the furthest one heard; null when none heard or all done. */
  next: SeriesPart | null;
}

export function seriesProgress(parts: readonly SeriesPart[], progress: readonly ProgressRecord[]): SeriesProgress {
  const by = new Map(progress.map((p) => [p.shiurId, p]));
  const ordered = orderParts(parts);
  let completed = 0;
  let started = 0;
  let furthest = -1;
  ordered.forEach((p, i) => {
    const r = by.get(p.shiurId);
    if (!r) return;
    furthest = i;
    if (r.completed) completed++;
    else if (r.t > 0) started++;
  });
  const next = furthest < 0 ? null : (ordered.slice(furthest).find((p) => !by.get(p.shiurId)?.completed) ?? null);
  return { total: ordered.length, completed, started, next };
}

export type SeriesView = "order" | "perek" | "both";

/** `?view=` → a view the series supports; defaults to in order. */
export function viewFromQuery(search: string | URLSearchParams, opts: { hasPerek: boolean; hasSibling: boolean }): SeriesView {
  const q = typeof search === "string" ? new URLSearchParams(search) : search;
  const v = q.get("view");
  if (v === "perek" && opts.hasPerek) return "perek";
  if (v === "both" && opts.hasSibling) return "both";
  return "order";
}
