/**
 * Build-time generator for the committed calendar table (integration-plan C16).
 *
 *   npm run generate --workspace=@emunas/calendar          # rewrite table/5787-5800.json
 *   npm run generate --workspace=@emunas/calendar -- --check   # exit 1 if the file is stale
 *
 * This is the ONLY file in the package that imports @hebcal/core (GPL-2.0-or-later). It runs in
 * Node at development time and writes plain data; no hebcal code is bundled into either site.
 * The output is deterministic: no timestamps, stable ordering, one row per line.
 *
 * Occasion keys are plain strings that must match the occasion keys of @emunas/normalize
 * (`occasions.ts`); parsha keys must match its parsha keys. The calendar package deliberately does
 * not import normalize; a cross-package test checks the two agree.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HDate, HebrewCalendar, Sedra, flags, months, parshiot, version as hebcalVersion } from "@hebcal/core";
import type { CalendarTable, MonthRow, OccasionRow, ShabbosRow } from "../src/table.ts";

export const FROM_YEAR = 5787;
export const TO_YEAR = 5800;

export const TABLE_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "table", `${FROM_YEAR}-${TO_YEAR}.json`);

/** Our parsha keys in hebcal's `parshiot` order (index 0 Bereshit … 53 Vezot Haberakhah).
 * Hebcal's result is matched by name and by number, so a reordering upstream fails loudly. */
export const PARSHA_KEYS: readonly string[] = [
  "bereishis", "noach", "lech-lecha", "vayeira", "chayei-sarah", "toldos", "vayeitzei", "vayishlach",
  "vayeishev", "mikeitz", "vayigash", "vayechi",
  "shemos", "vaeira", "bo", "beshalach", "yisro", "mishpatim", "terumah", "tetzaveh", "ki-sisa",
  "vayakhel", "pekudei",
  "vayikra", "tzav", "shemini", "tazria", "metzora", "acharei-mos", "kedoshim", "emor", "behar",
  "bechukosai",
  "bamidbar", "nasso", "behaaloscha", "shelach", "korach", "chukas", "balak", "pinchas", "matos",
  "masei",
  "devarim", "vaeschanan", "eikev", "reeh", "shoftim", "ki-seitzei", "ki-savo", "nitzavim",
  "vayeilech", "haazinu", "vezos-haberachah",
];

/** Special Shabbosos taken from hebcal's SPECIAL_SHABBAT events: hebcal description → our key. */
const SPECIAL_SHABBOS: Readonly<Record<string, string>> = {
  "Shabbat Shuva": "shabbos-shuvah",
  "Shabbat Shirah": "shabbos-shirah",
  "Shabbat Shekalim": "parshas-shekalim",
  "Shabbat Zachor": "parshas-zachor",
  "Shabbat Parah": "parshas-parah",
  "Shabbat HaChodesh": "parshas-hachodesh",
  "Shabbat Chazon": "shabbos-chazon",
  "Shabbat Nachamu": "shabbos-nachamu",
};

// ---------------------------------------------------------------------------------------------
// civil days

const UNIX_EPOCH_RD = 719163; // R.D. (hebcal `abs()`) of 1970-01-01

function isoOf(hd: HDate): string {
  return new Date((hd.abs() - UNIX_EPOCH_RD) * 86_400_000).toISOString().slice(0, 10);
}

function hd(day: number, month: number, year: number): HDate {
  return new HDate(day, month, year);
}

function addDays(h: HDate, n: number): HDate {
  return new HDate(h.abs() + n);
}

// ---------------------------------------------------------------------------------------------
// parsha

/** Map hebcal's result to our key, by name and by number (1-based), and insist they agree. */
function parshaKeyOf(names: readonly string[], num: number | number[]): string {
  const nums = Array.isArray(num) ? num : [num];
  if (names.length !== nums.length) throw new Error(`generate: parsha ${names.join("-")} / ${nums.join(",")}`);
  return names
    .map((name, i) => {
      const idx = parshiot.indexOf(name);
      const k = PARSHA_KEYS[idx];
      if (idx < 0 || idx !== (nums[i] ?? 0) - 1 || k === undefined) throw new Error(`generate: unknown parsha ${name} (${nums[i]})`);
      return k;
    })
    .join("-");
}

function shabbosParsha(sedra: Sedra, h: HDate): string | null {
  const r = sedra.lookup(h);
  if (r.hdate.abs() !== h.abs()) throw new Error(`generate: sedra lookup returned another day for ${isoOf(h)}`);
  if (r.chag) return null;
  return parshaKeyOf(r.parsha, r.num);
}

// ---------------------------------------------------------------------------------------------
// occasions

interface Window {
  key: string;
  start: HDate;
  end: HDate;
}

type ModeWindows = { diaspora: Window[]; israel: Window[] };

function span(key: string, start: HDate, days: number): Window {
  return { key, start, end: addDays(start, days - 1) };
}

function month(key: string, m: number, year: number): Window {
  const start = hd(1, m, year);
  return { key, start, end: hd(HDate.daysInMonth(m, year), m, year) };
}

/** Occasions of one Hebrew year (1 Tishrei … 29 Elul) for one mode. */
function occasionsOfYear(year: number, il: boolean): Window[] {
  const leap = HDate.isLeapYear(year);
  const adar = leap ? months.ADAR_II : months.ADAR_I; // hebcal: ADAR_I (12) is plain Adar in a common year
  const out: Window[] = [];

  // Elul and the Yamim Noraim
  out.push(span("rosh-hashanah", hd(1, months.TISHREI, year), 2));
  out.push(span("aseres-yemei-teshuvah", hd(1, months.TISHREI, year), 10));
  out.push(span("yom-kippur", hd(10, months.TISHREI, year), 1));
  out.push(span("sukkos", hd(15, months.TISHREI, year), 7));
  out.push(span("hoshana-rabbah", hd(21, months.TISHREI, year), 1));
  out.push(span("shemini-atzeres", hd(22, months.TISHREI, year), il ? 1 : 2));

  // winter
  out.push(month("kislev", months.KISLEV, year));
  out.push(span("yud-tes-kislev", hd(19, months.KISLEV, year), 1));
  const chanukah = span("chanukah", hd(25, months.KISLEV, year), 8);
  out.push(chanukah);
  for (let a = chanukah.start.abs(); a <= chanukah.end.abs(); a++) {
    const day = new HDate(a);
    if (day.getDay() === 6) out.push(span("shabbos-chanukah", day, 1));
  }
  out.push(span("zos-chanukah", addDays(chanukah.start, 7), 1));
  out.push(month("teves", months.TEVET, year));
  out.push(span("tu-bishvat", hd(15, months.SHVAT, year), 1));

  // Shovavim: the weeks of Shemos … Mishpatim (Tetzaveh in a leap year), Sunday to Shabbos
  const sedra = new Sedra(year, il);
  const shemos = sedra.find(PARSHA_KEYS.indexOf("shemos"));
  const last = sedra.find(PARSHA_KEYS.indexOf(leap ? "tetzaveh" : "mishpatim"));
  if (!shemos || !last) throw new Error(`generate: Shovavim parshiyos not found in ${year}`);
  out.push({ key: "shovavim", start: addDays(shemos, -6), end: last });

  // Adar
  out.push(month("adar", adar, year));
  if (leap) out.push(span("purim-katan", hd(14, months.ADAR_I, year), 1));
  out.push(span("purim", hd(14, adar, year), 1));
  out.push(span("shushan-purim", hd(15, adar, year), 1));
  if (hd(15, adar, year).getDay() === 6) out.push(span("purim-meshulash", hd(14, adar, year), 3));

  // Nisan to Sivan
  out.push(month("nisan", months.NISAN, year));
  out.push(span("rosh-chodesh-nisan", hd(1, months.NISAN, year), 1));
  out.push(span("erev-pesach", hd(14, months.NISAN, year), 1));
  out.push(span("pesach", hd(15, months.NISAN, year), il ? 7 : 8));
  out.push(il ? span("chol-hamoed-pesach", hd(16, months.NISAN, year), 5) : span("chol-hamoed-pesach", hd(17, months.NISAN, year), 4));
  out.push(span("shevii-shel-pesach", hd(21, months.NISAN, year), il ? 1 : 2));
  out.push(span("sefirah", hd(16, months.NISAN, year), 49));
  out.push(month("iyar", months.IYYAR, year));
  out.push(span("lag-baomer", hd(18, months.IYYAR, year), 1));
  out.push(month("sivan", months.SIVAN, year));
  out.push(span("rosh-chodesh-sivan", hd(1, months.SIVAN, year), 1));
  out.push(span("shavuos", hd(6, months.SIVAN, year), il ? 1 : 2));

  // summer
  out.push(month("tamuz", months.TAMUZ, year));
  out.push(span("yahrzeit-ohr-hachaim", hd(15, months.TAMUZ, year), 1));
  const nineAv = hd(9, months.AV, year);
  const tishahBeav = nineAv.getDay() === 6 ? addDays(nineAv, 1) : nineAv; // nidcheh to Sunday
  out.push({ key: "bein-hametzarim", start: hd(17, months.TAMUZ, year), end: tishahBeav });
  out.push({ key: "nine-days", start: hd(1, months.AV, year), end: tishahBeav });
  out.push(span("tishah-beav", tishahBeav, 1));
  out.push(span("tu-beav", hd(15, months.AV, year), 1));
  out.push(month("elul", months.ELUL, year));

  // special Shabbosos (Shuvah, Shirah, the four parshiyos, Chazon, Nachamu)
  for (const ev of HebrewCalendar.getHolidaysForYearArray(year, il)) {
    if (!(ev.getFlags() & flags.SPECIAL_SHABBAT)) continue;
    const key = SPECIAL_SHABBOS[ev.getDesc()];
    if (key === undefined) continue; // e.g. Shabbat HaGadol: not a catalog occasion
    out.push(span(key, ev.getDate(), 1));
  }
  return out;
}

function windowsOfYear(year: number): ModeWindows {
  return { diaspora: occasionsOfYear(year, false), israel: occasionsOfYear(year, true) };
}

// ---------------------------------------------------------------------------------------------
// the table

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function buildTable(): CalendarTable {
  const first = hd(1, months.TISHREI, FROM_YEAR);
  const lastDay = hd(HDate.daysInMonth(months.ELUL, TO_YEAR), months.ELUL, TO_YEAR);

  // months, in calendar order (Tishrei … Elul of each year)
  const monthRows: MonthRow[] = [];
  for (let y = FROM_YEAR; y <= TO_YEAR; y++) {
    const count = HDate.monthsInYear(y);
    const order = [7, 8, 9, 10, 11, 12, ...(count === 13 ? [13] : []), 1, 2, 3, 4, 5, 6];
    for (const m of order) monthRows.push([isoOf(hd(1, m, y)), y, m]);
  }

  // every Shabbos in range
  const shabbosRows: ShabbosRow[] = [];
  const sedras = new Map<string, Sedra>();
  const sedraFor = (y: number, il: boolean): Sedra => {
    const k = `${y}:${il}`;
    let s = sedras.get(k);
    if (!s) {
      s = new Sedra(y, il);
      sedras.set(k, s);
    }
    return s;
  };
  let sat = first.onOrAfter(6);
  while (sat.abs() <= lastDay.abs()) {
    const y = sat.getFullYear();
    shabbosRows.push([isoOf(sat), shabbosParsha(sedraFor(y, false), sat), shabbosParsha(sedraFor(y, true), sat)]);
    sat = addDays(sat, 7);
  }

  // occasions: pair each diaspora window with its Israel counterpart (same key, same order)
  const occasionRows: OccasionRow[] = [];
  for (let y = FROM_YEAR; y <= TO_YEAR; y++) {
    const { diaspora, israel } = windowsOfYear(y);
    const israelByKey = new Map<string, Window[]>();
    for (const w of israel) israelByKey.set(w.key, [...(israelByKey.get(w.key) ?? []), w]);
    const seen = new Map<string, number>();
    for (const w of diaspora) {
      const i = seen.get(w.key) ?? 0;
      seen.set(w.key, i + 1);
      const il = israelByKey.get(w.key)?.[i];
      if (!il) throw new Error(`generate: ${w.key} ${y} has no Israel counterpart`);
      const d0 = isoOf(w.start);
      const d1 = isoOf(w.end);
      const i0 = isoOf(il.start);
      const i1 = isoOf(il.end);
      occasionRows.push(d0 === i0 && d1 === i1 ? [w.key, d0, d1] : [w.key, d0, d1, i0, i1]);
    }
    for (const [key, list] of israelByKey) {
      if (list.length !== (seen.get(key) ?? 0)) throw new Error(`generate: ${key} ${y} differs in count between diaspora and Israel`);
    }
  }
  occasionRows.sort((a, b) => compare(a[1], b[1]) || compare(a[0], b[0]) || compare(a[2], b[2]));

  const combined: Record<string, readonly [string, string]> = {};
  for (const [, d, i] of shabbosRows) {
    for (const key of [d, i]) {
      if (key === null || PARSHA_KEYS.includes(key)) continue;
      const parts = PARSHA_KEYS.filter((p) => key.startsWith(`${p}-`) && PARSHA_KEYS.includes(key.slice(p.length + 1)));
      const a = parts[0];
      if (parts.length !== 1 || a === undefined) throw new Error(`generate: cannot split combined parsha ${key}`);
      combined[key] = [a, key.slice(a.length + 1)];
    }
  }
  const combinedSorted: Record<string, readonly [string, string]> = {};
  for (const k of Object.keys(combined).sort(compare)) {
    const v = combined[k];
    if (v) combinedSorted[k] = v;
  }

  return {
    schema: 1,
    source: `generated by packages/calendar/scripts/generate.ts with @hebcal/core ${hebcalVersion} (GPL-2.0-or-later) at build time; data only, no hebcal code ships`,
    fromYear: FROM_YEAR,
    toYear: TO_YEAR,
    start: isoOf(first),
    end: isoOf(lastDay),
    combined: combinedSorted,
    months: monthRows,
    shabbosos: shabbosRows,
    occasions: occasionRows,
  };
}

/** Stable, diff-friendly JSON: one row per line. */
export function serialize(t: CalendarTable): string {
  const row = (r: unknown) => `    ${JSON.stringify(r)}`;
  const list = (name: string, rows: readonly unknown[]) => `  ${JSON.stringify(name)}: [\n${rows.map(row).join(",\n")}\n  ]`;
  const combined = Object.entries(t.combined).map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)}`);
  return [
    "{",
    `  "schema": ${t.schema},`,
    `  "source": ${JSON.stringify(t.source)},`,
    `  "fromYear": ${t.fromYear},`,
    `  "toYear": ${t.toYear},`,
    `  "start": ${JSON.stringify(t.start)},`,
    `  "end": ${JSON.stringify(t.end)},`,
    `  "combined": {\n${combined.join(",\n")}\n  },`,
    `${list("months", t.months)},`,
    `${list("shabbosos", t.shabbosos)},`,
    list("occasions", t.occasions),
    "}",
    "",
  ].join("\n");
}

function main(): void {
  const text = serialize(buildTable());
  if (process.argv.includes("--check")) {
    let current = "";
    try {
      current = readFileSync(TABLE_PATH, "utf8");
    } catch {
      // missing file is stale
    }
    if (current !== text) {
      console.error(`${TABLE_PATH} is stale; run: npm run generate --workspace=@emunas/calendar`);
      process.exit(1);
    }
    console.log(`${TABLE_PATH} is up to date`);
    return;
  }
  writeFileSync(TABLE_PATH, text);
  console.log(`wrote ${TABLE_PATH}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
