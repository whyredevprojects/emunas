/**
 * Runtime calendar over the committed table. Pure, browser-safe, no dependencies.
 *
 * Nothing in this file (or anything it imports) may import @hebcal/*; a bundle test enforces it.
 *
 * Days are civil days. A `Date` argument is read in the caller's local time zone (the visitor's
 * own calendar day in a browser; UTC on Workers and in CI). Pass a `YYYY-MM-DD` string to be exact.
 */
import type { CalendarTable, OccasionRow } from "./table.ts";

export interface HebrewDate {
  year: number;
  /** hebcal numbering: 1 Nisan … 6 Elul, 7 Tishrei … 12 Adar (Adar I in a leap year), 13 Adar II */
  month: number;
  /** transliterated month name ("Kislev", "Adar", "Adar I", "Adar II") */
  monthName: string;
  /** Hebrew month name without vowels ("כסלו", "אדר ב׳") */
  monthNameHe: string;
  day: number;
  leapYear: boolean;
}

export interface OccasionHit {
  /** occasion key in the shared occasion namespace (@emunas/normalize) */
  key: string;
  /** first and last civil day of the window (inclusive), for the requested diaspora/Israel mode */
  start: string;
  end: string;
  /** the date falls inside the window */
  active: boolean;
  /** days from the date to `start`; 0 when active */
  daysUntil: number;
  /** window length in days */
  length: number;
}

export interface ThisWeekOptions {
  /** Israel schedule (parsha and Yom Tov lengths). Default false (diaspora). */
  israel?: boolean;
  /** how far ahead `upcomingOccasions` looks, in days, counted from the date. Default 14. */
  lookaheadDays?: number;
}

export interface ThisWeek {
  /** the civil date asked about */
  date: string;
  hebrewDate: HebrewDate;
  /** the Shabbos of this week: the date itself if it is Shabbos, otherwise the coming one */
  shabbos: {
    date: string;
    hebrewDate: HebrewDate | null;
    /** parsha read that Shabbos; null on a Yom Tov / Chol HaMoed Shabbos */
    parshaKey: string | null;
  };
  /**
   * The parsha of the week: the Shabbos parsha, or, when that Shabbos is a Yom Tov, the next parsha
   * read (the one whose week it is "for"). Combined parshiyos keep their combined key
   * ("matos-masei"). Null only past the end of the table.
   */
  parshaKey: string | null;
  /** `parshaKey` plus, for a combined parsha, its two parts: ["matos-masei", "matos", "masei"] */
  parshaKeys: string[];
  /** the Shabbos on which `parshaKey` is read */
  parshaDate: string | null;
  /** windows overlapping [date, date + lookaheadDays]: active ones and those starting soon,
   * ordered by start, then shorter first, then key */
  upcomingOccasions: OccasionHit[];
}

export interface NearestOccasionOptions {
  israel?: boolean;
  /** only consider windows starting within this many days. Default 60. */
  maxDays?: number;
  /** ignore windows longer than this many days (e.g. 31 to skip Sefirah/Shovavim). Default: no limit. */
  maxLength?: number;
}

/** Both sites: an occasion starting within this many days is shown as upcoming. */
export const OCCASION_LOOKAHEAD_DAYS = 10;
/** Both sites: a window longer than this many days (a month, Sefirah, the Three Weeks) is long. */
export const LONG_WINDOW_DAYS = 10;
/** Both sites: how far ahead the next occasion is searched when nothing is current or upcoming. */
export const NEXT_SEARCH_DAYS = 400;

export interface CurrentAndUpcomingOptions {
  /** Israel schedule. Default false (diaspora). */
  israel?: boolean;
  /** an occasion starting within this many days of the date is "upcoming". Default 10. */
  lookaheadDays?: number;
  /** windows longer than this many days (months, Sefirah, the Three Weeks) are "long". Default 10. */
  longWindowDays?: number;
  /** whether an occasion key has anything to show (shiurim); keys without are never returned. Default: all. */
  has?: (key: string) => boolean;
  /** how far ahead `next` is searched, in days. Default 400 (over a leap year). */
  maxSearchDays?: number;
}

/**
 * The occasions to show for a day, the rule both sites share:
 *
 * 1. `current`: every short window (≤ `longWindowDays`) in progress, shortest first;
 * 2. `upcoming`: every short window starting within `lookaheadDays`, soonest first;
 * 3. `next`: only when 1 and 2 are empty, the next window starting after the date, however far
 *    (a short one when there is one within `maxSearchDays`, else a long one);
 * 4. `long`: long windows in progress or starting within `lookaheadDays`, in progress first, and,
 *    when `next` is set, the nearest window ahead if it is long and nearer than `next` (so the
 *    nearest occasion with shiurim is always visible). They are secondary: a site shows them
 *    compactly, or in full only when nothing else is shown.
 *
 * Only keys passing `has` appear, each key once (its earliest window: in progress wins).
 */
export interface CurrentAndUpcoming {
  current: OccasionHit[];
  upcoming: OccasionHit[];
  next: OccasionHit | null;
  long: OccasionHit[];
}

export interface Calendar {
  readonly table: CalendarTable;
  /** first and last civil day the table covers */
  readonly range: { start: string; end: string };
  hebrewDate(date: Date | string): HebrewDate | null;
  thisWeek(date: Date | string, options?: ThisWeekOptions): ThisWeek | null;
  nearestOccasion(date: Date | string, options?: NearestOccasionOptions): OccasionHit | null;
  /** The shared "what to show now" rule; null outside the table. */
  currentAndUpcoming(date: Date | string, options?: CurrentAndUpcomingOptions): CurrentAndUpcoming | null;
  /** all windows of one occasion key, in order (for "next Chanukah" style links) */
  occasionWindows(key: string, options?: { israel?: boolean }): { start: string; end: string }[];
}

// ---------------------------------------------------------------------------------------------
// civil day arithmetic (UTC day numbers; no time zones involved after parsing)

const DAY_MS = 86_400_000;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Normalise a Date (local calendar day) or `YYYY-MM-DD` string to `YYYY-MM-DD`. */
export function toIsoDay(date: Date | string): string {
  if (typeof date === "string") {
    const m = ISO_RE.exec(date);
    if (!m) throw new RangeError(`@emunas/calendar: expected YYYY-MM-DD, got ${JSON.stringify(date)}`);
    const iso = fromDayNumber(dayNumber(date));
    if (iso !== date) throw new RangeError(`@emunas/calendar: not a real date ${date}`);
    return date;
  }
  if (Number.isNaN(date.getTime())) throw new RangeError("@emunas/calendar: invalid Date");
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${String(y).padStart(4, "0")}-${mo}-${d}`;
}

function dayNumber(iso: string): number {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

function fromDayNumber(n: number): string {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

/** index of the last row whose first column is ≤ iso (rows sorted by that column), or -1 */
function lastAtOrBefore(rows: readonly (readonly [string, ...unknown[]])[], iso: string): number {
  let lo = 0;
  let hi = rows.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const row = rows[mid];
    if (row !== undefined && row[0] <= iso) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

// ---------------------------------------------------------------------------------------------
// month names

const MONTHS: readonly (readonly [string, string])[] = [
  ["", ""],
  ["Nisan", "ניסן"],
  ["Iyyar", "אייר"],
  ["Sivan", "סיון"],
  ["Tamuz", "תמוז"],
  ["Av", "אב"],
  ["Elul", "אלול"],
  ["Tishrei", "תשרי"],
  ["Cheshvan", "חשון"],
  ["Kislev", "כסלו"],
  ["Tevet", "טבת"],
  ["Sh'vat", "שבט"],
  ["Adar", "אדר"],
  ["Adar II", "אדר ב׳"],
];

function monthNames(month: number, leap: boolean): readonly [string, string] {
  if (month === 12 && leap) return ["Adar I", "אדר א׳"];
  return MONTHS[month] ?? ["", ""];
}

// ---------------------------------------------------------------------------------------------

/** Build a calendar over a table (the default export uses the committed one). */
export function createCalendar(table: CalendarTable): Calendar {
  const startN = dayNumber(table.start);
  const endN = dayNumber(table.end);
  const leapYears = new Set<number>();
  for (const [, year, month] of table.months) if (month === 13) leapYears.add(year);
  const shabbosIndex = new Map<string, number>();
  table.shabbosos.forEach(([d], i) => shabbosIndex.set(d, i));

  const inRange = (n: number) => n >= startN && n <= endN;

  function hebrewDateOf(iso: string): HebrewDate | null {
    const n = dayNumber(iso);
    if (!inRange(n)) return null;
    const row = table.months[lastAtOrBefore(table.months, iso)];
    if (!row) return null;
    const [first, year, month] = row;
    const leap = leapYears.has(year);
    const [monthName, monthNameHe] = monthNames(month, leap);
    return { year, month, monthName, monthNameHe, day: n - dayNumber(first) + 1, leapYear: leap };
  }

  function windowOf(row: OccasionRow, israel: boolean): { start: string; end: string } {
    if (israel && row.length === 5) return { start: row[3], end: row[4] };
    return { start: row[1], end: row[2] };
  }

  function hit(row: OccasionRow, israel: boolean, n: number): OccasionHit {
    const { start, end } = windowOf(row, israel);
    const s = dayNumber(start);
    const e = dayNumber(end);
    const active = n >= s && n <= e;
    return { key: row[0], start, end, active, daysUntil: active ? 0 : s - n, length: e - s + 1 };
  }

  const byStart = (a: OccasionHit, b: OccasionHit) =>
    (a.start < b.start ? -1 : a.start > b.start ? 1 : 0) || a.length - b.length || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

  /** windows overlapping [n, n + days] */
  function overlapping(n: number, days: number, israel: boolean): OccasionHit[] {
    const out: OccasionHit[] = [];
    for (const row of table.occasions) {
      const h = hit(row, israel, n);
      const s = dayNumber(h.start);
      const e = dayNumber(h.end);
      if (e >= n && s <= n + days) out.push(h);
    }
    return out.sort(byStart);
  }

  function thisWeek(date: Date | string, options: ThisWeekOptions = {}): ThisWeek | null {
    const iso = toIsoDay(date);
    const n = dayNumber(iso);
    if (!inRange(n)) return null;
    const israel = options.israel === true;
    const lookahead = Math.max(0, Math.floor(options.lookaheadDays ?? 14));
    const hebrewDate = hebrewDateOf(iso);
    if (!hebrewDate) return null;

    // 1970-01-01 (day 0) was a Thursday, so (n + 4) % 7 is the weekday with Sunday = 0
    const weekday = (((n + 4) % 7) + 7) % 7;
    const satN = n + (6 - weekday);
    const satIso = fromDayNumber(satN);
    const col = israel ? 2 : 1;
    const idx = shabbosIndex.get(satIso);
    const shabbosRow = idx === undefined ? undefined : table.shabbosos[idx];
    const shabbosParsha = shabbosRow ? shabbosRow[col] : null;

    let parshaKey: string | null = null;
    let parshaDate: string | null = null;
    if (idx !== undefined) {
      for (let i = idx; i < table.shabbosos.length; i++) {
        const row = table.shabbosos[i];
        const key = row?.[col];
        if (row && typeof key === "string") {
          parshaKey = key;
          parshaDate = row[0];
          break;
        }
      }
    }
    const parts = parshaKey ? table.combined[parshaKey] : undefined;
    const parshaKeys = parshaKey ? [parshaKey, ...(parts ?? [])] : [];

    return {
      date: iso,
      hebrewDate,
      shabbos: { date: satIso, hebrewDate: hebrewDateOf(satIso), parshaKey: shabbosParsha ?? null },
      parshaKey,
      parshaKeys,
      parshaDate,
      upcomingOccasions: overlapping(n, lookahead, israel),
    };
  }

  function nearestOccasion(date: Date | string, options: NearestOccasionOptions = {}): OccasionHit | null {
    const iso = toIsoDay(date);
    const n = dayNumber(iso);
    if (!inRange(n)) return null;
    const israel = options.israel === true;
    const maxDays = Math.max(0, Math.floor(options.maxDays ?? 60));
    const maxLength = options.maxLength ?? Number.POSITIVE_INFINITY;
    const candidates = overlapping(n, maxDays, israel).filter((h) => h.length <= maxLength);
    // an occasion in progress wins; among those the most specific (shortest), then the latest begun
    const active = candidates.filter((h) => h.active);
    if (active.length > 0) {
      return [...active].sort((a, b) => a.length - b.length || (a.start > b.start ? -1 : a.start < b.start ? 1 : 0) || (a.key < b.key ? -1 : 1))[0] ?? null;
    }
    return candidates[0] ?? null;
  }

  function currentAndUpcoming(date: Date | string, options: CurrentAndUpcomingOptions = {}): CurrentAndUpcoming | null {
    const iso = toIsoDay(date);
    const n = dayNumber(iso);
    if (!inRange(n)) return null;
    const israel = options.israel === true;
    const lookahead = Math.max(0, Math.floor(options.lookaheadDays ?? OCCASION_LOOKAHEAD_DAYS));
    const longDays = Math.max(1, Math.floor(options.longWindowDays ?? LONG_WINDOW_DAYS));
    const search = Math.max(lookahead, Math.floor(options.maxSearchDays ?? NEXT_SEARCH_DAYS));
    const has = options.has ?? (() => true);
    // one window per key: the earliest overlapping one (overlapping() is ordered by start, so an
    // active window comes before a later one of the same key)
    const seen = new Set<string>();
    const hits: OccasionHit[] = [];
    for (const h of overlapping(n, search, israel)) {
      if (seen.has(h.key) || !has(h.key)) continue;
      seen.add(h.key);
      hits.push(h);
    }
    const isLong = (h: OccasionHit) => h.length > longDays;
    const byKey = (a: OccasionHit, b: OccasionHit) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
    const current = hits
      .filter((h) => h.active && !isLong(h))
      .sort((a, b) => a.length - b.length || (a.start > b.start ? -1 : a.start < b.start ? 1 : 0) || byKey(a, b));
    const soon = (h: OccasionHit) => !h.active && h.daysUntil <= lookahead;
    const upcoming = hits.filter((h) => soon(h) && !isLong(h)).sort((a, b) => a.daysUntil - b.daysUntil || a.length - b.length || byKey(a, b));
    const long = hits
      .filter((h) => isLong(h) && (h.active || soon(h)))
      .sort((a, b) => Number(b.active) - Number(a.active) || a.daysUntil - b.daysUntil || a.length - b.length || byKey(a, b));
    let next: OccasionHit | null = null;
    if (current.length === 0 && upcoming.length === 0) {
      const ahead = hits.filter((h) => !h.active).sort((a, b) => a.daysUntil - b.daysUntil || a.length - b.length || byKey(a, b));
      next = ahead.find((h) => !isLong(h)) ?? ahead.find((h) => !long.includes(h)) ?? null;
      // a long window ahead that is nearer than `next` (Elul two weeks before Rosh Hashanah) is
      // still shown, compactly, so the nearest occasion with shiurim is never hidden
      const nearest = ahead[0];
      if (nearest && next && nearest !== next && isLong(nearest) && nearest.daysUntil < next.daysUntil && !long.includes(nearest)) {
        long.push(nearest);
      }
    }
    return { current, upcoming, next, long };
  }

  function occasionWindows(key: string, options: { israel?: boolean } = {}): { start: string; end: string }[] {
    const israel = options.israel === true;
    return table.occasions.filter((r) => r[0] === key).map((r) => windowOf(r, israel));
  }

  return {
    table,
    range: { start: table.start, end: table.end },
    hebrewDate: (date) => hebrewDateOf(toIsoDay(date)),
    thisWeek,
    nearestOccasion,
    currentAndUpcoming,
    occasionWindows,
  };
}
