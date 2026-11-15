/**
 * The client engine: suggestions (entities, occasions, "Tanya 12", years) and shiur-level matching,
 * with the shipped MiniSearch dump and with the rebuild from corpus.json. No network is involved: the
 * engine works from files the service worker has cached.
 */
import { describe, expect, it } from "vitest";
import { LIVE_DATA_SCHEMA_VERSION } from "../../../data/index.ts";
import { createQuickSearch, perekNumbers, yearCandidates, type QuickSearch, type Suggestion } from "../engine.ts";
import { CORPUS, FACETS, quickIndexFile } from "./data.ts";

const shipped = (ui: "en" | "yi" = "en") => createQuickSearch({ ui, quick: quickIndexFile(ui), corpus: CORPUS, facets: FACETS });
const rebuilt = (ui: "en" | "yi" = "en") => createQuickSearch({ ui, quick: null, corpus: CORPUS, facets: FACETS });

const keys = (xs: Suggestion[]) =>
  xs.map((s) => (s.type === "series-part" ? `${s.type}:${s.seriesKey}:${s.how}:${s.n}:${s.shiurId}` : s.type === "year" ? `year:${s.year}` : `${s.type}:${s.key}`));
const ids = (e: QuickSearch, q: string) => e.shiurs(q).map((h) => h.shiurId);

describe("engine construction", () => {
  it("uses the shipped index when it is a MiniSearch dump", () => {
    expect(shipped().shippedIndex).toBe(true);
  });

  it("rebuilds from corpus.json when the quick index is missing or a placeholder", () => {
    expect(rebuilt().shippedIndex).toBe(false);
    const placeholder = createQuickSearch({
      ui: "en",
      quick: { schemaVersion: LIVE_DATA_SCHEMA_VERSION, lang: "en", options: { fields: ["title"], storeFields: ["title"], idField: "id" }, index: { fixture: true } },
      corpus: CORPUS,
      facets: FACETS,
    });
    expect(placeholder.shippedIndex).toBe(false);
    expect(ids(placeholder, "teivah")).toEqual(["en-parsha-noach-01"]);
  });

  it("fails only when neither the index nor the corpus is available", () => {
    expect(() => createQuickSearch({ ui: "en", quick: null, corpus: null, facets: FACETS })).toThrow();
    expect(createQuickSearch({ ui: "en", quick: quickIndexFile("en"), corpus: null, facets: null }).shiurs("teivah")[0]).toMatchObject({
      shiurId: "en-parsha-noach-01",
      title: "The Holiness of the Teivah",
    });
  });
});

describe.each([
  ["shipped", shipped],
  ["rebuilt", rebuilt],
])("shiur-level matching (%s index)", (_name, make) => {
  const e = make();

  it("matches catalog titles, with the last word as a prefix", () => {
    expect(ids(e, "holiness teiv")).toEqual(["en-parsha-noach-01"]);
    expect(ids(e, "קדושה")).toContain("en-misc-kedushah-01");
  });

  it("matches generated one-liners in the interface language", () => {
    expect(ids(e, "tzaddikim")).toEqual(["en-misc-kedushah-01"]);
  });

  it("matches an occasion in any spelling (alias expansion + folding)", () => {
    for (const q of ["lag baomer", "ל\"ג בעומר", "לג בעומר"]) expect(ids(e, q), q).toEqual(["yi-zmanim-lag-01"]);
    expect(ids(e, "parshas noach")).toContain("en-parsha-noach-01");
    expect(ids(e, "נח")).toContain("en-parsha-noach-01");
  });

  it("reports which fields matched", () => {
    const hit = e.shiurs("lag baomer")[0]!;
    expect(hit.fields).toContain("occasion");
    expect(hit.lang).toBe("yi");
  });

  it("returns nothing for empty or unmatched queries", () => {
    expect(e.shiurs("   ")).toEqual([]);
    expect(e.shiurs("zzzzqqq")).toEqual([]);
  });
});

describe("suggestions", () => {
  const e = shipped();

  it("occasions in English, Hebrew and Yiddish spellings", () => {
    for (const q of ["lag baomer", "ל\"ג בעומר", "Lag"]) expect(keys(e.suggest(q)), q).toContain("occasion:lag-baomer");
    expect(keys(e.suggest("noach"))).toEqual(expect.arrayContaining(["occasion:noach", "person:noach"]));
    expect(keys(e.suggest("parshas noach"))[0]).toBe("occasion:noach");
  });

  it("sefarim, people and inyanim by prefix", () => {
    expect(keys(e.suggest("ramb"))).toContain("work:rambam");
    expect(keys(e.suggest("רמב\"ם"))).toContain("work:rambam");
    expect(keys(e.suggest("rabbi shim"))).toContain("person:rabbi-shimon");
    expect(keys(e.suggest("קדוש"))).toContain("concept:קדושה");
  });

  it("'Tanya 12' finds the shiur covering perek 12; 'Tanya 3' finds part 3", () => {
    expect(keys(e.suggest("Tanya 12"))).toEqual(["series-part:tanya-yi:perek:12:yi-tanya-1-03"]);
    expect(keys(e.suggest("תניא י\"ב"))).toEqual(["series-part:tanya-yi:perek:12:yi-tanya-1-03"]);
    expect(keys(e.suggest("tanya 1"))).toEqual(["series-part:tanya-yi:perek:1:yi-tanya-1-02", "series-part:tanya-yi:part:1:yi-tanya-1-01"]);
    expect(keys(e.suggest("tanya 3")).filter((k) => k.startsWith("series-part"))).toEqual(["series-part:tanya-yi:part:3:yi-tanya-1-03"]);
    expect(keys(e.suggest("tanya 40")).filter((k) => k.startsWith("series-part"))).toEqual([]);
  });

  it("years as digits, Hebrew letters or a civil year, only when shiurim exist", () => {
    expect(keys(e.suggest("5736"))).toEqual(["year:5736"]);
    expect(keys(e.suggest("תשל\"ו"))).toEqual(["year:5736"]);
    expect(keys(e.suggest("1976"))).toEqual(["year:5736"]);
    expect(keys(e.suggest("5700"))).toEqual([]);
  });

  it("caps the list and limits each type to three", () => {
    expect(e.suggest("noach", 1)).toHaveLength(1);
    expect(e.suggest("")).toEqual([]);
  });

  it("the Yiddish engine suggests the same entities", () => {
    expect(keys(shipped("yi").suggest("לג בעומר"))).toContain("occasion:lag-baomer");
  });
});

describe("helpers", () => {
  it("perek numbers from catalog perek strings", () => {
    expect(perekNumbers("י\"א וי\"ב")).toEqual([11, 12]);
    expect(perekNumbers("א")).toEqual([1]);
    expect(perekNumbers("12")).toEqual([12]);
    expect(perekNumbers("הקדמה")).toEqual([]);
    expect(perekNumbers(null)).toEqual([]);
  });

  it("year candidates", () => {
    expect(yearCandidates("5743")).toEqual([5743]);
    expect(yearCandidates("תשמ\"ג")).toEqual([5743]);
    expect(yearCandidates("1983")).toEqual([5743, 5744]);
    expect(yearCandidates("noach")).toEqual([]);
    expect(yearCandidates("12")).toEqual([]);
  });
});
