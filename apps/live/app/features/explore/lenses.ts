/**
 * Data models for the three lenses over the result set (concept-live §5.2, tech-live §4.3). Pure:
 * the SVG components only draw what these return, and the text alternatives list the same values.
 *
 * - Luach: the 54 parshiyos on an outer ring (combined parshiyos between their parts, when the data
 *   has them) and the zmanim on an inner ring, Tishrei to Elul. Counts are the occasion facet counts
 *   (every other facet applied), so a stop shows how many shiurim selecting it would give.
 * - Years: one bar per Hebrew year 5724–5780 (widened if the data goes beyond) plus an "undated" lane
 *   whose count is the shiurim without `hebrewYears`. Counts are the year facet counts.
 * - Connections: one centre entity and its one-hop neighbours from `entity/<kind>/<key>.json`,
 *   hiding every edge with fewer than `MIN_SHARED` shared shiurim (unreviewed extraction).
 */
import { OCCASIONS, PARSHIYOS } from "@emunas/normalize";
import type { CorpusRow, EntityFile, EntityKind, FacetLabel, FacetsFile, FacetValue } from "./live-data.ts";
import { UNDATED } from "./model.ts";

// ------------------------------------------------------------------------------------------- Luach

export interface LuachStop {
  key: string;
  label: FacetLabel;
  count: number;
  /** Angle in turns from the top, clockwise (0 … 1). */
  turn: number;
  combined: boolean;
}

export interface LuachModel {
  outer: LuachStop[];
  inner: LuachStop[];
  /** Occasions in the data that are not calendar stops (one-off events, the "other" bucket). */
  others: Omit<LuachStop, "turn" | "combined">[];
}

function ring<T extends { key: string; label: FacetLabel; count: number; combined: boolean }>(items: T[]): (T & { turn: number })[] {
  return items.map((it, i) => ({ ...it, turn: i / Math.max(1, items.length) }));
}

/**
 * @param counts occasion key → count under the current filters (`counts.occasion`)
 * @param facets occasion labels and the set of occasions present in the corpus
 */
export function luachModel(counts: Readonly<Record<string, number>>, facets: Pick<FacetsFile, "occasion"> | null): LuachModel {
  const present = (key: string) => facets?.occasion[key] !== undefined || counts[key] !== undefined;
  const labelOf = (key: string, fallback: FacetLabel): FacetLabel => facets?.occasion[key]?.label ?? fallback;

  const parshiyos = [...PARSHIYOS]
    .sort((a, b) => a.order - b.order)
    .filter((p) => p.parts === undefined || present(p.key))
    .map((p) => ({
      key: p.key,
      label: labelOf(p.key, { en: p.en, yi: p.yi, he: p.he }),
      count: counts[p.key] ?? 0,
      combined: p.parts !== undefined,
    }));

  // The table runs from Elul; the Luach runs Tishrei → Elul, so Elul moves to the end.
  const fromTishrei = [...OCCASIONS].sort((a, b) => a.order - b.order);
  const elul = fromTishrei.filter((o) => o.key === "elul");
  const zmanim = [...fromTishrei.filter((o) => o.key !== "elul"), ...elul]
    .filter((o) => present(o.key))
    .map((o) => ({ key: o.key, label: labelOf(o.key, { en: o.en, yi: o.yi, he: o.he }), count: counts[o.key] ?? 0, combined: false }));

  const onRing = new Set([...parshiyos.map((p) => p.key), ...zmanim.map((z) => z.key)]);
  const others = Object.entries(facets?.occasion ?? {})
    .filter(([key]) => !onRing.has(key))
    .map(([key, v]) => ({ key, label: v.label, count: counts[key] ?? 0 }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));

  return { outer: ring(parshiyos), inner: ring(zmanim), others };
}

// ------------------------------------------------------------------------------------------- Years

export const YEAR_MIN = 5724;
export const YEAR_MAX = 5780;

export interface YearsModel {
  bars: { year: number; count: number }[];
  undated: number;
  /** Largest year bar (the undated lane is drawn apart, with its count written out); at least 1. */
  max: number;
}

/** @param counts year key (`"5736"`, `"unknown"`) → count under the current filters (`counts.year`). */
export function yearsModel(counts: Readonly<Record<string, number>>): YearsModel {
  const years = Object.keys(counts)
    .filter((k) => k !== UNDATED)
    .map(Number)
    .filter(Number.isInteger);
  const lo = Math.min(YEAR_MIN, ...years);
  const hi = Math.max(YEAR_MAX, ...years);
  const bars: YearsModel["bars"] = [];
  for (let y = lo; y <= hi; y++) bars.push({ year: y, count: counts[String(y)] ?? 0 });
  const undated = counts[UNDATED] ?? 0;
  return { bars, undated, max: Math.max(1, ...bars.map((b) => b.count)) };
}

// ------------------------------------------------------------------------------------- Connections

/** Edges with fewer shared shiurim than this are hidden (concept-live §5.2). */
export const MIN_SHARED = 5;

export interface ConnectionEdge {
  kind: EntityKind;
  key: string;
  label: FacetLabel;
  shared: number;
  turn: number;
}

export function entityLabel(facets: FacetsFile | null, kind: EntityKind, key: string): FacetLabel | null {
  if (!facets) return null;
  const v: FacetValue | undefined = kind === "p" ? facets.person[key] : kind === "c" ? facets.concept[key] : facets.occasion[key];
  return v?.label ?? null;
}

export function connectionsModel(entity: EntityFile, facets: FacetsFile | null, minShared = MIN_SHARED): ConnectionEdge[] {
  const kept = entity.related
    .filter((r) => r.shared >= minShared && !(r.kind === entity.kind && r.key === entity.key))
    .sort((a, b) => b.shared - a.shared || a.key.localeCompare(b.key));
  return kept.map((r, i) => ({
    kind: r.kind,
    key: r.key,
    label: entityLabel(facets, r.kind, r.key) ?? { en: r.key, yi: r.key },
    shared: r.shared,
    turn: i / Math.max(1, kept.length),
  }));
}

/** Whether a row carries an entity. */
export function rowHas(row: Pick<CorpusRow, "entities" | "parsha" | "zman">, kind: EntityKind, key: string): boolean {
  if (kind === "p") return row.entities.people.includes(key);
  if (kind === "c") return row.entities.concepts.includes(key);
  return row.parsha === key || row.zman === key;
}

/** The shiurim along an edge: rows carrying both entities, in corpus order. */
export function sharedRows<R extends Pick<CorpusRow, "entities" | "parsha" | "zman">>(
  rows: readonly R[],
  a: { kind: EntityKind; key: string },
  b: { kind: EntityKind; key: string },
): R[] {
  return rows.filter((r) => rowHas(r, a.kind, a.key) && rowHas(r, b.kind, b.key));
}

/** Point on a circle for a turn (0 = top, clockwise), mirrored for right-to-left layouts. */
export function polar(cx: number, cy: number, r: number, turn: number, rtl = false): { x: number; y: number } {
  const a = 2 * Math.PI * turn;
  const dx = r * Math.sin(a);
  return { x: cx + (rtl ? -dx : dx), y: cy - r * Math.cos(a) };
}
