/**
 * The shape of the committed calendar table (`table/5787-5800.json`).
 *
 * Written by `scripts/generate.ts` (build time, @hebcal/core) and read by the runtime in
 * `./index.ts` (no hebcal). All dates are civil dates as `YYYY-MM-DD`. Windows are inclusive and
 * cover whole civil days (the evening before a Hebrew date is not modelled).
 *
 * Tuples keep the file small enough to ship to the browser (Live's "Today").
 */

/** `[firstDay, hebrewYear, month]`: the civil date of the 1st of a Hebrew month. `month` uses
 * hebcal numbering: 1 Nisan … 6 Elul, 7 Tishrei … 12 Adar (Adar I in a leap year), 13 Adar II. */
export type MonthRow = readonly [firstDay: string, year: number, month: number];

/** `[saturday, diasporaParshaKey, israelParshaKey]`; `null` when that Shabbos is a Yom Tov / Chol
 * HaMoed and no weekly parsha is read. Combined parshiyos use the combined key ("matos-masei"). */
export type ShabbosRow = readonly [saturday: string, diaspora: string | null, israel: string | null];

/** `[occasionKey, start, end]` (same everywhere) or `[occasionKey, start, end, israelStart,
 * israelEnd]` when the Israel window differs. */
export type OccasionRow =
  | readonly [key: string, start: string, end: string]
  | readonly [key: string, start: string, end: string, israelStart: string, israelEnd: string];

export interface CalendarTable {
  schema: 1;
  /** where the data came from and under which licence (build time only) */
  source: string;
  fromYear: number;
  toYear: number;
  /** first and last civil day covered (1 Tishrei of fromYear … 29 Elul of toYear) */
  start: string;
  end: string;
  /** combined parsha key → its two parts, in order */
  combined: Readonly<Record<string, readonly [string, string]>>;
  months: readonly MonthRow[];
  shabbosos: readonly ShabbosRow[];
  /** sorted by start, then key */
  occasions: readonly OccasionRow[];
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Light structural check so a hand-edited or truncated table fails loudly at import. */
export function asCalendarTable(raw: unknown): CalendarTable {
  const t = raw as Partial<CalendarTable> | null;
  const fail = (why: string): never => {
    throw new Error(`@emunas/calendar: invalid table (${why})`);
  };
  if (!t || typeof t !== "object") return fail("not an object");
  if (t.schema !== 1) fail("schema");
  if (typeof t.start !== "string" || !ISO.test(t.start)) fail("start");
  if (typeof t.end !== "string" || !ISO.test(t.end)) fail("end");
  if (!Array.isArray(t.months) || t.months.length === 0) fail("months");
  if (!Array.isArray(t.shabbosos) || t.shabbosos.length === 0) fail("shabbosos");
  if (!Array.isArray(t.occasions)) fail("occasions");
  if (!t.combined || typeof t.combined !== "object") fail("combined");
  for (const m of t.months ?? []) {
    if (!Array.isArray(m) || m.length !== 3 || !ISO.test(String(m[0]))) fail(`month row ${JSON.stringify(m)}`);
  }
  for (const s of t.shabbosos ?? []) {
    if (!Array.isArray(s) || s.length !== 3 || !ISO.test(String(s[0]))) fail(`shabbos row ${JSON.stringify(s)}`);
  }
  for (const o of t.occasions ?? []) {
    if (!Array.isArray(o) || (o.length !== 3 && o.length !== 5)) fail(`occasion row ${JSON.stringify(o)}`);
  }
  return t as CalendarTable;
}
