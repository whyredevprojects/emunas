/**
 * The committed table is regenerable byte-for-byte, and the runtime agrees with @hebcal/core on
 * every day of the range. (Tests may import hebcal; the runtime entry may not, see bundle.test.ts.)
 */
import { readFileSync } from "node:fs";
import { HDate, Sedra, parshiot } from "@hebcal/core";
import { describe, expect, it } from "vitest";
import { PARSHA_KEYS, TABLE_PATH, buildTable, serialize } from "../scripts/generate.ts";
import { asCalendarTable, calendar, createCalendar } from "../src/index.ts";

const UNIX_EPOCH_RD = 719163;
const isoOfAbs = (abs: number) => new Date((abs - UNIX_EPOCH_RD) * 86_400_000).toISOString().slice(0, 10);

describe("generated table", () => {
  it("is committed and identical to a fresh generation (deterministic)", () => {
    const committed = readFileSync(TABLE_PATH, "utf8");
    const a = serialize(buildTable());
    const b = serialize(buildTable());
    expect(a).toBe(b);
    expect(committed).toBe(a);
  });

  it("is valid JSON of the expected shape and size", () => {
    const committed = readFileSync(TABLE_PATH, "utf8");
    const t = asCalendarTable(JSON.parse(committed));
    expect(t.fromYear).toBe(5787);
    expect(t.toYear).toBe(5800);
    expect(t.months).toHaveLength(14 * 12 + 5); // 5787, 5790, 5793, 5795, 5798 are leap years
    expect(t.months.filter((m) => m[2] === 13).map((m) => m[1])).toEqual([5787, 5790, 5793, 5795, 5798]);
    expect(committed.length).toBeLessThan(80_000);
  });

  it("has only Saturdays in shabbosos, every week, and only known parsha keys", () => {
    const t = calendar.table;
    const known = new Set([...PARSHA_KEYS, ...Object.keys(t.combined)]);
    let prev: number | null = null;
    for (const [d, dia, il] of t.shabbosos) {
      const ms = Date.parse(`${d}T00:00:00Z`);
      expect(new Date(ms).getUTCDay()).toBe(6);
      if (prev !== null) expect(ms - prev).toBe(7 * 86_400_000);
      prev = ms;
      for (const k of [dia, il]) if (k !== null) expect(known.has(k), k).toBe(true);
    }
    expect(Object.keys(t.combined).sort()).toEqual([
      "acharei-mos-kedoshim",
      "behar-bechukosai",
      "chukas-balak",
      "matos-masei",
      "nitzavim-vayeilech",
      "tazria-metzora",
      "vayakhel-pekudei",
    ]);
  });

  it("has every occasion each year, windows ordered and well-formed", () => {
    const t = calendar.table;
    const perYear = new Map<string, Set<number>>();
    for (const row of t.occasions) {
      const [key, s, e] = row;
      expect(s <= e).toBe(true);
      if (row.length === 5) expect(row[3] <= row[4]).toBe(true);
      const y = calendar.hebrewDate(s)?.year;
      expect(y).toBeDefined();
      if (y !== undefined) perYear.set(key, (perYear.get(key) ?? new Set()).add(y));
    }
    const sorted = [...t.occasions].sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    expect(t.occasions.map((r) => r[0] + r[1])).toEqual(sorted.map((r) => r[0] + r[1]));
    const sometimes = new Set(["purim-katan", "purim-meshulash"]);
    for (const [key, years] of perYear) {
      if (sometimes.has(key)) continue;
      expect(years.size, key).toBe(14);
    }
    // Purim Katan only in the five leap years
    expect(perYear.get("purim-katan")?.size).toBe(5);
    // Israel-only differences are confined to Yom Tov lengths
    const diverging = new Set(t.occasions.filter((r) => r.length === 5).map((r) => r[0]));
    expect([...diverging].sort()).toEqual(["chol-hamoed-pesach", "pesach", "shavuos", "shemini-atzeres", "shevii-shel-pesach"]);
  });

  it("asCalendarTable rejects a broken table", () => {
    expect(() => asCalendarTable(null)).toThrow();
    expect(() => asCalendarTable({ ...calendar.table, schema: 2 })).toThrow(/schema/);
    expect(() => asCalendarTable({ ...calendar.table, shabbosos: [["2026-09-12", null]] })).toThrow(/shabbos row/);
  });
});

describe("runtime agrees with @hebcal/core on every day of the range", () => {
  const first = new HDate(1, 7, 5787).abs();
  const last = new HDate(29, 6, 5800).abs();
  const sedras = new Map<string, Sedra>();
  const sedra = (y: number, il: boolean) => {
    const k = `${y}${il}`;
    let s = sedras.get(k);
    if (!s) sedras.set(k, (s = new Sedra(y, il)));
    return s;
  };
  const keyOf = (names: string[]) => names.map((n) => PARSHA_KEYS[parshiot.indexOf(n)] ?? `?${n}`).join("-");

  it("hebrewDate matches HDate for every day", () => {
    const cal = createCalendar(calendar.table);
    for (let abs = first; abs <= last; abs++) {
      const h = new HDate(abs);
      const ours = cal.hebrewDate(isoOfAbs(abs));
      expect(ours?.year).toBe(h.getFullYear());
      expect(ours?.month).toBe(h.getMonth());
      expect(ours?.day).toBe(h.getDate());
    }
  });

  it("the Shabbos parsha matches Sedra.lookup for every day, diaspora and Israel", () => {
    let checked = 0;
    for (let abs = first; abs <= last; abs++) {
      const iso = isoOfAbs(abs);
      for (const il of [false, true]) {
        const h = new HDate(abs);
        const r = sedra(h.getFullYear(), il).lookup(h);
        const w = calendar.thisWeek(iso, { israel: il });
        if (!w) throw new Error(`no week ${iso}`);
        if (r.hdate.abs() > last) continue; // Shabbos after the table's end
        expect(w.shabbos.date).toBe(isoOfAbs(r.hdate.abs()));
        const expected = r.chag ? null : keyOf(r.parsha);
        expect(w.shabbos.parshaKey, `${iso} il=${il}`).toBe(expected);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(10_000);
  });
});
