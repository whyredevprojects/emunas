/**
 * currentAndUpcoming(): the occasions both sites show for a day. Fixed dates are worked out by hand
 * (see this-week.test.ts for the calendar facts); the sweep checks the three rules on every day of
 * two years, against a brute-force reading of the table.
 */
import { describe, expect, it } from "vitest";
import {
  calendar,
  currentAndUpcoming,
  LONG_WINDOW_DAYS,
  OCCASION_LOOKAHEAD_DAYS,
  type CurrentAndUpcoming,
  type CurrentAndUpcomingOptions,
} from "../src/index.ts";

function cu(date: string, options: CurrentAndUpcomingOptions = {}): CurrentAndUpcoming {
  const r = currentAndUpcoming(date, options);
  if (!r) throw new Error(`no result for ${date}`);
  return r;
}

const keys = (hits: { key: string }[]) => hits.map((h) => h.key);
const shown = (r: CurrentAndUpcoming) => [...keys(r.current), ...keys(r.upcoming), ...(r.next ? [r.next.key] : []), ...keys(r.long)];
const only = (...ks: string[]) => (k: string) => ks.includes(k);

describe("currentAndUpcoming on fixed dates", () => {
  it("a gap of weeks still names the next occasion (2026-10-15: Chanukah, 51 days off)", () => {
    // Kislev (a month, long) starts 11 Nov and has shiurim, yet it never takes the only slot.
    const r = cu("2026-10-15", { has: only("chanukah", "kislev", "purim") });
    expect(r.current).toEqual([]);
    expect(r.upcoming).toEqual([]);
    expect(r.long).toEqual([]);
    expect(r.next).toMatchObject({ key: "chanukah", start: "2026-12-05", daysUntil: 51, active: false });
    // with every key, the first short occasion after Sukkos is Yud-Tes Kislev (29 Nov)
    expect(cu("2026-10-15").next).toMatchObject({ key: "yud-tes-kislev", daysUntil: 45 });
  });

  it("2027-03-17: Zachor, Purim, Shushan Purim and Parah are all upcoming; Adar is long", () => {
    // 1 Adar II 5787 = 10 Mar: Zachor Shabbos 20 Mar, Purim 23, Shushan Purim 24, Parah 27 Mar (day 10).
    const r = cu("2027-03-17");
    expect(keys(r.upcoming)).toEqual(["parshas-zachor", "purim", "shushan-purim", "parshas-parah"]);
    expect(r.upcoming.map((h) => h.daysUntil)).toEqual([3, 6, 7, 10]);
    expect(keys(r.long)).toEqual(["adar"]);
    expect(r.next).toBeNull();
  });

  it("a day of Pesach includes Shevi'i shel Pesach; Nisan and Sefirah are long", () => {
    const r = cu("2027-04-23");
    expect(keys(r.current)).toEqual(["pesach"]);
    expect(keys(r.upcoming)).toEqual(["chol-hamoed-pesach", "shevii-shel-pesach"]);
    expect(keys(r.long)).toEqual(["nisan", "sefirah"]);
    expect(r.long.every((h) => h.active && h.length > LONG_WINDOW_DAYS)).toBe(true);
  });

  it("9 to 19 Kislev 5787 include Yud-Tes Kislev", () => {
    // 9 Kislev = 19 Nov, 19 Kislev = 29 Nov
    for (let d = 19; d <= 29; d++) {
      const date = `2026-11-${d}`;
      const r = cu(date, { has: only("yud-tes-kislev", "chanukah", "kislev") });
      expect([...keys(r.current), ...keys(r.upcoming)], date).toContain("yud-tes-kislev");
      expect(keys(r.long), date).toEqual(["kislev"]);
    }
    expect(cu("2026-11-18", { has: only("yud-tes-kislev", "chanukah", "kislev") }).upcoming).toEqual([]);
  });

  it("a month window alone never takes the only slot", () => {
    // 5 Kislev with only Kislev and Chanukah: Kislev is in progress but long; Chanukah is next.
    const r = cu("2026-11-15", { has: only("kislev", "chanukah") });
    expect(keys(r.long)).toEqual(["kislev"]);
    expect(r.next).toMatchObject({ key: "chanukah", daysUntil: 20 });
    // with nothing short ahead at all, the next long window is the fallback
    const months = cu("2026-10-15", { has: only("kislev", "teves") });
    expect(months.next).toMatchObject({ key: "kislev", start: "2026-11-11" });
  });

  it("each key once: two Shabbosos of Chanukah give one row, the nearer", () => {
    const r = cu("2026-12-04");
    // by daysUntil, then shorter first: Shabbos Chanukah (1 day) before Chanukah (8 days)
    expect(keys(r.upcoming)).toEqual(["shabbos-chanukah", "chanukah", "zos-chanukah"]);
    expect(r.upcoming.find((h) => h.key === "shabbos-chanukah")).toMatchObject({ start: "2026-12-05" });
  });

  it("current windows come shortest first", () => {
    // 28 Apr 2027 = 21 Nisan, diaspora: Shevi'i shel Pesach (2 days) before Pesach (8)
    expect(keys(cu("2027-04-28").current)).toEqual(["shevii-shel-pesach", "pesach"]);
  });

  it("Israel: Pesach is seven days", () => {
    // 29 Apr 2027 is the 8th day in the diaspora only
    expect(keys(cu("2027-04-29").current)).toEqual(["shevii-shel-pesach", "pesach"]);
    const il = cu("2027-04-29", { israel: true });
    expect(il.current).toEqual([]);
    expect(il.next).toMatchObject({ key: "lag-baomer", daysUntil: 26 });
    expect(cu("2027-04-28", { israel: true }).current.find((h) => h.key === "pesach")).toMatchObject({ end: "2027-04-28", length: 7 });
  });

  it("never returns a key without shiurim, and null outside the table", () => {
    const r = cu("2027-03-17", { has: only("purim", "adar") });
    expect(shown(r)).toEqual(["purim", "adar"]);
    expect(currentAndUpcoming("2020-01-01")).toBeNull();
    expect(cu("2027-03-17", { has: () => false })).toEqual({ current: [], upcoming: [], next: null, long: [] });
  });
});

// ---------------------------------------------------------------------------------------------
// sweep

const DAY = 86_400_000;
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const diff = (a: string, b: string) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY);

/** Every window of the table for a mode, read straight from the rows. */
function windows(israel: boolean) {
  return calendar.table.occasions.map((r) => {
    const [start, end] = israel && r.length === 5 ? [r[3], r[4]] : [r[1], r[2]];
    return { key: r[0], start, end, length: diff(end, start) + 1 };
  });
}

describe("currentAndUpcoming over two whole years", () => {
  // the real-ish case (a subset of keys with shiurim) and every key
  const subsets: [string, (k: string) => boolean][] = [
    ["all keys", () => true],
    ["some keys", only("rosh-hashanah", "yom-kippur", "sukkos", "yud-tes-kislev", "chanukah", "kislev", "purim", "pesach", "shevii-shel-pesach", "sefirah", "lag-baomer", "shavuos", "bein-hametzarim", "tishah-beav", "elul")],
    ["one key", only("chanukah")],
  ];
  for (const israel of [false, true]) {
    for (const [name, has] of subsets) {
      it(`rules 1–3 hold every day (${israel ? "Israel" : "diaspora"}, ${name})`, () => {
        const all = windows(israel).filter((w) => has(w.key));
        let days = 0;
        for (let d = "2026-09-12"; d < "2028-09-20"; d = addDays(d, 1)) {
          const r = cu(d, { israel, has });
          const rows = new Set([...keys(r.current), ...keys(r.upcoming)]);
          const everything = new Set(shown(r));
          for (const w of all) {
            const short = w.length <= LONG_WINDOW_DAYS;
            const active = w.start <= d && d <= w.end;
            const until = diff(w.start, d);
            // 1. every short active window is a current row
            if (short && active) expect(keys(r.current), `${d} ${w.key} active`).toContain(w.key);
            // 2. every short window starting within the lookahead is a row
            if (short && until > 0 && until <= OCCASION_LOOKAHEAD_DAYS) expect(rows.has(w.key), `${d} ${w.key} +${until}`).toBe(true);
            // long windows in progress or starting soon are listed as long
            if (!short && (active || (until > 0 && until <= OCCASION_LOOKAHEAD_DAYS))) expect(keys(r.long), `${d} ${w.key} long`).toContain(w.key);
          }
          // 3. never empty while anything with shiurim lies ahead: the next short window, if any
          const ahead = all.filter((w) => w.start > d && w.start <= addDays(d, 400));
          if (ahead.length > 0) expect(everything.size, `${d} empty`).toBeGreaterThan(0);
          if (rows.size === 0) {
            const firstShort = ahead.filter((w) => w.length <= LONG_WINDOW_DAYS).sort((a, b) => (a.start < b.start ? -1 : 1))[0];
            if (firstShort) expect(r.next, `${d} next`).toMatchObject({ start: firstShort.start, daysUntil: diff(firstShort.start, d) });
          } else {
            expect(r.next).toBeNull();
          }
          // no long window takes a row, and no key twice
          for (const h of [...r.current, ...r.upcoming]) expect(h.length).toBeLessThanOrEqual(LONG_WINDOW_DAYS);
          expect(new Set(shown(r)).size).toBe(shown(r).length);
          days++;
        }
        expect(days).toBeGreaterThan(700);
      });
    }
  }
});
