/**
 * W3.8 acceptance: the correct parsha and occasions on 10 fixed dates (diaspora and Israel), the
 * moment of the day is stable per date, and Continue / newly-summarized behave.
 *
 * The expected keys are the hand-worked dates of @emunas/calendar's own tests; here they check the
 * join from calendar keys to `today.json`, the ordering of rows, combined parshiyos and the moment
 * pool priority.
 */
import { describe, expect, it } from "vitest";
import {
  buildToday,
  continueItems,
  dateFromQuery,
  localIsoDay,
  MAX_OCCASIONS,
  momentOfTheDay,
  rowsById,
  type TodayView,
} from "../model.ts";
import { fnv1a, pickForDay } from "../pick.ts";
import { loadContinueRows } from "../continue.ts";
import type { ShiurFile } from "../live-data.ts";
import { row, todayData } from "./helpers.ts";

const KEYS = [
  // parshiyos
  "haazinu", "vayeitzei", "mikeitz", "vayakhel", "pekudei", "ki-sisa", "bechukosai", "nasso",
  "behaaloscha", "chukas", "balak", "shemini",
  // occasions
  "rosh-hashanah", "aseres-yemei-teshuvah", "yom-kippur", "yud-tes-kislev", "chanukah", "zos-chanukah",
  "parshas-shekalim", "purim", "shushan-purim", "lag-baomer", "shavuos", "pesach", "shevii-shel-pesach",
];

const { today } = todayData(KEYS);

function view(date: string, israel = false, audio: "both" | "yi" | "en" = "both"): TodayView {
  return buildToday({ date, israel, audio, today });
}

const ids = (rows: { id: string }[]) => rows.map((r) => r.id);
const occ = (v: TodayView) => v.occasions.map((o) => o.key);

interface Case {
  name: string;
  date: string;
  israel?: boolean;
  parsha: string;
  parshaShiurim: string[];
  deferred: boolean;
  /** Occasion rows, in display order (active shortest first, then by start). */
  occasions: string[];
  /** Key whose pool the moment of the day comes from. */
  momentFrom: string;
}

const CASES: Case[] = [
  {
    name: "1. Rosh Hashanah on Shabbos: Haazinu is next week's, RH first",
    date: "2026-09-12",
    parsha: "haazinu",
    parshaShiurim: ["en-haazinu", "yi-haazinu"],
    deferred: true,
    occasions: ["rosh-hashanah", "aseres-yemei-teshuvah", "yom-kippur"],
    momentFrom: "rosh-hashanah",
  },
  {
    name: "2. ordinary Kislev week: Vayeitzei; Yud-Tes Kislev is beyond the lookahead",
    date: "2026-11-15",
    parsha: "vayeitzei",
    parshaShiurim: ["en-vayeitzei", "yi-vayeitzei"],
    deferred: false,
    occasions: [],
    momentFrom: "vayeitzei",
  },
  {
    name: "3. Chanukah: Mikeitz, Chanukah active, Zos Chanukah ahead",
    date: "2026-12-08",
    parsha: "mikeitz",
    parshaShiurim: ["en-mikeitz", "yi-mikeitz"],
    deferred: false,
    occasions: ["chanukah", "zos-chanukah"],
    momentFrom: "chanukah",
  },
  {
    name: "4. leap-year Adar I: Vayakhel alone (no Pekudei shiurim), Shekalim ahead",
    date: "2027-03-01",
    parsha: "vayakhel",
    parshaShiurim: ["en-vayakhel", "yi-vayakhel"],
    deferred: false,
    occasions: ["parshas-shekalim"],
    momentFrom: "vayakhel",
  },
  {
    name: "5. combined Vayakhel-Pekudei lists shiurim of both parts, by year",
    date: "2028-03-20",
    parsha: "vayakhel-pekudei",
    parshaShiurim: ["en-vayakhel", "en-pekudei", "yi-vayakhel", "yi-pekudei"],
    deferred: false,
    occasions: [],
    momentFrom: "vayakhel-pekudei",
  },
  {
    name: "6. Purim (common year): Purim active, Shushan Purim next, Ki Sisa",
    date: "2028-03-12",
    parsha: "ki-sisa",
    parshaShiurim: ["en-ki-sisa", "yi-ki-sisa"],
    deferred: false,
    occasions: ["purim", "shushan-purim"],
    momentFrom: "purim",
  },
  {
    name: "7. Lag BaOmer active; Bechukosai (leap year)",
    date: "2027-05-25",
    parsha: "bechukosai",
    parshaShiurim: ["en-bechukosai", "yi-bechukosai"],
    deferred: false,
    occasions: ["lag-baomer"],
    momentFrom: "lag-baomer",
  },
  {
    name: "8a. Shavuos on Friday–Shabbos, diaspora: Nasso deferred a week",
    date: "2027-06-10",
    parsha: "nasso",
    parshaShiurim: ["en-nasso", "yi-nasso"],
    deferred: true,
    occasions: ["shavuos"],
    momentFrom: "nasso",
  },
  {
    name: "8b. same day in Israel: Nasso read this Shabbos",
    date: "2027-06-10",
    israel: true,
    parsha: "nasso",
    parshaShiurim: ["en-nasso", "yi-nasso"],
    deferred: false,
    occasions: ["shavuos"],
    momentFrom: "nasso",
  },
  {
    name: "8c. the Monday after, Israel is a parsha ahead (Behaaloscha)",
    date: "2027-06-14",
    israel: true,
    parsha: "behaaloscha",
    parshaShiurim: ["en-behaaloscha", "yi-behaaloscha"],
    deferred: false,
    occasions: [],
    momentFrom: "behaaloscha",
  },
  {
    name: "9a. diaspora Chukas-Balak lists both parts",
    date: "2027-07-14",
    parsha: "chukas-balak",
    parshaShiurim: ["en-chukas", "en-balak", "yi-chukas", "yi-balak"],
    deferred: false,
    occasions: [],
    momentFrom: "chukas-balak",
  },
  {
    name: "9b. Israel reads Balak alone",
    date: "2027-07-14",
    israel: true,
    parsha: "balak",
    parshaShiurim: ["en-balak", "yi-balak"],
    deferred: false,
    occasions: [],
    momentFrom: "balak",
  },
  {
    name: "10a. Acharon shel Pesach on Shabbos, diaspora: Shemini deferred, Pesach days active",
    date: "2029-04-07",
    parsha: "shemini",
    parshaShiurim: ["en-shemini", "yi-shemini"],
    deferred: true,
    occasions: ["shevii-shel-pesach", "pesach"],
    momentFrom: "shevii-shel-pesach",
  },
  {
    name: "10b. same Shabbos in Israel: Shemini read, Pesach over",
    date: "2029-04-07",
    israel: true,
    parsha: "shemini",
    parshaShiurim: ["en-shemini", "yi-shemini"],
    deferred: false,
    occasions: [],
    momentFrom: "shemini",
  },
];

describe("Today on fixed dates", () => {
  for (const c of CASES) {
    it(c.name, () => {
      const v = view(c.date, c.israel ?? false);
      expect(v.parsha?.key).toBe(c.parsha);
      expect(v.parsha?.deferred).toBe(c.deferred);
      expect(ids(v.parsha?.shiurim ?? [])).toEqual(c.parshaShiurim);
      expect(occ(v)).toEqual(c.occasions);
      expect(v.moment?.occasionKey).toBe(c.momentFrom);
      // the moment belongs to one of the shiurim of its occasion (combined: of either part)
      const pool = c.momentFrom.split("-").length > 1 && v.parsha?.key === c.momentFrom ? v.parsha.keys : [c.momentFrom];
      expect(pool.some((k) => today.occasions[k]?.shiurIds.includes(v.moment!.shiurId))).toBe(true);
    });
  }

  it("shows the Hebrew date and nothing for this week outside the table", () => {
    expect(view("2026-11-15").hebrewDate).toMatchObject({ year: 5787, day: 5, monthName: "Kislev" });
    const out = view("2020-01-01");
    expect(out.week).toBeNull();
    expect(out.parsha).toBeNull();
    expect(out.occasions).toEqual([]);
    // still a moment (from all pools), so the page is never empty
    expect(out.moment).not.toBeNull();
    expect(out.moment?.occasionKey).toBeNull();
  });

  it("caps occasion rows", () => {
    expect(MAX_OCCASIONS).toBeGreaterThan(0);
    for (const c of CASES) expect(view(c.date).occasions.length).toBeLessThanOrEqual(MAX_OCCASIONS);
  });

  it("filters rows and the moment by the audio language", () => {
    const en = view("2026-12-08", false, "en");
    expect(ids(en.parsha!.shiurim)).toEqual(["en-mikeitz"]);
    for (const o of en.occasions) expect(o.shiurim.every((r) => r.lang === "en")).toBe(true);
    expect(en.moment?.shiurId.startsWith("en-")).toBe(true);
    const yi = view("2026-12-08", false, "yi");
    expect(yi.moment?.shiurId.startsWith("yi-")).toBe(true);
  });

  it("hides occasions that have no shiurim", () => {
    // Kislev and Shabbos Chanukah are active/upcoming but have no shiurim in this data
    const v = view("2026-12-08");
    expect(v.week?.upcomingOccasions.map((o) => o.key)).toEqual(expect.arrayContaining(["shabbos-chanukah"]));
    expect(occ(v)).not.toContain("shabbos-chanukah");
  });
});

describe("moment of the day", () => {
  it("is stable per date: same date, same moment, whatever the pool order", () => {
    const a = view("2026-12-08").moment;
    const b = view("2026-12-08").moment;
    expect(a).toEqual(b);
    const shuffled = structuredClone(today);
    for (const o of Object.values(shuffled.occasions)) o.moments.reverse();
    const c = buildToday({ date: "2026-12-08", israel: false, audio: "both", today: shuffled }).moment;
    expect(c).toEqual(a);
  });

  it("is stable across a whole week of reloads and varies across days", () => {
    const seen = new Set<string>();
    for (let d = 1; d <= 28; d++) {
      const date = `2027-01-${String(d).padStart(2, "0")}`;
      const first = view(date).moment!.id;
      for (let i = 0; i < 3; i++) expect(view(date).moment!.id).toBe(first);
      seen.add(first);
    }
    expect(seen.size).toBeGreaterThan(3);
  });

  it("skips moments without a time and falls back through the priority list", () => {
    const byId = rowsById(today);
    const noTimes = structuredClone(today);
    // A pool whose moments have no time is skipped like an empty one.
    for (const m of noTimes.occasions["chanukah"]!.moments) (m as { t: number | null }).t = null;
    const m = momentOfTheDay("2026-12-08", [["chanukah"], ["mikeitz"]], noTimes, byId, "both");
    expect(m?.occasionKey).toBe("mikeitz");
    expect(m?.t).not.toBeNull();
  });

  it("is null when there is nothing to pick", () => {
    const empty = { ...today, occasions: {} };
    expect(momentOfTheDay("2026-12-08", [["chanukah"]], empty, rowsById(today), "both")).toBeNull();
  });

  it("pickForDay and fnv1a are deterministic", () => {
    expect(fnv1a("")).toBe(0x811c9dc5);
    expect(fnv1a("a")).toBe(0xe40c292c);
    expect(pickForDay([], "x", String)).toBeNull();
    expect(pickForDay(["b", "a", "c"], "seed", String)).toBe(pickForDay(["c", "b", "a"], "seed", String));
  });
});

describe("newly summarized and counter", () => {
  it("lists full shiurim newest first, filtered and capped, and hides once complete", () => {
    const t = structuredClone(today);
    t.newlySummarized = [
      { shiurId: "yi-purim", updatedAt: "2026-11-14T00:00:00Z" },
      { shiurId: "en-purim", updatedAt: "2026-11-13T00:00:00Z" },
      { shiurId: "missing", updatedAt: "2026-11-12T00:00:00Z" },
    ];
    const v = buildToday({ date: "2026-11-15", israel: false, audio: "yi", today: t });
    expect(v.newly.map((n) => n.row.id)).toEqual(["yi-purim"]);
    expect(v.stillArriving).toBe(true);
    expect(v.counts).toEqual(today.counts);
    const complete = { ...t, counts: { total: 5, full: 5, catalogOnly: 0, downgraded: 0 } };
    expect(buildToday({ date: "2026-11-15", israel: false, audio: "both", today: complete }).stillArriving).toBe(false);
  });
});

describe("continue", () => {
  const series = [1, 2, 3, 4].map((n) =>
    row(`yi-tanya-${n}`, { series: { id: "tanya-yi", order: n }, next: n < 4 ? `yi-tanya-${n + 1}` : null }),
  );
  const rows = new Map([...series, row("en-other"), row("yi-noach")].map((r) => [r.id, r]));

  it("is empty with the stub store", () => {
    expect(continueItems([], rows, "both")).toEqual([]);
  });

  it("resumes unfinished shiurim (newest first), then the next part of a series in progress", () => {
    const items = continueItems(
      [
        { shiurId: "en-other", t: 50, completed: false, updatedAt: "2026-11-10T00:00:00Z" },
        { shiurId: "yi-tanya-1", t: 3600, completed: true, updatedAt: "2026-11-11T00:00:00Z" },
        { shiurId: "yi-tanya-2", t: 3600, completed: true, updatedAt: "2026-11-12T00:00:00Z" },
        { shiurId: "yi-noach", t: 10, completed: false, updatedAt: "2026-11-13T00:00:00Z" },
      ],
      rows,
      "both",
    );
    expect(items.map((i) => [i.kind, i.row.id])).toEqual([
      ["resume", "yi-noach"],
      ["resume", "en-other"],
      ["next", "yi-tanya-3"],
    ]);
  });

  it("does not repeat a part already being resumed and respects the audio filter", () => {
    const items = continueItems(
      [
        { shiurId: "yi-tanya-1", t: 3600, completed: true, updatedAt: "2026-11-11T00:00:00Z" },
        { shiurId: "yi-tanya-2", t: 30, completed: false, updatedAt: "2026-11-12T00:00:00Z" },
      ],
      rows,
      "both",
    );
    expect(items.map((i) => [i.kind, i.row.id])).toEqual([
      ["resume", "yi-tanya-2"],
      ["next", "yi-tanya-3"],
    ]);
    expect(continueItems([{ shiurId: "yi-noach", t: 5, completed: false, updatedAt: "x" }], rows, "en")).toEqual([]);
  });

  it("skips finished parts along the series and stops at the end", () => {
    const items = continueItems(
      [
        { shiurId: "yi-tanya-1", t: 3600, completed: true, updatedAt: "2026-11-11T00:00:00Z" },
        { shiurId: "yi-tanya-3", t: 3600, completed: true, updatedAt: "2026-11-09T00:00:00Z" },
        { shiurId: "yi-tanya-2", t: 3600, completed: true, updatedAt: "2026-11-10T00:00:00Z" },
      ],
      rows,
      "both",
    );
    expect(items.map((i) => [i.kind, i.row.id])).toEqual([["next", "yi-tanya-4"]]);
    const all = [1, 2, 3, 4].map((n) => ({ shiurId: `yi-tanya-${n}`, t: 1, completed: true, updatedAt: `2026-11-1${n}T00:00:00Z` }));
    expect(continueItems(all, rows, "both")).toEqual([]);
  });

  it("loads the heard shiurim's files and the parts after them, nothing corpus-wide", async () => {
    const files = new Map(
      [...series, row("en-other")].map((r) => [
        r.id,
        {
          id: r.id,
          lang: r.lang,
          catalog: { titleOriginal: r.title },
          duration: r.duration,
          years: r.years,
          status: r.status,
          series: r.series ? { ...r.series, count: 4 } : null,
          related: { next: r.next },
        },
      ]),
    );
    const requested: string[] = [];
    const load = async (id: string) => {
      requested.push(id);
      const f = files.get(id);
      if (!f) throw new Error("404");
      return f as unknown as ShiurFile;
    };
    const progress = [
      { shiurId: "yi-tanya-1", t: 3600, completed: true, updatedAt: "2026-11-11T00:00:00Z" },
      { shiurId: "yi-tanya-2", t: 3600, completed: true, updatedAt: "2026-11-12T00:00:00Z" },
      { shiurId: "en-other", t: 10, completed: false, updatedAt: "2026-11-13T00:00:00Z" },
    ];
    const loaded = await loadContinueRows(progress, load);
    expect([...requested].sort()).toEqual(["en-other", "yi-tanya-1", "yi-tanya-2", "yi-tanya-3"]);
    expect(continueItems(progress, loaded, "both").map((i) => [i.kind, i.row.id])).toEqual([
      ["resume", "en-other"],
      ["next", "yi-tanya-3"],
    ]);
    expect(await loadContinueRows([], load)).toEqual(new Map());
  });
});

describe("dates", () => {
  it("reads ?date= only when it is a real date", () => {
    expect(dateFromQuery("?date=2027-05-25")).toBe("2027-05-25");
    expect(dateFromQuery("?date=2027-02-30")).toBeNull();
    expect(dateFromQuery("?date=tomorrow")).toBeNull();
    expect(dateFromQuery("")).toBeNull();
  });

  it("uses the local calendar day", () => {
    expect(localIsoDay(new Date(2026, 10, 15, 23, 59))).toBe("2026-11-15");
    expect(localIsoDay(new Date(2027, 0, 1, 0, 1))).toBe("2027-01-01");
  });
});
