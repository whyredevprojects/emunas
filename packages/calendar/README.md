# @emunas/calendar

Hebrew calendar data for both sites (integration-plan §1.2, C16; work package W1.4).

- **Build time:** `scripts/generate.ts` uses `@hebcal/core` to write `table/5787-5800.json`
  (committed): every Shabbos from 1 Tishrei 5787 (2026-09-12) to 29 Elul 5800 (2040-09-07) with
  its parsha for the diaspora and for Israel (combined parshiyos as `"matos-masei"`), the start of
  every Hebrew month, and the civil-date window of every occasion, with a separate Israel window
  where Yom Tov lengths differ.
- **Run time:** `src/index.ts` reads only that table. No `@hebcal` code is imported, bundled or
  shipped (`test/bundle.test.ts` checks this with an esbuild metafile). About 4.5 KB of minified code
  plus a ~67 KB (≈11 KB gzip) JSON table.

## API

```ts
import { thisWeek, nearestOccasion, hebrewDate, occasionWindows } from "@emunas/calendar";

thisWeek("2027-06-10");                  // diaspora
// {
//   date: "2027-06-10",
//   hebrewDate: { year: 5787, month: 3, monthName: "Sivan", monthNameHe: "סיון", day: 5, leapYear: true },
//   shabbos: { date: "2027-06-12", hebrewDate: {...}, parshaKey: null },   // 2nd day of Shavuos
//   parshaKey: "nasso", parshaKeys: ["nasso"], parshaDate: "2027-06-19",
//   upcomingOccasions: [{ key: "sefirah", active: true, ... }, { key: "sivan", active: true, ... },
//                       { key: "shavuos", start: "2027-06-11", end: "2027-06-12", active: false, daysUntil: 1, length: 2 }]
// }
thisWeek("2027-06-10", { israel: true }).parshaKey;   // "nasso", read on 2027-06-12
thisWeek("2027-07-14").parshaKeys;                    // ["chukas-balak", "chukas", "balak"]
nearestOccasion("2026-12-08")?.key;                   // "chanukah"
nearestOccasion("2027-05-21", { maxLength: 8 });      // Lag BaOmer, 4 days ahead
```

- `thisWeek(date, { israel?, lookaheadDays? = 14 })`. The week's Shabbos is the date itself if it
  is Shabbos, else the coming one. `parshaKey` is that Shabbos's parsha; when that Shabbos is a
  Yom Tov or Chol HaMoed it is the next parsha read (`parshaDate` says when). `parshaKeys` adds
  the two parts of a combined parsha, so a page can list shiurim catalogued under either spelling.
  `upcomingOccasions` holds every window overlapping `[date, date + lookaheadDays]`, ordered by
  start, with `active` and `daysUntil`.
- `nearestOccasion(date, { israel?, maxDays? = 60, maxLength? })`: the occasion in progress (the
  shortest one, so Chanukah beats Kislev) or else the next to start. `maxLength` skips long
  seasons such as months, Sefirah, Shovavim.
- `currentAndUpcoming(date, { israel?, lookaheadDays? = 10, longWindowDays? = 10, has?, maxSearchDays? = 400 })`:
  what both sites show for a day. `current`: every short window (≤ `longWindowDays`) in
  progress, shortest first. `upcoming`: every short window starting within `lookaheadDays`,
  soonest first. `next`: only when both are empty, the next window however far ahead (a short
  one if any, so a month never takes the only slot). `long`: months, Sefirah, the Three Weeks in
  progress or starting soon, for a compact display. `has(key)` (shiurim exist) filters every list;
  each key appears once. The defaults are exported as `OCCASION_LOOKAHEAD_DAYS`,
  `LONG_WINDOW_DAYS` and `NEXT_SEARCH_DAYS`.
- `hebrewDate(date)`, `occasionWindows(key, { israel? })`, `toIsoDay(date)`.
- `createCalendar(asCalendarTable(json))` builds the same API over a table you load yourself (for
  example one fetched and cached by Live's service worker).
- Dates: a `"YYYY-MM-DD"` string is exact; a `Date` is read as the **local** calendar day (the
  visitor's day in a browser, UTC on Workers/CI). Outside the table range every function returns
  `null`. Hebrew days start at nightfall; this package works in whole civil days.

## Keys

Parsha keys and occasion keys are plain strings in the one occasion namespace of
`@emunas/normalize` (integration-plan §2.2): parsha keys such as `lech-lecha`, `ki-sisa`,
`vayakhel-pekudei`; occasion keys such as `rosh-hashanah`, `chanukah`, `zos-chanukah`,
`shabbos-chanukah`, `shovavim`, `parshas-shekalim`, `purim-katan`, `purim-meshulash`,
`lag-baomer`, `shavuos`, `bein-hametzarim`, `tishah-beav`, `elul`. This package does not import
normalize; a cross-package test (owned by whoever integrates the two) should assert that every key
in the table exists in normalize's tables. Catalog zmanim that are not calendar occasions
(one-off events, the `other` bucket) have no window here.

Window rules worth knowing: Tishah B'Av (and the end of the Nine Days / Bein HaMetzarim) moves to
Sunday when 9 Av is Shabbos; Shovavim runs from the Sunday of Shemos week to Shabbos Mishpatim
(Tetzaveh in a leap year); Adar means Adar II in a leap year; Purim Katan exists only in leap
years; Purim Meshulash only when 15 Adar is Shabbos; Chol HaMoed Pesach is 17–20 Nisan in the
diaspora and 16–20 in Israel.

## Regenerating

```sh
npm run generate --workspace=@emunas/calendar             # rewrite the table
npm run generate --workspace=@emunas/calendar -- --check  # fail if the committed table is stale
```

The output is deterministic (stable order, no timestamps; the hebcal version is recorded in
`source`). `test/table.test.ts` regenerates in memory and requires byte equality with the
committed file, and cross-checks the runtime against `@hebcal/core` on every day of the range
(Hebrew date and Shabbos parsha, diaspora and Israel). To extend the range past 5800, change
`TO_YEAR` in the generator and rename the table file and its imports.

## Licence note

`@hebcal/core` is **GPL-2.0-or-later**. It is a `devDependency` of this package and is imported
only by `scripts/generate.ts` (and by tests), which run in Node during development. Neither site
bundles or serves any hebcal code: the runtime entry depends on our own code and the generated
JSON table only, which is calendar data (dates and parsha names are facts, not hebcal's
expression). Owner decision O6 in integration-plan §6 accepts this with the default "Accept";
it is still flagged for confirmation. If it is ever rejected, the table can be maintained by hand
or generated with a differently licensed library without changing the runtime API.
