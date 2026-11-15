/**
 * Unit tests for the calendar/year view models over a small hand-made corpus (shapes from
 * `@emunas/corpus`). The real-data and built-page checks are in `calendar.build.test.ts`.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { OccasionsFile, YearsFile } from "@emunas/corpus/aggregate";
import type { CorpusIndex, IndexRow } from "@emunas/corpus/public";
import { describe, expect, it } from "vitest";
import { findCorpusDir, readCalendarData } from "./data.ts";
import {
  calendarHref,
  isGuessedRow,
  occasionPage,
  otherOccasions,
  parshaIndex,
  shiurEntry,
  unknownYearGroups,
  yearHref,
  yearIndex,
  yearPage,
  zmanIndex,
  type CalendarData,
} from "./model.ts";
import { calendarEn, calendarYi, useCalendarT } from "./strings.ts";

function row(id: string, over: Partial<IndexRow> & { derived?: IndexRow["catalog"]["derived"]; section?: string } = {}): IndexRow {
  const { derived = "catalog", section = "parsha", ...rest } = over;
  const lang = id.startsWith("en-") ? "en" : "yi";
  return {
    id,
    rev: "r",
    lang,
    category: "parsha",
    status: "catalog-only",
    catalog: {
      source: derived === "catalog" ? "pocket-guide-2012" : "uncatalogued-guide",
      sectionId: section,
      sectionTitle: section === "parsha" ? "פרשת השבוע" : "Sets",
      n: "1",
      page: 1,
      titleOriginal: `Title of ${id}`,
      subTitle: null,
      derived,
    },
    parsha: null,
    zman: null,
    perek: null,
    years: [],
    series: null,
    duration: 60,
    recordingIds: [`${id}-r`],
    oneLiner: null,
    entities: { works: [], people: [], concepts: [] },
    counts: { chapters: 0, sources: 0, stories: 0, questions: 0, insights: 0 },
    ...rest,
  } as IndexRow;
}

const rows: IndexRow[] = [
  row("yi-noach-1", { parsha: { raw: "נח", key: "noach" }, years: [5743], oneLiner: { en: "One line.", yi: "איין שורה." } }),
  row("en-noach-1", { parsha: { raw: "Noach", key: "noach" }, years: [5749] }),
  row("yi-guess-1", { parsha: { raw: "נח", key: "noach" }, derived: "filename", section: "sets" }),
  row("yi-zos-1", { zman: { raw: "זאת חנוכה", key: "zos-chanukah" }, years: [5743] }),
  row("yi-zos-seudah", { zman: { raw: "סעודת זאת חנוכה", key: "zos-chanukah" }, years: [5745] }),
  row("yi-oneoff", { zman: { raw: "יום המיוחס", key: "other" }, years: [5736] }),
  row("yi-set-1", { section: "sets" }),
];

const index: CorpusIndex = {
  schemaVersion: 2,
  sections: [
    { key: "pocket-guide-2012:parsha", source: "pocket-guide-2012", id: "parsha", title: "פרשת השבוע", order: 0, pages: null, dir: "rtl" },
    { key: "pocket-guide-2012:sets", source: "pocket-guide-2012", id: "sets", title: "Sets", order: 1, pages: null, dir: "ltr" },
  ],
  series: [],
  shiurim: rows,
};

const ref = (id: string, years: number[], raw: string, audience: "children" | "bachurim" | null = null) => ({
  id,
  lang: id.startsWith("en-") ? ("en" as const) : ("yi" as const),
  years,
  raw,
  audience,
});

const occasions: OccasionsFile = {
  parshiyos: [
    { key: "bereishis", order: 1, chumash: "bereishis", he: "בראשית", yi: "בראשית", en: "Bereishis", parts: null, count: 0, shiurim: [] },
    {
      key: "noach",
      order: 2,
      chumash: "bereishis",
      he: "נח",
      yi: "נח",
      en: "Noach",
      parts: null,
      count: 2,
      shiurim: [ref("yi-noach-1", [5743], "נח"), ref("en-noach-1", [5749], "Noach", "bachurim")],
    },
    { key: "shemos", order: 13, chumash: "shemos", he: "שמות", yi: "שמות", en: "Shemos", parts: null, count: 0, shiurim: [] },
  ],
  zmanim: [
    {
      key: "zos-chanukah",
      order: 13,
      he: "זאת חנוכה",
      yi: "זאת חנוכה",
      en: "Zos Chanukah",
      count: 2,
      shiurim: [ref("yi-zos-1", [5743], "זאת חנוכה")],
      subs: [{ sub: "seudah", shiurim: [ref("yi-zos-seudah", [5745], "סעודת זאת חנוכה")] }],
    },
    { key: "elul", order: 1, he: "אלול", yi: "אלול", en: "Elul", count: 0, shiurim: [], subs: [] },
  ],
  other: [ref("yi-oneoff", [5736], "יום המיוחס")],
  excluded: { uncataloguedGuesses: 1 },
};

const years: YearsFile = {
  years: [
    { year: 5736, count: 1, shiurIds: ["yi-oneoff"] },
    { year: 5743, count: 2, shiurIds: ["yi-zos-1", "yi-noach-1"] },
    { year: 5745, count: 1, shiurIds: ["yi-zos-seudah"] },
    { year: 5749, count: 1, shiurIds: ["en-noach-1"] },
  ],
  unknown: { count: 2, shiurIds: ["yi-guess-1", "yi-set-1"] },
};

const data: CalendarData = { index, occasions, years };

describe("paths", () => {
  it("uses the @emunas/links routes", () => {
    expect(calendarHref("yi")).toBe("/yi/calendar/");
    expect(calendarHref("en")).toBe("/en/calendar/");
    expect(yearHref("en", 5743)).toBe("/en/years/5743/");
    expect(yearHref("yi", "unknown")).toBe("/yi/years/unknown/");
  });
});

describe("parshaIndex", () => {
  it("groups every parsha by chumash in Torah order, including those with no shiur", () => {
    const g = parshaIndex(occasions, "en");
    expect(g.map((x) => [x.chumash, x.labelKey, x.items.map((i) => i.key)])).toEqual([
      ["bereishis", "cal.chumash.bereishis", ["bereishis", "noach"]],
      ["shemos", "cal.chumash.shemos", ["shemos"]],
    ]);
    expect(g[0]!.items[1]).toMatchObject({ href: "/en/calendar/parsha/noach/", count: 2, name: "Noach", he: "נח" });
  });

  it("names parshiyos in Hebrew letters only in the Yiddish edition", () => {
    expect(parshaIndex(occasions, "yi")[0]!.items[1]).toMatchObject({ name: "נח", he: null, href: "/yi/calendar/parsha/noach/" });
  });
});

describe("zmanIndex", () => {
  it("lists every zman from Elul, by table order", () => {
    expect(zmanIndex(occasions, "yi").map((z) => [z.key, z.count, z.href])).toEqual([
      ["elul", 0, "/yi/calendar/zman/elul/"],
      ["zos-chanukah", 2, "/yi/calendar/zman/zos-chanukah/"],
    ]);
  });
});

describe("occasionPage", () => {
  it("lists both languages together in the aggregate's year order, with the catalog audience", () => {
    const p = occasionPage(data, "parsha", "noach", "en")!;
    expect(p.shiurim.map((e) => [e.id, e.lang, e.years])).toEqual([
      ["yi-noach-1", "yi", [5743]],
      ["en-noach-1", "en", [5749]],
    ]);
    expect(p.shiurim[1]!.audience).toBe("bachurim");
    expect(p.shiurim[0]).toMatchObject({ href: "/en/shiur/yi-noach-1/", title: "Title of yi-noach-1", oneLiner: "One line." });
    expect(p.shiurim[1]!.oneLiner).toBeNull();
    expect(p.subs).toEqual([]);
  });

  it("does not list an uncatalogued row whose parsha is a file-name guess", () => {
    const ids = occasionPage(data, "parsha", "noach", "yi")!.shiurim.map((e) => e.id);
    expect(ids).not.toContain("yi-guess-1");
  });

  it("puts seudah shiurim under their zman as a sub-heading", () => {
    const p = occasionPage(data, "zman", "zos-chanukah", "yi")!;
    expect(p.shiurim.map((e) => e.id)).toEqual(["yi-zos-1"]);
    expect(p.subs).toEqual([{ labelKey: "cal.sub.seudah", shiurim: [expect.objectContaining({ id: "yi-zos-seudah" })] }]);
    expect(p.count).toBe(2);
  });

  it("gives an empty page for a key with no shiur and null for an unknown key", () => {
    expect(occasionPage(data, "parsha", "shemos", "en")).toMatchObject({ count: 0, shiurim: [] });
    expect(occasionPage(data, "zman", "no-such", "en")).toBeNull();
  });

  it("skips ids missing from index.json rather than failing", () => {
    const broken: CalendarData = { ...data, index: { ...index, shiurim: rows.filter((r) => r.id !== "en-noach-1") } };
    expect(occasionPage(broken, "parsha", "noach", "en")!.shiurim.map((e) => e.id)).toEqual(["yi-noach-1"]);
  });
});

describe("otherOccasions", () => {
  it("shows one-off occasions as the catalog prints them, unlinked", () => {
    const o = otherOccasions(data, "en");
    expect(o.map((e) => e.id)).toEqual(["yi-oneoff"]);
    expect(o[0]!.occasions).toEqual([{ name: { name: "יום המיוחס", he: null }, href: null, raw: "יום המיוחס" }]);
  });
});

describe("years", () => {
  it("indexes the years with counts and says how many have one", () => {
    const y = yearIndex(data, "en");
    expect(y.rows.map((r) => [r.year, r.count, r.href])).toEqual([
      [5736, 1, "/en/years/5736/"],
      [5743, 2, "/en/years/5743/"],
      [5745, 1, "/en/years/5745/"],
      [5749, 1, "/en/years/5749/"],
    ]);
    expect(y).toMatchObject({ known: 5, total: 7, unknown: { count: 2, href: "/en/years/unknown/" } });
  });

  it("lists a year in the aggregate's calendar order with each shiur's parsha or zman linked", () => {
    const e = yearPage(data, 5743, "en")!;
    expect(e.map((x) => x.id)).toEqual(["yi-zos-1", "yi-noach-1"]);
    expect(e[0]!.occasions).toEqual([{ name: { name: "Zos Chanukah", he: "זאת חנוכה" }, href: "/en/calendar/zman/zos-chanukah/", raw: null }]);
    expect(yearPage(data, 5800, "en")).toBeNull();
  });

  it("shows a one-off occasion as printed and gives a guessed row no occasion", () => {
    const lookup = new Map([["parsha:noach", { kind: "parsha" as const, he: "נח", yi: "נח", en: "Noach" }]]);
    expect(yearPage(data, 5736, "yi")![0]!.occasions).toEqual([{ name: { name: "יום המיוחס", he: null }, href: null, raw: "יום המיוחס" }]);
    expect(isGuessedRow(rows[2]!)).toBe(true);
    expect(shiurEntry(rows[2]!, "yi", { lookup }).occasions).toEqual([]);
    expect(shiurEntry(rows[0]!, "yi", { lookup }).occasions).toEqual([
      { name: { name: "נח", he: null }, href: "/yi/calendar/parsha/noach/", raw: null },
    ]);
  });

  it("groups the shiurim without a year by section in catalog order, unlisted sections last", () => {
    const g = unknownYearGroups(data, "yi");
    expect(g.map((x) => [x.key, x.title, x.shiurim.map((s) => s.id)])).toEqual([
      ["pocket-guide-2012:sets", "Sets", ["yi-set-1"]],
      ["uncatalogued-guide:sets", "Sets", ["yi-guess-1"]],
    ]);
    expect(g.flatMap((x) => x.shiurim).length).toBe(years.unknown.count);
  });
});

describe("strings", () => {
  it("have the same keys and placeholders in both editions", () => {
    const ph = (m: unknown) => [...JSON.stringify(m).matchAll(/\{(\w+)\}/g)].map((x) => x[1]).sort();
    expect(Object.keys(calendarYi).sort()).toEqual(Object.keys(calendarEn).sort());
    for (const k of Object.keys(calendarEn) as (keyof typeof calendarEn)[]) {
      expect(ph(calendarYi[k]), k).toEqual(ph(calendarEn[k]));
      expect(/[א-ת]/.test(JSON.stringify(calendarYi[k])), k).toBe(true);
    }
  });

  it("pluralise counts", () => {
    expect(useCalendarT("en")("cal.count", { count: 1 })).toBe("1 shiur");
    expect(useCalendarT("en")("cal.count", { count: 16 })).toBe("16 shiurim");
    expect(useCalendarT("yi")("cal.count", { count: 3 })).toBe("3 שיעורים");
  });
});

describe("findCorpusDir", () => {
  const make = () => {
    const root = mkdtempSync(join(tmpdir(), "quiet-cal-"));
    mkdirSync(join(root, ".corpus"));
    writeFileSync(join(root, ".corpus", "index.json"), JSON.stringify(index));
    writeFileSync(join(root, ".corpus", "occasions.json"), JSON.stringify(occasions));
    writeFileSync(join(root, ".corpus", "years.json"), JSON.stringify(years));
    mkdirSync(join(root, "apps", "quiet"), { recursive: true });
    return root;
  };

  it("finds .corpus/ in a parent of the working directory and reads the three files", () => {
    const root = make();
    const dir = findCorpusDir(join(root, "apps", "quiet"), {});
    expect(dir).toBe(join(root, ".corpus"));
    expect(readCalendarData(dir!)).toEqual(data);
  });

  it("prefers EMUNAS_CORPUS_DIR and returns null when there is no corpus", () => {
    const root = make();
    const empty = mkdtempSync(join(tmpdir(), "quiet-cal-none-"));
    expect(findCorpusDir(empty, { EMUNAS_CORPUS_DIR: join(root, ".corpus") })).toBe(join(root, ".corpus"));
    expect(findCorpusDir(root, { EMUNAS_CORPUS_DIR: empty })).toBeNull();
    expect(findCorpusDir(empty, {})).toBeNull();
  });
});
