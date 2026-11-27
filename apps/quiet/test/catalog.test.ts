/**
 * W3.1 catalog pages: the page models over `.corpus/` outputs of `buildCorpusWithAggregates`
 * (the mini corpus of @emunas/corpus, and today's real data), the string tables and the table
 * component. Acceptance (integration-plan §8 W3.1): guide order matches pocket-guide-2012.json
 * sections; section counts match ingest; Tanya grouped by perek; catalog-only rows show no AI text.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createCalendar, calendar } from "@emunas/calendar";
import { buildCorpusWithAggregates } from "@emunas/corpus/build/aggregate";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import CatalogTable from "../src/components/catalog/CatalogTable.astro";
import ThisWeek from "../src/components/catalog/ThisWeek.astro";
import { findCorpusDir, loadCatalogCorpus, type CatalogCorpus } from "../src/components/catalog/corpus.ts";
import {
  addIsoDays,
  buildDate,
  catalogRow,
  contentsModel,
  corpusTotals,
  SECTION_DISPLAY_NAMES,
  sectionDisplayTitle,
  perekIsNumeral,
  sectionHref,
  sectionModel,
  sectionSlug,
  sectionSummaries,
  seriesModel,
  seriesSummaries,
  thisWeekModel,
  thisWeekWindow,
  WEEK_DAYS_AFTER,
  WEEK_DAYS_BEFORE,
  THIS_WEEK_LIMIT,
  type CatalogRow,
} from "../src/components/catalog/model.ts";
import { catalogEn, catalogYi } from "../src/components/catalog/strings.ts";
import { EDS } from "../src/lib/edition.ts";
import { pickText } from "@emunas/i18n";

const app = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = resolve(app, "../..");
const corpusPkg = join(repo, "packages/corpus");
const MINI_DATA = join(corpusPkg, "test/fixtures/mini/data");
const MINI_POLICY = join(corpusPkg, "test/fixtures/mini/site-policy");
const REAL_DATA = join(repo, "data");
const REAL_POLICY = join(repo, "site-policy");
const MEDIA = "https://media.example.org";

const dirs: string[] = [];
function buildInto(dataDir: string, policyDir: string): CatalogCorpus {
  const out = mkdtempSync(join(tmpdir(), "quiet-catalog-"));
  dirs.push(out);
  buildCorpusWithAggregates({ dataDir, policyDir, outDir: out, mediaOrigin: MEDIA, dataSha: null });
  return loadCatalogCorpus(out);
}
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

// ------------------------------------------------------------------ strings

describe("catalog string tables", () => {
  const placeholders = (m: unknown): string[] => {
    const forms = typeof m === "string" ? [m] : Object.values(m as Record<string, string>);
    return [...new Set(forms.flatMap((f) => [...f.matchAll(/\{(\w+)\}/g)].map((x) => x[1]!)))].sort();
  };

  it("have the same keys, non-empty, Yiddish in Hebrew script", () => {
    expect(Object.keys(catalogYi).sort()).toEqual(Object.keys(catalogEn).sort());
    for (const [k, v] of Object.entries(catalogYi)) {
      const forms = typeof v === "string" ? [v] : Object.values(v);
      for (const f of forms) {
        expect(f.trim(), k).not.toBe("");
        expect(/[א-ת]/.test(f), k).toBe(true);
      }
    }
  });

  it("use the same placeholders (counting every plural form)", () => {
    for (const k of Object.keys(catalogEn) as (keyof typeof catalogEn)[]) {
      // a Yiddish "one" form may name the thing instead of the number
      const en = placeholders(catalogEn[k]).filter((p) => p !== "count");
      const yi = placeholders(catalogYi[k]).filter((p) => p !== "count");
      expect(yi, k).toEqual(en);
    }
  });
});

// ------------------------------------------------------------------ pure helpers

describe("addresses and helpers", () => {
  it("keeps guide section ids and prefixes uncatalogued ones", () => {
    expect(sectionSlug({ source: "pocket-guide-2012", id: "zmanim" })).toBe("zmanim");
    expect(sectionSlug({ source: "uncatalogued-guide", id: "zmanim" })).toBe("unc-zmanim");
    expect(sectionHref("yi", { source: "uncatalogued-guide", id: "simchos" })).toBe("/yi/section/unc-simchos/");
  });

  it("shows clean names for the catalog's file-system and all-caps section labels", () => {
    expect(sectionDisplayTitle("pocket-guide-2012:tanya-en", "TANYA ENGLISH", "en")).toBe("Tanya (English)");
    expect(sectionDisplayTitle("uncatalogued-guide:current", "Y 05 Current", "en")).toBe("Shiurim 5769–5773");
    expect(sectionDisplayTitle("pocket-guide-2012:zmanim", "זמנים", "en")).toBe("זמנים");
    for (const [key, name] of Object.entries(SECTION_DISPLAY_NAMES)) {
      expect(name.en, key).not.toMatch(/[א-ת]/);
      expect(name.yi, key).toMatch(/[א-ת]/);
      expect(name.he, key).toMatch(/[א-ת]/);
      expect(name.he, key).not.toMatch(/ענגליש/);
    }
    expect(sectionDisplayTitle("pocket-guide-2012:tanya-en", "TANYA ENGLISH", "he")).toBe("ספר התניא (אנגלית)");
  });

  it("reads perek numerals as printed", () => {
    for (const p of ["א", "י\"ב", "כ”ח", "ו-ז", "י\"א וי\"ב", "כ\"ג וכ\"ד"]) expect(perekIsNumeral(p), p).toBe(true);
    expect(perekIsNumeral("הקדמה")).toBe(false);
    expect(perekIsNumeral("")).toBe(false);
  });

  it("takes the build date from EMUNAS_BUILD_DATE, else today in New York", () => {
    expect(buildDate({ EMUNAS_BUILD_DATE: "2027-03-01" }, new Date("2026-11-15T12:00:00Z"))).toBe("2027-03-01");
    expect(buildDate({ EMUNAS_BUILD_DATE: "soon" }, new Date("2026-11-16T04:30:00Z"))).toBe("2026-11-15");
    expect(buildDate({}, new Date("2026-11-16T05:30:00Z"))).toBe("2026-11-16");
    // EDT: midnight is 04:00 UTC
    expect(buildDate({}, new Date("2026-07-01T03:59:00Z"))).toBe("2026-06-30");
    expect(buildDate({}, new Date("2026-07-01T04:01:00Z"))).toBe("2026-07-01");
  });

  it("adds civil days across month and year ends", () => {
    expect(addIsoDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addIsoDays("2027-01-01", -1)).toBe("2026-12-31");
    expect(addIsoDays("2027-03-14", 3)).toBe("2027-03-17");
  });

  it("finds .corpus/ by walking up, or via EMUNAS_CORPUS_DIR", () => {
    const missing = mkdtempSync(join(tmpdir(), "quiet-nocorpus-"));
    dirs.push(missing);
    expect(findCorpusDir({ EMUNAS_CORPUS_DIR: missing }, "/")).toBeNull();
    expect(() => loadCatalogCorpus(join(missing, "nope"))).toThrow(/corpus:build/);
  });
});

// ------------------------------------------------------------------ mini corpus

describe("catalog models on the mini corpus", () => {
  let corpus: CatalogCorpus;
  beforeAll(() => {
    corpus = buildInto(MINI_DATA, MINI_POLICY);
  });

  it("lists sections in catalog order, Yiddish, then English, then the other recordings, skipping empty ones", () => {
    const m = contentsModel(corpus, "en");
    const listed = [...m.yiddish, ...m.english, ...m.more];
    const expected = corpus.sections.sections.filter((s) => s.count > 0).map((s) => s.key);
    // Yiddish guide sections come before English ones in the guide itself
    expect(listed.map((s) => s.key)).toEqual(expected);
    expect(m.yiddish.every((s) => s.lang === "yi" && !s.uncatalogued)).toBe(true);
    expect(m.english.every((s) => s.lang === "en" && !s.uncatalogued)).toBe(true);
    expect(m.more.every((s) => s.uncatalogued)).toBe(true);
    expect(listed.some((s) => s.count === 0)).toBe(false);
  });

  it("puts every shiur on exactly one section page", () => {
    const seen = new Map<string, number>();
    for (const s of sectionSummaries(corpus, "yi")) {
      const page = sectionModel(corpus, s.slug, "yi");
      expect(page, s.slug).not.toBeNull();
      for (const r of page!.rows) seen.set(r.id, (seen.get(r.id) ?? 0) + 1);
      expect(page!.rows.map((r) => r.id)).toEqual(s.shiurIds);
    }
    expect([...seen.keys()].sort()).toEqual(corpus.index.shiurim.map((r) => r.id).sort());
    expect([...seen.values()].every((n) => n === 1)).toBe(true);
  });

  it("shows no AI text on catalog-only rows, and the edition's one-liner (else the fallback's) on rows with notes", () => {
    for (const ed of EDS) {
      for (const r of corpus.index.shiurim) {
        const row = catalogRow(r, ed, corpus.audio);
        if (r.status !== "full") expect(row.oneLiner, r.id).toBeNull();
        else expect(row.oneLiner, r.id).toEqual(pickText(r.oneLiner!, ed));
      }
    }
    // No Hebrew translation in the mini corpus: the Hebrew edition shows the Yiddish, marked as Yiddish.
    const full = corpus.index.shiurim.find((r) => r.status === "full")!;
    expect(catalogRow(full, "he", corpus.audio).oneLiner).toMatchObject({ lang: "yi", dir: "rtl", fallback: true });
    expect(corpus.index.shiurim.some((r) => r.status === "catalog-only")).toBe(true);
    expect(corpus.index.shiurim.some((r) => r.status === "full")).toBe(true);
  });

  it("sub-groups a large zmanim section by zman in the order of the year", () => {
    const m = sectionModel(corpus, "zmanim", "en")!;
    expect(m.layout.kind).toBe("zman");
    if (m.layout.kind !== "zman") return;
    const order = new Map(corpus.occasions.zmanim.map((z) => [`z-${z.key}`, z.order]));
    const orders = m.layout.zmanim.map((g) => order.get(g.id)!);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    const grouped = [...m.layout.zmanim.flatMap((g) => g.rows), ...(m.layout.other?.rows ?? [])];
    expect(grouped.map((r) => r.id).sort()).toEqual([...m.section.shiurIds].sort());
  });

  it("leaves catalog rows without any recording out of their section", () => {
    expect(corpus.index.gaps!.map((g) => g.id)).toEqual(["yi-zmanim-tv-bshbt-02", "en-zmanim-en-chnvkh-01"]);
    for (const g of corpus.index.gaps!) {
      const section = sectionSummaries(corpus, "en").find((s) => s.key === g.sectionKey)!;
      expect(sectionModel(corpus, section.slug, "en")!.rows.some((r) => r.id === g.id), g.id).toBe(false);
    }
  });

  it("keeps small sections flat", () => {
    expect(sectionModel(corpus, "shonos", "yi")!.layout.kind).toBe("flat");
  });

  it("builds series pages with parts in order and perek groups, never paired with the other language", () => {
    const tanya = seriesModel(corpus, "tanya-yi", "yi")!;
    expect(tanya.rows.map((r) => r.part)).toEqual([1, 2, 3, 4]);
    expect(tanya.groups!.map((g) => g.perek)).toEqual(["א", "ב", "י\"ב", "י\"ח"]);
    // Yiddish and English shiurim are separate shiurim, never translations (C1.8 pairing removal).
    expect("sibling" in tanya).toBe(false);
    expect("sections" in tanya).toBe(false);
    expect(seriesModel(corpus, "emunah-yi", "en")!.groups).toBeNull();
    expect(seriesModel(corpus, "no-such-series", "en")).toBeNull();
  });

  it("does not make pages for empty series", () => {
    const ids = seriesSummaries(corpus, "en").map((s) => s.id);
    for (const s of corpus.series.series) expect(ids.includes(s.id)).toBe(s.parts.length > 0);
  });

  it("reports totals from build.json", () => {
    const t = corpusTotals(corpus);
    expect(t.total).toBe(corpus.build.counts.total);
  });
});

// ------------------------------------------------------------------ this week

describe("this week", () => {
  let corpus: CatalogCorpus;
  beforeAll(() => {
    corpus = buildInto(REAL_DATA, REAL_POLICY);
  });

  const zkeys = (m: { zmanim: readonly { key: string }[] }) => m.zmanim.map((z) => z.key);

  it("names the parsha of the week and, after a gap, the next zman that has shiurim", () => {
    // Sunday 5 Kislev 5787: Vayeitzei is read on the coming Shabbos; nothing with shiurim starts
    // within ten days (Yud-Tes Kislev has none), so Chanukah, 20 days off, is shown as next.
    const w = thisWeekModel(corpus, "en", "2026-11-15");
    expect(w.hebrewDate).toBe("5 Kislev 5787");
    expect(w.parsha).toMatchObject({ kind: "parsha", key: "vayeitzei", label: "Vayeitzei", href: "/en/calendar/parsha/vayeitzei/" });
    expect(w.parsha!.rows.length).toBe(Math.min(THIS_WEEK_LIMIT, w.parsha!.count));
    expect(w.zmanim).toEqual([
      expect.objectContaining({ kind: "zman", key: "chanukah", active: false, when: "next", start: "2026-12-05", startLabel: "25 Kislev", href: "/en/calendar/zman/chanukah/" }),
    ]);
    const yi = thisWeekModel(corpus, "yi", "2026-11-15");
    expect(yi.hebrewDate).toBe("ה' כסלו תשפ\"ז");
    expect(yi.parsha!.label).toMatch(/[א-ת]/);
    expect(yi.zmanim[0]!.startLabel).toBe("כ\"ה כסלו");
  });

  it("a gap of weeks still shows the next zman (2026-10-15: Chanukah)", () => {
    expect(thisWeekModel(corpus, "en", "2026-10-15").zmanim).toEqual([expect.objectContaining({ key: "chanukah", when: "next" })]);
  });

  it("shows every zman starting within ten days, with no cap", () => {
    // 2027-03-17: Zachor (20 Mar), Purim (23), Shushan Purim (24) and Parah (27, day 10); Adar is long
    const w = thisWeekModel(corpus, "en", "2027-03-17");
    expect(zkeys(w)).toEqual(["parshas-zachor", "purim", "shushan-purim", "parshas-parah"]);
    expect(w.zmanim.every((z) => z.when === "soon")).toBe(true);
    expect(w.seasons.map((z) => z.key)).toEqual(["adar"]);
    // Rosh Hashanah no longer hides Shabbos Shuvah and Yom Kippur
    expect(zkeys(thisWeekModel(corpus, "en", "2027-10-02"))).toEqual(expect.arrayContaining(["rosh-hashanah", "shabbos-shuvah", "yom-kippur"]));
  });

  it("keeps a zman while it is on, with the short ones before the long", () => {
    const date = calendar.occasionWindows("chanukah")[0]!.start;
    const w = thisWeekModel(corpus, "en", date);
    expect(w.zmanim[0]).toMatchObject({ key: "chanukah", active: true, when: "now", startLabel: "25 Kislev" });
    // a day of Pesach: Pesach on, Shevi'i shel Pesach coming; Nisan and Sefirah as links
    const pesach = thisWeekModel(corpus, "en", "2027-04-23");
    expect(zkeys(pesach)).toEqual(["pesach", "chol-hamoed-pesach", "shevii-shel-pesach"]);
    expect(pesach.seasons.map((z) => z.key)).toEqual(["nisan", "sefirah"]);
    expect(pesach.seasons[0]).toMatchObject({ active: true, href: "/en/calendar/zman/nisan/" });
  });

  it("a month alone never takes the only block while a short zman lies ahead", () => {
    // 1 Elul 5787 (2027-09-02): Elul is on (long); Rosh Hashanah, 30 days off, is the next block
    const w = thisWeekModel(corpus, "en", "2027-09-03");
    expect(zkeys(w)).toEqual(["rosh-hashanah"]);
    expect(w.zmanim[0]!.when).toBe("next");
    expect(w.seasons.map((z) => z.key)).toEqual(["elul"]);
  });

  it("degrades to nothing past the end of the calendar table", () => {
    const empty = createCalendar({ ...calendar.table, shabbosos: [], occasions: [], months: [] } as typeof calendar.table);
    const w = thisWeekModel(corpus, "en", "2026-11-15", empty);
    expect(w.parsha).toBeNull();
    expect(w.zmanim).toEqual([]);
    expect(w.seasons).toEqual([]);
    const win = thisWeekWindow(corpus, "en", "2026-11-15", empty);
    expect(win.blocks.size).toBe(0);
    expect(win.days.every((d) => d.blocks.length === 0 && d.seasons.length === 0)).toBe(true);
  });

  it("carries the days around the build day, each block once, each day its own list", () => {
    // Thursday 9 Kislev: the window runs to Sunday, when the parsha turns to Vayishlach.
    const w = thisWeekWindow(corpus, "en", "2026-11-19");
    expect(w.days.map((d) => d.date)).toEqual(["2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"]);
    expect(w.days).toHaveLength(WEEK_DAYS_BEFORE + 1 + WEEK_DAYS_AFTER);
    expect(w.today.date).toBe("2026-11-19");
    expect(w.today.blocks).toEqual(["parsha:vayeitzei", "zman:chanukah:2026-12-05:next"]);
    expect(w.days.at(-1)!.blocks).toEqual(["parsha:vayishlach", "zman:chanukah:2026-12-05:next"]);
    expect([...w.blocks.keys()].sort()).toEqual(["parsha:vayeitzei", "parsha:vayishlach", "zman:chanukah:2026-12-05:next"]);
    for (const d of w.days) for (const k of d.blocks) expect(w.blocks.has(k), `${d.date} ${k}`).toBe(true);
    for (const ed of EDS) {
      const labels = thisWeekWindow(corpus, ed, "2026-11-19").days.map((d) => d.hebrewDate);
      expect(new Set(labels).size, ed).toBe(labels.length);
    }
    // around Purim each day has its own list: Parah joins on 17 Mar, Zachor is on by 20 Mar
    const purim = thisWeekWindow(corpus, "en", "2027-03-17");
    const lists = purim.days.map((d) => d.blocks.filter((k) => k.startsWith("zman:")).map((k) => k.split(":")[1]));
    expect(lists[0]).not.toContain("parshas-parah");
    expect(lists[1]).toContain("parshas-parah");
    expect(purim.days.at(-1)!.blocks).toContain("zman:parshas-zachor:2027-03-20:now");
    for (const d of purim.days) for (const k of d.seasons) expect(purim.seasons.has(k), `${d.date} ${k}`).toBe(true);
    expect(purim.today.seasons).toEqual(["season:adar:2027-03-10"]);
  });

  it("renders several zmanim, the long windows as links, and each day's lists in its template", async () => {
    const container = await AstroContainer.create();
    const week = thisWeekWindow(corpus, "en", "2027-03-17");
    const html = await container.renderToString(ThisWeek, { props: { ed: "en", week } });
    const grid = html.slice(html.indexOf("data-week-grid"), html.indexOf("data-week-seasons-line"));
    for (const k of ["vayikra", "parshas-zachor", "purim", "shushan-purim", "parshas-parah"]) expect(grid).toContain(`data-occasion="${k}"`);
    expect(grid).toContain("Coming: Parshas Parah");
    expect(grid).toContain("On 11 Adar II");
    const line = html.slice(html.indexOf("data-week-seasons-line"), html.indexOf("data-week-days"));
    expect(line).toContain("Also now and coming:");
    expect(line).toContain('href="/en/calendar/zman/adar/"');
    expect(line).not.toMatch(/\shidden/);
    for (const d of week.days) expect(html).toContain(`data-day="${d.date}" data-blocks="${d.blocks.join(" ")}" data-seasons="${d.seasons.join(" ")}"`);
    for (const k of [...week.blocks.keys(), ...week.seasons.keys()]) expect(html).toContain(`data-week-block="${k}"`);
  });

  it("keys a zman that is on apart from one that is coming", () => {
    const start = calendar.occasionWindows("chanukah")[0]!.start;
    const w = thisWeekWindow(corpus, "en", start);
    expect(w.days[0]!.blocks).toContain("zman:chanukah:2026-12-05:soon");
    expect(w.today.blocks).toContain("zman:chanukah:2026-12-05:now");
  });
});

// ------------------------------------------------------------------ real data acceptance

interface IngestShiur {
  id: string;
  inScope: boolean;
  category: string;
  catalog: { source: string; sectionId: string };
}
interface Ingest {
  stats: Record<string, number>;
  shiurim: IngestShiur[];
}
interface GuideFile {
  sections: { id: string }[];
}

describe("catalog models on today's data", () => {
  let corpus: CatalogCorpus;
  const ingest = JSON.parse(readFileSync(join(REAL_DATA, "derived/ingest.json"), "utf8")) as Ingest;
  const guide = JSON.parse(readFileSync(join(REAL_DATA, "catalog/pocket-guide-2012.json"), "utf8")) as GuideFile;
  const inScope = ingest.shiurim.filter((s) => s.inScope);
  beforeAll(() => {
    corpus = buildInto(REAL_DATA, REAL_POLICY);
  });

  it("guide order matches pocket-guide-2012.json sections", () => {
    const m = contentsModel(corpus, "yi");
    const shown = [...m.yiddish, ...m.english].map((s) => s.id);
    const withShiurim = new Set(inScope.filter((s) => s.catalog.source === "pocket-guide-2012").map((s) => s.catalog.sectionId));
    expect(shown).toEqual(guide.sections.map((s) => s.id).filter((id) => withShiurim.has(id)));
    // Yiddish sections first, then English (the guide separates them the same way)
    expect(m.yiddish.length).toBeGreaterThan(0);
    expect(m.english.length).toBeGreaterThan(0);
  });

  it("section counts match ingest", () => {
    const want = new Map<string, number>();
    for (const s of inScope) {
      const key = `${s.catalog.source}:${s.catalog.sectionId}`;
      want.set(key, (want.get(key) ?? 0) + 1);
    }
    // Sections made only of catalog rows without audio are not listed at all.
    const got = new Map(sectionSummaries(corpus, "en").map((s) => [s.key, s.count]));
    expect(got).toEqual(want);
    for (const g of corpus.index.gaps!) if (!want.has(g.sectionKey)) expect(got.has(g.sectionKey), g.sectionKey).toBe(false);
    // and the per-category totals of the ingest stats
    const byCategory = new Map<string, number>();
    for (const s of sectionSummaries(corpus, "en")) {
      for (const id of s.shiurIds) {
        const cat = corpus.index.shiurim.find((r) => r.id === id)!.category;
        byCategory.set(cat, (byCategory.get(cat) ?? 0) + 1);
      }
    }
    for (const [cat, n] of byCategory) expect(n, cat).toBe(ingest.stats[`shiurim.inScope.category.${cat}`]);
    const total = [...got.values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(ingest.stats["shiurim.inScope"]);
    expect(corpusTotals(corpus).total).toBe(total);
  });

  it("Tanya is grouped by perek, in series order", () => {
    for (const id of ["tanya-yi", "tanya-en"]) {
      const m = seriesModel(corpus, id, "en")!;
      expect(m.groups, id).not.toBeNull();
      expect(m.groups!.length).toBeGreaterThan(10);
      const flat = m.groups!.flatMap((g) => g.rows.map((r) => r.part));
      expect(flat).toEqual(m.rows.map((r) => r.part));
      expect(flat).toEqual(flat.map((_, i) => i + 1));
      for (const g of m.groups!) for (const r of g.rows) expect(r.perek?.replace(/[”"]/g, "") ?? null).toBe(g.perek?.replace(/[”"]/g, "") ?? null);
    }
    expect("sibling" in seriesModel(corpus, "tanya-yi", "en")!).toBe(false);
  });

  it("catalog-only rows carry no AI text on any section or series page", () => {
    for (const ed of EDS) {
      const rows: CatalogRow[] = [
        ...sectionSummaries(corpus, ed).flatMap((s) => sectionModel(corpus, s.slug, ed)!.rows),
        ...seriesSummaries(corpus, ed).flatMap((s) => seriesModel(corpus, s.id, ed)!.rows),
      ];
      expect(rows.length).toBeGreaterThan(997);
      for (const r of rows) if (r.status !== "full") expect(r.oneLiner, r.id).toBeNull();
    }
  });

  it("greys rows that have no recording that can be played, and lists no catalog row without audio", () => {
    const rows = sectionSummaries(corpus, "en").flatMap((s) => sectionModel(corpus, s.slug, "en")!.rows);
    const unplayable = rows.filter((r) => !r.playable).map((r) => r.id);
    const expected = corpus.index.shiurim
      .filter((r) => !r.recordingIds.some((id) => corpus.audio[id]?.playable))
      .map((r) => r.id);
    expect(unplayable.sort()).toEqual(expected.sort());
    // the catalog rows that have no audio at all (11 today) are on no page
    expect(corpus.index.gaps!.length).toBeGreaterThanOrEqual(11);
    const ids = new Set(rows.map((r) => r.id));
    for (const g of corpus.index.gaps!) expect(ids.has(g.id), g.id).toBe(false);
  });

  it("sub-groups the parsha sections by chumash and parsha, the zmanim sections by zman", () => {
    expect(sectionModel(corpus, "parshas-hashavua", "yi")!.layout.kind).toBe("parsha");
    expect(sectionModel(corpus, "parsha-en", "en")!.layout.kind).toBe("parsha");
    expect(sectionModel(corpus, "zmanim", "yi")!.layout.kind).toBe("zman");
    expect(sectionModel(corpus, "zmanim-en", "en")!.layout.kind).toBe("zman");
    const p = sectionModel(corpus, "parshas-hashavua", "en")!.layout;
    if (p.kind !== "parsha") throw new Error("expected parsha layout");
    expect(p.chumashim.map((c) => c.chumash)).toEqual(["bereishis", "shemos", "vayikra", "bamidbar", "devarim"]);
  });
});

// ------------------------------------------------------------------ the table component

describe("CatalogTable", () => {
  let container: AstroContainer;
  beforeAll(async () => {
    container = await AstroContainer.create();
  });

  const base: CatalogRow = {
    id: "yi-x-01",
    href: "/en/shiur/yi-x-01/",
    lang: "yi",
    status: "full",
    title: "זמן התחלת התנוצצות",
    heading: null,
    subTitle: null,
    parsha: null,
    zman: { key: "chanukah", raw: "חנוכה" },
    perek: null,
    years: [5743],
    duration: 2700,
    playable: true,
    oneLiner: { text: "The Mashgiach explains the lights.", lang: "en", dir: "ltr", fallback: false },
  };

  it("renders a captioned table with scoped headers, the title as a bdi run, and the notes cell", async () => {
    const html = await container.renderToString(CatalogTable, {
      props: { ed: "en", rows: [base], caption: "Chanukah: the shiurim in order", occasion: true, notes: true },
    });
    expect(html).toContain("<caption");
    expect(html).toMatch(/<th scope="col"[^>]*>Title<\/th>/);
    expect(html).not.toContain("col-num");
    expect(html).toMatch(/<th scope="row"/);
    expect(html).toContain('<a href="/en/shiur/yi-x-01/"><bdi lang="yi" dir="rtl">זמן התחלת התנוצצות</bdi></a>');
    expect(html).toContain('<td class="col-notes">The Mashgiach explains the lights.</td>');
    // a fallback one-liner carries its own language
    const yiLine: CatalogRow = { ...base, oneLiner: { text: "א שורה.", lang: "yi", dir: "rtl", fallback: true } };
    const he = await container.renderToString(CatalogTable, { props: { ed: "he", rows: [yiLine], caption: "x", notes: true } });
    expect(he).toContain('<td class="col-notes" lang="yi" dir="rtl">א שורה.</td>');
    expect(html).toContain('data-year="5743"');
    expect(html).not.toContain("no-recording");
  });

  it("leaves the notes cell empty for a catalog-only row and greys a row without a playable recording", async () => {
    const row: CatalogRow = { ...base, status: "catalog-only", oneLiner: null, playable: false };
    const html = await container.renderToString(CatalogTable, {
      props: { ed: "yi", rows: [row], caption: "x", notes: true },
    });
    expect(html).toMatch(/<td class="col-notes"><\/td>/);
    expect(html).toContain("no-recording");
    expect(html).toContain("קיין רעקארדירונג אויפן אינטערנעט");
    expect(html).toMatch(/<th scope="col"[^>]*>קעפל<\/th>/);
  });

  it("numbers series parts", async () => {
    const html = await container.renderToString(CatalogTable, {
      props: { ed: "en", rows: [{ ...base, part: 6 }], caption: "x", number: "part", partsOf: 63 },
    });
    expect(html).toMatch(/<th scope="col"[^>]*>Part<\/th>/);
    expect(html).toContain('title="Part 6 of 63"');
    expect(html).not.toContain("col-notes");
  });
});
