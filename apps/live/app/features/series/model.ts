/**
 * Series (concept-live §5.6) as pure functions:
 *
 * - the index of all series, one row each: a course given in the other language is a separate
 *   course and is never paired with this one (concept-live-corpus F.1);
 * - parts in catalog `seriesOrder` (parts without an order last, otherwise stable);
 * - Tanya by perek: each part filed under every perek it covers (`ו-ז`, `י"א וי"ב`), so whoever is
 *   learning perek 12 finds every part on it, in either language;
 * - progress over the parts from the personal store;
 * - the series synthesis (concept-live-corpus C.6): generated title, overview, key themes and the
 *   position-aware arc line of each visible part, which replaces the part's own one-liner.
 */
import { numeralValue, pickText, type PickedText, type UiLang } from "@emunas/i18n";
import type { Ed, LocalizedText } from "@emunas/corpus/public";
import type { FacetsFile, SeriesFacetValue, SeriesFile, SeriesPart } from "../today/live-data.ts";
import type { ProgressRecord } from "../today/personal.ts";

// ---------------------------------------------------------------------------------------------
// Index

export interface SeriesEntry extends SeriesFacetValue {
  id: string;
}

export interface SeriesIndexRow {
  /** Exactly one series: nothing pairs a course with one in the other language. */
  entries: SeriesEntry[];
}

/** Every series in `facets.json` (W3.6 lists them in corpus order), one per row. */
export function seriesIndex(facets: Pick<FacetsFile, "series">): SeriesIndexRow[] {
  return Object.entries(facets.series).map(([id, v]) => ({ entries: [{ id, ...v }] }));
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

export type SeriesView = "order" | "perek";

/** `?view=` → a view the series supports; anything else is the default, in order. */
export function viewFromQuery(search: string | URLSearchParams, opts: { hasPerek: boolean }): SeriesView {
  const q = typeof search === "string" ? new URLSearchParams(search) : search;
  const v = q.get("view");
  if (v === "perek" && opts.hasPerek) return "perek";
  return "order";
}

// ---------------------------------------------------------------------------------------------
// Synthesis (concept-live-corpus C.6)

/**
 * The generated introduction of a series for one reading language; blank fields are left out. Each
 * text is in the reading language where it has one, else along `CONTENT_FALLBACK`, and carries the
 * language it is actually in.
 */
export interface SeriesIntro {
  title: PickedText | null;
  overview: PickedText | null;
  /** Plain text: these are not topic ids and are never linked. */
  keyThemes: PickedText[];
  reviewed: boolean;
}

function clean(l: LocalizedText | null | undefined, lang: Ed): string | null {
  const v: unknown = l?.[lang];
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/** The reader's text of `l` (falling back along `CONTENT_FALLBACK`), trimmed; null when every language is blank. */
function picked(l: LocalizedText | null | undefined, read: UiLang): PickedText | null {
  if (!l || typeof l !== "object") return null;
  const p = pickText(l, read);
  const text = typeof p.text === "string" ? p.text.trim() : "";
  return text === "" ? null : { ...p, text };
}

/**
 * The synthesis of a series in the reading language, or null when the series has none (the page
 * then shows no synthesis UI at all). A field the guard suppressed arrives blank and is left out;
 * the synthesis itself, and so its label, stays.
 */
export function seriesIntro(series: Pick<SeriesFile, "synthesis">, read: UiLang): SeriesIntro | null {
  const x = series.synthesis;
  if (!x) return null;
  return {
    title: picked(x.title, read),
    overview: picked(x.overview, read),
    keyThemes: (Array.isArray(x.keyThemes) ? x.keyThemes : []).flatMap((k) => {
      const v = picked(k, read);
      return v === null ? [] : [v];
    }),
    reviewed: x.reviewed === true,
  };
}

/**
 * A part is visible (has notes on the site and may be linked) only when its shiur is `full`. Any
 * other status, including one a later data shape adds, is shown as plain text and never linked.
 */
export function partVisible(part: Pick<SeriesPart, "status">): boolean {
  return part.status === "full";
}

/** What a part row shows under its title. */
export type PartLine =
  /** A generated line: the arc line (with a synthesis) or the part's own one-liner. */
  | { kind: "line"; text: LocalizedText; source: "arc" | "part" }
  /** No synthesis and no notes yet: the card says notes are pending, as every shiur card does. */
  | { kind: "pending" }
  /** A part of a synthesized series that is not visible (catalog-only): the row, with no line. */
  | { kind: "none" };

/**
 * The line of each part, by shiur id. With a synthesis the ordered path reads as a course: each
 * visible part shows its arc line, written with its position in mind, in place of its standalone
 * one-liner; a visible part the arc does not cover keeps its own one-liner; a part that is not
 * visible shows its row without a line. Without a synthesis each part shows its own one-liner.
 */
export function partLines(series: Pick<SeriesFile, "parts" | "synthesis">): Map<string, PartLine> {
  const out = new Map<string, PartLine>();
  const x = series.synthesis;
  const arc = new Map<string, LocalizedText>();
  for (const a of x && Array.isArray(x.arc) ? x.arc : []) {
    if (!arc.has(a.shiurId) && (clean(a.oneLiner, "en") !== null || clean(a.oneLiner, "yi") !== null)) arc.set(a.shiurId, a.oneLiner);
  }
  for (const p of series.parts) {
    const own = p.oneLiner;
    if (!x) {
      out.set(p.shiurId, own ? { kind: "line", text: own, source: "part" } : { kind: "pending" });
      continue;
    }
    const visible = partVisible(p);
    const a = visible ? arc.get(p.shiurId) : undefined;
    if (a) out.set(p.shiurId, { kind: "line", text: a, source: "arc" });
    else if (visible && own) out.set(p.shiurId, { kind: "line", text: own, source: "part" });
    else out.set(p.shiurId, { kind: "none" });
  }
  return out;
}
