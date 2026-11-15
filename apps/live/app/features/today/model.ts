/**
 * Today (concept-live §5.1) as a pure function of the date and the data files, so it can be tested
 * on fixed dates without a DOM:
 *
 * - **This week**: the parsha from `@emunas/calendar` `thisWeek()` (table-driven, no hebcal in the
 *   bundle, C16) joined by key to `today.json` occasions; a combined parsha also lists shiurim
 *   catalogued under either part. Occasions active or starting within the lookahead are joined the
 *   same way; only those with shiurim are shown.
 * - **A moment for today**: one insight, question or story, chosen deterministically per date
 *   (`pickForDay`) from the pool of the most specific occasion of the week that has one: the active
 *   occasion with the shortest window, else the parsha, else the next occasion; with no pool this
 *   week, from all pools.
 * - **Continue**: unfinished shiurim, then the next part of each series in progress.
 * - **Newly summarized** and the corpus counter come from `today.json` and `build.json`.
 *
 * Everything respects the audio-language filter (settings store), except the counter.
 */
import { calendar as defaultCalendar, type Calendar, type HebrewDate, type ThisWeek } from "@emunas/calendar";
import type { BuildCounts } from "@emunas/corpus/public";
import type { CorpusFile, CorpusRow, MomentRef, TodayFile } from "./live-data.ts";
import { audioAllows, type AudioFilter } from "../../shell/settings.ts";
import type { ProgressRecord } from "./personal.ts";
import { pickForDay } from "./pick.ts";

/** How far ahead "this week" looks for occasions, in days. */
export const LOOKAHEAD_DAYS = 10;
/** Most occasion rows shown. */
export const MAX_OCCASIONS = 4;
/** Most cards in the newly-summarized strip. */
export const MAX_NEWLY = 8;
/** Most cards in "Continue". */
export const MAX_CONTINUE = 8;

export interface TodayInputs {
  /** Civil date `YYYY-MM-DD` (the visitor's day). */
  date: string;
  israel: boolean;
  audio: AudioFilter;
  today: TodayFile;
  corpus: CorpusFile;
  /** For tests; defaults to the committed table. */
  calendar?: Calendar;
}

export interface OccasionBlock {
  key: string;
  active: boolean;
  daysUntil: number;
  start: string;
  end: string;
  shiurim: CorpusRow[];
}

export interface ParshaBlock {
  /** The week's parsha key (combined key for a combined parsha). */
  key: string;
  /** `key` plus the parts of a combined parsha. */
  keys: string[];
  /** The Shabbos it is read. */
  date: string | null;
  /** True when this Shabbos is a Yom Tov and the parsha is next week's reading. */
  deferred: boolean;
  shiurim: CorpusRow[];
}

export interface DayMoment extends MomentRef {
  /** The occasion key whose pool it came from; null for the all-pools fallback. */
  occasionKey: string | null;
}

export interface TodayView {
  date: string;
  /** Null outside the calendar table (5787–5800). */
  week: ThisWeek | null;
  hebrewDate: HebrewDate | null;
  parsha: ParshaBlock | null;
  occasions: OccasionBlock[];
  moment: DayMoment | null;
  newly: { row: CorpusRow; updatedAt: string }[];
  counts: BuildCounts;
  /** False once every in-scope shiur has notes; the newly-summarized strip disappears then. */
  stillArriving: boolean;
}

/** Index of corpus rows by id. */
export function rowsById(corpus: CorpusFile): Map<string, CorpusRow> {
  return new Map(corpus.shiurim.map((r) => [r.id, r]));
}

function firstYear(r: CorpusRow): number {
  return r.years.length > 0 ? Math.min(...r.years) : Number.POSITIVE_INFINITY;
}

/** Rows for ids in the order given, merged across several lists by year (undated last), deduped, filtered. */
function rowsFor(lists: readonly (readonly string[])[], byId: Map<string, CorpusRow>, audio: AudioFilter): CorpusRow[] {
  const seen = new Set<string>();
  const out: CorpusRow[] = [];
  for (const ids of lists) {
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      const r = byId.get(id);
      if (r && audioAllows(audio, r.lang)) out.push(r);
    }
  }
  // Stable: rows of one list keep their (already year-ordered) order on ties.
  if (lists.length > 1) return out.map((r, i) => ({ r, i })).sort((a, b) => firstYear(a.r) - firstYear(b.r) || a.i - b.i).map((x) => x.r);
  return out;
}

function momentPool(
  keys: readonly string[],
  today: TodayFile,
  byId: Map<string, CorpusRow>,
  audio: AudioFilter,
): MomentRef[] {
  const out: MomentRef[] = [];
  const seen = new Set<string>();
  for (const k of keys) {
    for (const m of today.occasions[k]?.moments ?? []) {
      if (seen.has(m.id) || m.t === null) continue;
      const row = byId.get(m.shiurId);
      if (!row || !audioAllows(audio, row.lang)) continue;
      seen.add(m.id);
      out.push(m);
    }
  }
  return out;
}

/** The moment of the day for `date`, given the week's occasion keys in priority order. */
export function momentOfTheDay(
  date: string,
  priority: readonly (readonly string[])[],
  today: TodayFile,
  byId: Map<string, CorpusRow>,
  audio: AudioFilter,
): DayMoment | null {
  for (const keys of priority) {
    const pool = momentPool(keys, today, byId, audio);
    const pick = pickForDay(pool, `${date}|${keys.join("+")}`, (m) => m.id);
    if (pick) return { ...pick, occasionKey: keys[0] ?? null };
  }
  const all = momentPool(Object.keys(today.occasions).sort(), today, byId, audio);
  const pick = pickForDay(all, `${date}|*`, (m) => m.id);
  return pick ? { ...pick, occasionKey: null } : null;
}

export function buildToday(input: TodayInputs): TodayView {
  const cal = input.calendar ?? defaultCalendar;
  const { date, today, corpus, audio } = input;
  const byId = rowsById(corpus);
  const week = cal.thisWeek(date, { israel: input.israel, lookaheadDays: LOOKAHEAD_DAYS });

  let parsha: ParshaBlock | null = null;
  const occasions: OccasionBlock[] = [];
  const priority: string[][] = [];

  if (week) {
    if (week.parshaKey !== null) {
      const keys = week.parshaKeys;
      parsha = {
        key: week.parshaKey,
        keys,
        date: week.parshaDate,
        deferred: week.shabbos.parshaKey === null,
        shiurim: rowsFor(
          keys.map((k) => today.occasions[k]?.shiurIds ?? []),
          byId,
          audio,
        ),
      };
    }
    const hits = [...week.upcomingOccasions].sort(
      (a, b) => Number(b.active) - Number(a.active) || (a.active ? a.length - b.length : a.daysUntil - b.daysUntil) || (a.key < b.key ? -1 : 1),
    );
    for (const h of hits) {
      const shiurim = rowsFor([today.occasions[h.key]?.shiurIds ?? []], byId, audio);
      if (shiurim.length > 0 && occasions.length < MAX_OCCASIONS) {
        occasions.push({ key: h.key, active: h.active, daysUntil: h.daysUntil, start: h.start, end: h.end, shiurim });
      }
    }
    for (const h of hits.filter((x) => x.active)) priority.push([h.key]);
    if (parsha) priority.push(parsha.keys);
    for (const h of hits.filter((x) => !x.active)) priority.push([h.key]);
  }

  const newly = today.newlySummarized
    .map((n) => ({ row: byId.get(n.shiurId), updatedAt: n.updatedAt }))
    .filter((n): n is { row: CorpusRow; updatedAt: string } => n.row !== undefined && n.row.status === "full" && audioAllows(audio, n.row.lang))
    .slice(0, MAX_NEWLY);

  return {
    date,
    week,
    hebrewDate: week?.hebrewDate ?? cal.hebrewDate(date),
    parsha,
    occasions,
    moment: momentOfTheDay(date, priority, today, byId, audio),
    newly,
    counts: corpus.counts,
    stillArriving: corpus.counts.full < corpus.counts.total,
  };
}

// ---------------------------------------------------------------------------------------------
// Continue

export type ContinueItem =
  | { kind: "resume"; row: CorpusRow; t: number; updatedAt: string }
  | { kind: "next"; row: CorpusRow; seriesId: string; updatedAt: string };

/**
 * "Continue" (concept-live §5.1): unfinished shiurim (most recent first), then for each series with
 * a heard part, the first part after the furthest heard one that is not finished. Deduped, filtered
 * by the audio language, at most `MAX_CONTINUE`.
 */
export function continueItems(
  progress: readonly ProgressRecord[],
  corpus: CorpusFile,
  audio: AudioFilter,
): ContinueItem[] {
  const byId = rowsById(corpus);
  const byShiur = new Map(progress.map((p) => [p.shiurId, p]));
  const recent = [...progress].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
  const out: ContinueItem[] = [];
  const used = new Set<string>();

  for (const p of recent) {
    const row = byId.get(p.shiurId);
    if (!row || p.completed || p.t <= 0 || !audioAllows(audio, row.lang)) continue;
    out.push({ kind: "resume", row, t: p.t, updatedAt: p.updatedAt });
    used.add(row.id);
  }

  // Series in progress, most recently touched first.
  const seriesParts = new Map<string, CorpusRow[]>();
  for (const r of corpus.shiurim) {
    if (!r.series) continue;
    const list = seriesParts.get(r.series.id) ?? [];
    list.push(r);
    seriesParts.set(r.series.id, list);
  }
  const touched: { seriesId: string; updatedAt: string }[] = [];
  for (const [seriesId, parts] of seriesParts) {
    const heard = parts.map((r) => byShiur.get(r.id)).filter((p): p is ProgressRecord => p !== undefined);
    if (heard.length === 0) continue;
    const last = heard.reduce((a, b) => (a.updatedAt >= b.updatedAt ? a : b));
    touched.push({ seriesId, updatedAt: last.updatedAt });
  }
  touched.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
  for (const { seriesId, updatedAt } of touched) {
    const ordered = orderSeriesRows(seriesParts.get(seriesId) ?? []);
    let furthest = -1;
    ordered.forEach((r, i) => {
      if (byShiur.has(r.id)) furthest = i;
    });
    const next = ordered.slice(furthest + 1).find((r) => !byShiur.get(r.id)?.completed) ?? null;
    if (!next || used.has(next.id) || !audioAllows(audio, next.lang)) continue;
    out.push({ kind: "next", row: next, seriesId, updatedAt });
    used.add(next.id);
  }
  return out.slice(0, MAX_CONTINUE);
}

/** Series rows by `series.order` (null last, otherwise stable). */
export function orderSeriesRows(rows: readonly CorpusRow[]): CorpusRow[] {
  return rows
    .map((r, i) => ({ r, i, o: r.series?.order ?? Number.POSITIVE_INFINITY }))
    .sort((a, b) => a.o - b.o || a.i - b.i)
    .map((x) => x.r);
}

/** The visitor's civil date (local calendar day). */
export function localIsoDay(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** `?date=YYYY-MM-DD` (a real date) overrides today, for shared links and checks; anything else is ignored. */
export function dateFromQuery(search: string | URLSearchParams): string | null {
  const q = typeof search === "string" ? new URLSearchParams(search) : search;
  const v = q.get("date");
  if (v === null || !ISO_DAY.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : null;
}
