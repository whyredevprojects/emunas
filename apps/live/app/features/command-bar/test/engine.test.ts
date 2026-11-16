/**
 * The client engine: suggestions (corpus entities by id, occasions, series, years), "Tanya 12" from a
 * series file, and shiur-level matching with the shipped MiniSearch dump and the clean synonym table.
 * No network is involved: the engine works from files the service worker has cached, and never from
 * corpus.json.
 */
import { describe, expect, it } from "vitest";
import { LIVE_DATA_SCHEMA_VERSION } from "../../../data/index.ts";
import {
  createQuickSearch,
  perekNumbers,
  readEntities,
  seriesPartSuggestions,
  yearCandidates,
  type QuickSearch,
  type Suggestion,
} from "../engine.ts";
import { ENTITIES, FACETS, quickIndexFile, TANYA } from "./data.ts";

const engine = (ui: "en" | "yi" = "en") => createQuickSearch({ ui, quick: quickIndexFile(ui), facets: FACETS });

const keyOf = (s: Suggestion): string => {
  switch (s.type) {
    case "series-part":
      return `${s.type}:${s.seriesKey}:${s.how}:${s.n}:${s.shiurId}`;
    case "year":
      return `year:${s.year}`;
    case "entity":
      return `${s.kind}:${s.id}`;
    default:
      return `${s.type}:${s.key}`;
  }
};
const keys = (xs: Suggestion[]) => xs.map(keyOf);
const ids = (e: QuickSearch, q: string) => e.shiurs(q).map((h) => h.shiurId);

describe("engine construction", () => {
  it("needs a MiniSearch dump; a placeholder index is an error, not a silent rebuild", () => {
    expect(() =>
      createQuickSearch({
        ui: "en",
        quick: { schemaVersion: LIVE_DATA_SCHEMA_VERSION, lang: "en", options: { fields: ["title"], storeFields: [], idField: "id" }, index: null, entities: [] },
        facets: FACETS,
      }),
    ).toThrow();
  });

  it("works without facets.json (entities and shiur matching only)", () => {
    const e = createQuickSearch({ ui: "en", quick: quickIndexFile("en"), facets: null });
    expect(e.shiurs("teivah")[0]).toMatchObject({ shiurId: "en-parsha-noach-01", title: "The Holiness of the Teivah", lang: "en" });
    expect(keys(e.suggest("hester"))).toEqual(["topic:hester-panim"]);
    expect(e.seriesTargets("Tanya 12")).toEqual([]);
  });

  it("reads the quick index's entities defensively", () => {
    const bad = [
      ...ENTITIES.slice(0, 1),
      { kind: "story", id: "x", labels: { en: "A story" }, synonyms: [], count: 2 },
      { kind: "person", id: "", labels: { en: "No id" }, synonyms: [], count: 2 },
      { kind: "person", id: "no-labels", labels: {}, synonyms: [], count: 2 },
      { kind: "person", id: "no-shiurim", labels: { en: "Nobody" }, synonyms: [], count: 0 },
      { kind: "work", id: "loose", labels: { en: "Loose" }, synonyms: [3, "ok"], count: 1, extra: "ignored" },
    ];
    const read = readEntities({ ...quickIndexFile("en"), entities: bad as never });
    expect(read.map((e) => `${e.kind}:${e.id}`)).toEqual(["topic:hester-panim", "work:loose"]);
    expect(read[1]).toEqual({ kind: "work", id: "loose", labels: { he: null, en: "Loose", yi: null }, synonyms: ["ok"], count: 1 });
    expect(readEntities({ ...quickIndexFile("en"), entities: undefined as never })).toEqual([]);
  });
});

describe("shiur-level matching", () => {
  const e = engine();

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

  it("expands a query with the clean synonym table: a display synonym finds the entity's canonical name", () => {
    // "holiness" is a display synonym of the concept Kedushah; the canonical form קדושה is in the title.
    expect(e.normalize("holiness").entities.map((x) => `${x.kind}:${x.id}`)).toEqual(["concept:kedushah"]);
    expect(ids(e, "holiness")).toContain("en-misc-kedushah-01");
  });

  it("reports which fields matched and the stored audio language", () => {
    const hit = e.shiurs("lag baomer")[0]!;
    expect(hit.fields).toContain("occasion");
    expect(hit.lang).toBe("yi");
    expect(hit.title).toBe("ל\"ג בעומר תשמ\"ג");
  });

  it("returns nothing for empty or unmatched queries", () => {
    expect(e.shiurs("   ")).toEqual([]);
    expect(e.shiurs("zzzzqqq")).toEqual([]);
  });
});

describe("suggestions", () => {
  const e = engine();

  it("occasions in English, Hebrew and Yiddish spellings", () => {
    for (const q of ["lag baomer", "ל\"ג בעומר", "Lag"]) expect(keys(e.suggest(q)), q).toContain("occasion:lag-baomer");
    expect(keys(e.suggest("noach"))).toEqual(expect.arrayContaining(["occasion:noach", "person:noach"]));
    expect(keys(e.suggest("parshas noach"))[0]).toBe("occasion:noach");
  });

  it("'hester' suggests the topic, by corpus id", () => {
    const sg = e.suggest("hester");
    expect(keys(sg)).toEqual(["topic:hester-panim"]);
    expect(sg[0]).toMatchObject({ type: "entity", kind: "topic", id: "hester-panim", count: 2 });
    expect(keys(e.suggest("הסתר"))).toEqual(["topic:hester-panim"]);
    // a display synonym (never shown) finds it too
    expect(keys(e.suggest("hiding of the face"))).toEqual(["topic:hester-panim"]);
  });

  it("people, sefarim and glossary entries by prefix and by clean synonym, keyed by corpus id", () => {
    expect(keys(e.suggest("rabbi shim"))).toContain("person:rabbi-shimon-bar-yochai");
    expect(keys(e.suggest("rashbi"))).toEqual(["person:rabbi-shimon-bar-yochai"]);
    expect(keys(e.suggest("rambam"))).toContain("work:mishneh-torah");
    expect(keys(e.suggest("רמב\"ם"))).toContain("work:mishneh-torah");
    expect(keys(e.suggest("קדוש"))).toContain("concept:kedushah");
    expect(keys(e.suggest("the besht"))).toEqual(["person:baal-shem-tov"]);
    expect(keys(e.suggest("baal shem"))).toEqual(["person:baal-shem-tov"]);
  });

  it("'Hashem Tov' (an ASR mishearing of the Baal Shem Tov) suggests nothing", () => {
    for (const q of ["Hashem Tov", "hashem tov", "השם טוב"]) expect(keys(e.suggest(q)), q).toEqual([]);
  });

  it("no string-keyed entity suggestions: facets' work/person/concept tables are not a source", () => {
    // `rabbi-shimon` exists only in facets.json, `kedushah` there and in the quick index.
    const all = keys(e.suggest("rabbi shimon")).concat(keys(e.suggest("kedushah")));
    expect(all).not.toContain("person:rabbi-shimon");
    expect(all.every((k) => !k.startsWith("work:rambam"))).toBe(true);
  });

  it("years as digits, Hebrew letters or a civil year, only when shiurim exist", () => {
    expect(keys(e.suggest("5736"))).toEqual(["year:5736"]);
    expect(keys(e.suggest("תשל\"ו"))).toEqual(["year:5736"]);
    expect(keys(e.suggest("1976"))).toEqual(["year:5736"]);
    expect(keys(e.suggest("5700"))).toEqual([]);
  });

  it("caps the list and limits each kind to three", () => {
    expect(e.suggest("noach", 1)).toHaveLength(1);
    expect(e.suggest("")).toEqual([]);
    const many = createQuickSearch({
      ui: "en",
      quick: quickIndexFile(
        "en",
        ["a", "b", "c", "d"].map((x) => ({ kind: "person" as const, id: `rabbi-${x}`, labels: { he: null, en: `Rabbi Moshe ${x}`, yi: null }, synonyms: [], count: 3 })),
      ),
      facets: null,
    });
    expect(many.suggest("moshe")).toHaveLength(3);
  });

  it("the Yiddish engine suggests the same entities", () => {
    const yi = engine("yi");
    expect(keys(yi.suggest("לג בעומר"))).toContain("occasion:lag-baomer");
    expect(keys(yi.suggest("הסתר פנים"))).toEqual(["topic:hester-panim"]);
  });

  it("looks up a suggestible entity by kind and corpus id", () => {
    expect(e.entity("topic", "hester-panim")?.labels.en).toBe("Hester Panim and Suffering");
    expect(e.entity("person", "hester-panim")).toBeUndefined();
  });
});

describe("Tanya 12", () => {
  const e = engine();

  it("names the series from facets.json", () => {
    expect(e.seriesTargets("Tanya 12")).toEqual([{ seriesKey: "tanya-yi", label: FACETS.series["tanya-yi"]!.label, lang: "yi", n: 12 }]);
    expect(e.seriesTargets("תניא י\"ב").map((t) => t.n)).toEqual([12]);
    expect(e.seriesTargets("Tanya")).toEqual([]);
    expect(e.seriesTargets("noach 3")).toEqual([]);
  });

  it("finds the part covering a perek, and part n, in the series file", () => {
    const parts = (q: string) => e.seriesTargets(q).flatMap((t) => keys(seriesPartSuggestions(TANYA, t)));
    expect(parts("Tanya 12")).toEqual(["series-part:tanya-yi:perek:12:yi-tanya-1-03"]);
    expect(parts("tanya 1")).toEqual(["series-part:tanya-yi:perek:1:yi-tanya-1-02", "series-part:tanya-yi:part:1:yi-tanya-1-01"]);
    expect(parts("tanya 3")).toEqual(["series-part:tanya-yi:part:3:yi-tanya-1-03"]);
    expect(parts("tanya 40")).toEqual([]);
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
