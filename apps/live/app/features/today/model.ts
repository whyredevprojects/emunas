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
 * - **Continue**: unfinished shiurim, then the next part of each series in progress (rows from the
 *   heard shiurim's own files, `continue.ts`).
 * - **The occasion mix** (concept-live-corpus C.3, C3.4): one per week, for the most specific occasion
 *   whose `today.json` entry has a mix, in the same priority as the moment of the day. Its head (the
 *   first sections, inline) plays without another request; `mix/occasion.ts` holds the rules.
 * - **Newly summarized** and the corpus counter come from `today.json`.
 *
 * Today renders from `today.json` alone (corpus-wave-plan §4, C1.7): its cards carry every shiur it
 * names. No corpus-wide file (`corpus.json`, `facets.json`, the corpus layer) is read here.
 *
 * Everything respects the audio-language filter (settings store), except the counter.
 */
import { calendar as defaultCalendar, type Calendar, type HebrewDate, type ThisWeek } from "@emunas/calendar";
import type { BuildCounts, Ed, L, ShiurStatus } from "@emunas/corpus/public";
import type { FacetLabel, TodayFile } from "./live-data.ts";
import { MIX_SIZE, type MixSource } from "../mix/model.ts";
import { headSources, occasionCatalog, occasionMix, skipSet } from "../mix/occasion.ts";
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
  /** For tests; defaults to the committed table. */
  calendar?: Calendar;
}

/** A shiur as Today shows it: a card from `today.json`. */
export interface TodayRow {
  id: string;
  lang: Ed;
  title: string;
  oneLiner: L | null;
  duration: number;
  years: number[];
  status: ShiurStatus;
}

/** A shiur Continue knows from its own file: its card, its series place and the next part. */
export interface ContinueRow extends TodayRow {
  series: { id: string; order: number | null } | null;
  /** The next part in series order (shiur file `related.next`), or null. */
  next: string | null;
}

/** `<shiurId>~<kind><n>` → `<shiurId>`. */
export function shiurOfMoment(id: string): string {
  const at = id.indexOf("~");
  return at < 0 ? id : id.slice(0, at);
}

/** A moment of the day candidate. */
export interface PoolMoment {
  id: string;
  shiurId: string;
  t: number;
}

export interface OccasionBlock {
  key: string;
  active: boolean;
  daysUntil: number;
  start: string;
  end: string;
  shiurim: TodayRow[];
  /** All of the occasion's shiurim (the row shows a few per language). */
  total: number;
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
  shiurim: TodayRow[];
}

export interface DayMoment extends PoolMoment {
  /** The occasion key whose pool it came from; null for the all-pools fallback. */
  occasionKey: string | null;
}

/** The week's occasion mix: which occasion, its topic, and the head that plays at once. */
export interface WeekMix {
  /** The occasion key whose mix it is. */
  key: string;
  /** Every key of that occasion (both parts of a combined parsha): their catalog shiurim come first. */
  keys: string[];
  topicId: string;
  label: FacetLabel;
  /** Sections and distinct shiurim of the whole mix (all languages, build-time count). */
  sections: number;
  shiurim: number;
  /** Eligible inline sections in the listener's audio language, in order. */
  head: MixSource[];
  /** The occasion's catalog shiurim as today.json knows them. */
  catalog: string[];
  /** Shiur and section ids that may not be featured (D7). */
  skip: string[];
}

export interface TodayView {
  date: string;
  /** Null outside the calendar table (5787–5800). */
  week: ThisWeek | null;
  hebrewDate: HebrewDate | null;
  parsha: ParshaBlock | null;
  occasions: OccasionBlock[];
  moment: DayMoment | null;
  /** The occasion mix button's data, or null when no occasion of the week has a mix. */
  mix: WeekMix | null;
  newly: { row: TodayRow; updatedAt: string }[];
  counts: BuildCounts;
  /** False once every in-scope shiur has notes; the newly-summarized strip disappears then. */
  stillArriving: boolean;
}

/** Today's cards by shiur id. */
export function rowsById(today: Pick<TodayFile, "cards">): Map<string, TodayRow> {
  return new Map(
    Object.entries(today.cards).map(([id, c]) => [
      id,
      { id, lang: c.lang, title: c.title, oneLiner: c.oneLiner ?? null, duration: c.duration, years: c.years, status: c.status },
    ]),
  );
}

function firstYear(r: TodayRow): number {
  return r.years.length > 0 ? Math.min(...r.years) : Number.POSITIVE_INFINITY;
}

/** Rows for ids in the order given, merged across several lists by year (undated last), deduped, filtered. */
function rowsFor(lists: readonly (readonly string[])[], byId: Map<string, TodayRow>, audio: AudioFilter): TodayRow[] {
  const seen = new Set<string>();
  const out: TodayRow[] = [];
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
  byId: Map<string, TodayRow>,
  audio: AudioFilter,
): PoolMoment[] {
  const out: PoolMoment[] = [];
  const seen = new Set<string>();
  for (const k of keys) {
    for (const m of today.occasions[k]?.moments ?? []) {
      if (seen.has(m.id) || typeof m.t !== "number") continue;
      const shiurId = shiurOfMoment(m.id);
      const row = byId.get(shiurId);
      if (!row || !audioAllows(audio, row.lang)) continue;
      seen.add(m.id);
      out.push({ id: m.id, shiurId, t: m.t });
    }
  }
  return out;
}

/** The moment of the day for `date`, given the week's occasion keys in priority order. */
export function momentOfTheDay(
  date: string,
  priority: readonly (readonly string[])[],
  today: TodayFile,
  byId: Map<string, TodayRow>,
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

/**
 * The week's occasion mix: the first occasion in `priority` (each entry an occasion's keys) with a
 * mix whose head has a section in the listener's language; else the first with a mix at all (its
 * sections then come from the topic file when play is pressed).
 */
export function weekMix(priority: readonly (readonly string[])[], today: TodayFile, audio: AudioFilter): WeekMix | null {
  let fallback: WeekMix | null = null;
  const langOf = (id: string) => today.cards[id]?.lang;
  for (const keys of priority) {
    const key = keys.find((k) => today.occasions[k]?.mix);
    const mix = key === undefined ? null : today.occasions[key]?.mix;
    if (key === undefined || !mix || typeof mix.topicId !== "string") continue;
    const skip = skipSet(mix);
    const head = occasionMix({ head: headSources(mix, langOf), skip, audio, size: MIX_SIZE }).items;
    const choice: WeekMix = {
      key,
      keys: [...keys],
      topicId: mix.topicId,
      label: mix.label,
      sections: mix.sections,
      shiurim: mix.shiurim,
      head,
      catalog: occasionCatalog(keys.map((k) => today.occasions[k])),
      skip: [...skip],
    };
    if (head.length > 0) return choice;
    fallback ??= choice;
  }
  return fallback;
}

export function buildToday(input: TodayInputs): TodayView {
  const cal = input.calendar ?? defaultCalendar;
  const { date, today, audio } = input;
  const byId = rowsById(today);
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
      const o = today.occasions[h.key];
      const shiurim = rowsFor([o?.shiurIds ?? []], byId, audio);
      if (shiurim.length > 0 && occasions.length < MAX_OCCASIONS) {
        occasions.push({ key: h.key, active: h.active, daysUntil: h.daysUntil, start: h.start, end: h.end, shiurim, total: o?.total ?? shiurim.length });
      }
    }
    for (const h of hits.filter((x) => x.active)) priority.push([h.key]);
    if (parsha) priority.push(parsha.keys);
    for (const h of hits.filter((x) => !x.active)) priority.push([h.key]);
  }

  const newly = today.newlySummarized
    .map((n) => ({ row: byId.get(n.shiurId), updatedAt: n.updatedAt }))
    .filter((n): n is { row: TodayRow; updatedAt: string } => n.row !== undefined && n.row.status === "full" && audioAllows(audio, n.row.lang))
    .slice(0, MAX_NEWLY);

  return {
    date,
    week,
    hebrewDate: week?.hebrewDate ?? cal.hebrewDate(date),
    parsha,
    occasions,
    moment: momentOfTheDay(date, priority, today, byId, audio),
    mix: weekMix(priority, today, audio),
    newly,
    counts: today.counts,
    stillArriving: today.counts.full < today.counts.total,
  };
}

// ---------------------------------------------------------------------------------------------
// Continue

export type ContinueItem =
  | { kind: "resume"; row: ContinueRow; t: number; updatedAt: string }
  | { kind: "next"; row: ContinueRow; seriesId: string; updatedAt: string };

/** Hops along `next` past parts already finished. */
export const MAX_NEXT_HOPS = 8;

/**
 * "Continue" (concept-live §5.1): unfinished shiurim (most recent first), then for each series with
 * a heard part, the first part after the furthest heard one that is not finished (following each
 * part's `next`). Deduped, filtered by the audio language, at most `MAX_CONTINUE`. `rows` holds the
 * heard shiurim and the parts after them (`continue.ts` loads their files).
 */
export function continueItems(
  progress: readonly ProgressRecord[],
  rows: ReadonlyMap<string, ContinueRow>,
  audio: AudioFilter,
): ContinueItem[] {
  const byShiur = new Map(progress.map((p) => [p.shiurId, p]));
  const recent = [...progress].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
  const out: ContinueItem[] = [];
  const used = new Set<string>();

  for (const p of recent) {
    const row = rows.get(p.shiurId);
    if (!row || p.completed || p.t <= 0 || !audioAllows(audio, row.lang)) continue;
    out.push({ kind: "resume", row, t: p.t, updatedAt: p.updatedAt });
    used.add(row.id);
  }

  // Series in progress, most recently touched first; per series the furthest heard part.
  const touched = new Map<string, { updatedAt: string; furthest: ContinueRow }>();
  for (const p of recent) {
    const row = rows.get(p.shiurId);
    if (!row?.series) continue;
    const prev = touched.get(row.series.id);
    const order = (r: ContinueRow) => r.series?.order ?? Number.NEGATIVE_INFINITY;
    if (!prev) touched.set(row.series.id, { updatedAt: p.updatedAt, furthest: row });
    else if (order(row) > order(prev.furthest)) prev.furthest = row;
  }
  for (const [seriesId, { updatedAt, furthest }] of touched) {
    let id = furthest.next;
    for (let hop = 0; id !== null && byShiur.get(id)?.completed && hop < MAX_NEXT_HOPS; hop++) id = rows.get(id)?.next ?? null;
    const next = id === null ? undefined : rows.get(id);
    if (!next || byShiur.get(next.id)?.completed || used.has(next.id) || !audioAllows(audio, next.lang)) continue;
    out.push({ kind: "next", row: next, seriesId, updatedAt });
    used.add(next.id);
  }
  return out.slice(0, MAX_CONTINUE);
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
