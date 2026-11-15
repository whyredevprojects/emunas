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
import { findCorpusDir, loadCatalogCorpus, type CatalogCorpus } from "../src/components/catalog/corpus.ts";
import {
  buildDate,
  catalogRow,
  contentsModel,
  corpusTotals,
  perekIsNumeral,
  sectionHref,
  sectionModel,
  sectionSlug,
  sectionSummaries,
  seriesModel,
  seriesSummaries,
  thisWeekModel,
  THIS_WEEK_LIMIT,
  type CatalogRow,
} from "../src/components/catalog/model.ts";
import { catalogEn, catalogYi } from "../src/components/catalog/strings.ts";

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

  it("reads perek numerals as printed", () => {
    for (const p of ["א", "י\"ב", "כ”ח", "ו-ז", "י\"א וי\"ב", "כ\"ג וכ\"ד"]) expect(perekIsNumeral(p), p).toBe(true);
    expect(perekIsNumeral("הקדמה")).toBe(false);
    expect(perekIsNumeral("")).toBe(false);
  });

  it("takes the build date from EMUNAS_BUILD_DATE, else today (UTC)", () => {
    expect(buildDate({ EMUNAS_BUILD_DATE: "2027-03-01" })).toBe("2027-03-01");
    expect(buildDate({ EMUNAS_BUILD_DATE: "soon" }, new Date("2026-11-15T23:30:00Z"))).toBe("2026-11-15");
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

  it("lists sections in catalog order, Yiddish, then English, then uncatalogued, skipping empty ones", () => {
    const m = contentsModel(corpus, "en");
    const listed = [...m.yiddish, ...m.english, ...m.uncatalogued];
    const expected = corpus.sections.sections.filter((s) => s.count > 0).map((s) => s.key);
    // Yiddish guide sections come before English ones in the guide itself
    expect(listed.map((s) => s.key)).toEqual(expected);
    expect(m.yiddish.every((s) => s.lang === "yi" && !s.uncatalogued)).toBe(true);
    expect(m.english.every((s) => s.lang === "en" && !s.uncatalogued)).toBe(true);
    expect(m.uncatalogued.every((s) => s.uncatalogued)).toBe(true);
    expect(listed.some((s) => s.count === 0)).toBe(false);
  });

  it("puts every shiur on exactly one section page", () => {
    const seen = new Map<string, number>();
    for (const s of sectionSummaries(corpus)) {
      const page = sectionModel(corpus, s.slug, "yi");
      expect(page, s.slug).not.toBeNull();
      for (const r of page!.rows) seen.set(r.id, (seen.get(r.id) ?? 0) + 1);
      expect(page!.rows.map((r) => r.id)).toEqual(s.shiurIds);
    }
    expect([...seen.keys()].sort()).toEqual(corpus.index.shiurim.map((r) => r.id).sort());
    expect([...seen.values()].every((n) => n === 1)).toBe(true);
  });

  it("shows no AI text on catalog-only rows, and the edition's one-liner on rows with notes", () => {
    for (const ed of ["yi", "en"] as const) {
      for (const r of corpus.index.shiurim) {
        const row = catalogRow(r, ed, corpus.audio);
        if (r.status !== "full") expect(row.oneLiner, r.id).toBeNull();
        else expect(row.oneLiner, r.id).toBe(r.oneLiner![ed]);
      }
    }
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

  it("keeps small sections flat", () => {
    expect(sectionModel(corpus, "shonos", "yi")!.layout.kind).toBe("flat");
  });

  it("builds series pages with parts in order, perek groups and the sibling link", () => {
    const tanya = seriesModel(corpus, "tanya-yi", "yi")!;
    expect(tanya.rows.map((r) => r.part)).toEqual([1, 2, 3, 4]);
    expect(tanya.groups!.map((g) => g.perek)).toEqual(["א", "ב", "י\"ב", "י\"ח"]);
    expect(tanya.sibling).toMatchObject({ id: "tanya-en", href: "/yi/series/tanya-en/" });
    expect(tanya.sections.map((s) => s.key)).toEqual(["pocket-guide-2012:tanya-1", "pocket-guide-2012:tanya-2"]);
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
    expect(t.full).toBe(corpus.build.counts.full);
  });
});

// ------------------------------------------------------------------ this week

describe("this week", () => {
  let corpus: CatalogCorpus;
  beforeAll(() => {
    corpus = buildInto(REAL_DATA, REAL_POLICY);
  });

  it("names the parsha of the week and the nearest zman that has shiurim", () => {
    // Sunday 5 Kislev 5787: Vayeitzei is read on the coming Shabbos; Chanukah is the next zman with shiurim.
    const w = thisWeekModel(corpus, "en", "2026-11-15");
    expect(w.hebrewDate).toBe("5 Kislev 5787");
    expect(w.parsha).toMatchObject({ kind: "parsha", key: "vayeitzei", label: "Vayeitzei", href: "/en/calendar/parsha/vayeitzei/" });
    expect(w.parsha!.rows.length).toBe(Math.min(THIS_WEEK_LIMIT, w.parsha!.count));
    expect(w.zman).toMatchObject({ kind: "zman", key: "chanukah", active: false, href: "/en/calendar/zman/chanukah/" });
    const yi = thisWeekModel(corpus, "yi", "2026-11-15");
    expect(yi.hebrewDate).toBe("ה' כסלו תשפ\"ז");
    expect(yi.parsha!.label).toMatch(/[א-ת]/);
  });

  it("marks a zman as current while its window is open", () => {
    const date = calendar.occasionWindows("chanukah")[0]!.start;
    const w = thisWeekModel(corpus, "en", date);
    expect(w.zman).toMatchObject({ key: "chanukah", active: true });
  });

  it("degrades to nothing past the end of the calendar table", () => {
    const empty = createCalendar({ ...calendar.table, shabbosos: [], occasions: [], months: [] } as typeof calendar.table);
    const w = thisWeekModel(corpus, "en", "2026-11-15", empty);
    expect(w.parsha).toBeNull();
    expect(w.zman).toBeNull();
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
    const got = new Map(sectionSummaries(corpus).map((s) => [s.key, s.count]));
    expect(got).toEqual(want);
    // and the per-category totals of the ingest stats
    const byCategory = new Map<string, number>();
    for (const s of sectionSummaries(corpus)) {
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
    expect(seriesModel(corpus, "tanya-yi", "en")!.sibling?.id).toBe("tanya-en");
  });

  it("catalog-only rows carry no AI text on any section or series page", () => {
    for (const ed of ["yi", "en"] as const) {
      const rows: CatalogRow[] = [
        ...sectionSummaries(corpus).flatMap((s) => sectionModel(corpus, s.slug, ed)!.rows),
        ...seriesSummaries(corpus, ed).flatMap((s) => seriesModel(corpus, s.id, ed)!.rows),
      ];
      expect(rows.length).toBeGreaterThan(997);
      for (const r of rows) if (r.status !== "full") expect(r.oneLiner, r.id).toBeNull();
    }
  });

  it("greys rows that have no recording that can be played", () => {
    const rows = sectionSummaries(corpus).flatMap((s) => sectionModel(corpus, s.slug, "en")!.rows);
    const unplayable = rows.filter((r) => !r.playable).map((r) => r.id);
    const expected = corpus.index.shiurim
      .filter((r) => !r.recordingIds.some((id) => corpus.audio[id]?.playable))
      .map((r) => r.id);
    expect(unplayable.sort()).toEqual(expected.sort());
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
    n: "12",
    uncatalogued: false,
    derived: "catalog",
    parsha: null,
    zman: { key: "chanukah", raw: "חנוכה" },
    perek: null,
    years: [5743],
    duration: 2700,
    playable: true,
    oneLiner: "The Rav explains the lights.",
  };

  it("renders a captioned table with scoped headers, the title as a bdi run, and the notes cell", async () => {
    const html = await container.renderToString(CatalogTable, {
      props: { ed: "en", rows: [base], caption: "Chanukah: the shiurim in catalog order", occasion: true, notes: true },
    });
    expect(html).toContain("<caption");
    expect(html).toMatch(/<th scope="col"[^>]*>No\.<\/th>/);
    expect(html).toMatch(/<th scope="row"/);
    expect(html).toContain('<a href="/en/shiur/yi-x-01/"><bdi lang="yi" dir="rtl">זמן התחלת התנוצצות</bdi></a>');
    expect(html).toContain("The Rav explains the lights.");
    expect(html).toContain('data-year="5743"');
    expect(html).not.toContain("no-recording");
  });

  it("leaves the notes cell empty for a catalog-only row, greys a row without a playable recording, marks uncatalogued rows", async () => {
    const row: CatalogRow = { ...base, status: "catalog-only", oneLiner: null, playable: false, uncatalogued: true, derived: "filename" };
    const html = await container.renderToString(CatalogTable, {
      props: { ed: "yi", rows: [row], caption: "x", notes: true },
    });
    expect(html).toMatch(/<td class="col-notes" lang="yi"><\/td>/);
    expect(html).toContain("no-recording");
    expect(html).toContain("קיין רעקארדירונג אויפן נעץ");
    expect(html).toContain('class="unc-mark"');
    expect(html).toContain("נישט אינעם גייד פון 2012");
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
