import { describe, expect, it } from "vitest";
import { LIVE_DATA_SCHEMA_VERSION, type CorpusFile, type CorpusRow, type StoryRow } from "../live-data.ts";
import { byYear, groupByShiur, personSplit, queueItems, rowsById, yearHistogram } from "../model.ts";
import { filterStories, personFromQuery, personSearch, playableStories, storyPeople } from "../../maasios/model.ts";

function row(id: string, years: number[], entities: Partial<CorpusRow["entities"]> = {}): CorpusRow {
  return {
    id,
    rev: "r",
    lang: id.startsWith("en") ? "en" : "yi",
    category: "parsha",
    status: "full",
    perek: null,
    years,
    duration: 1000,
    oneLiner: null,
    title: id,
    heading: null,
    sectionTitle: "s",
    derived: "catalog",
    parsha: null,
    zman: null,
    series: null,
    entities: { works: [], people: [], concepts: [], ...entities },
    counts: { chapters: 0, stories: 0, questions: 0, insights: 0 },
  } as CorpusRow;
}

function story(id: string, people: string[], t: number | null = 10, lang: "yi" | "en" = "yi"): StoryRow {
  return { id, shiurId: id.split("~")[0]!, title: { en: id, yi: id }, peopleKeys: people, t, end: t === null ? null : t + 60, year: null, lang };
}

const corpus = (rows: CorpusRow[]): CorpusFile => ({
  schemaVersion: LIVE_DATA_SCHEMA_VERSION,
  buildId: "b",
  counts: { total: rows.length, full: rows.length, catalogOnly: 0, downgraded: 0 } as CorpusFile["counts"],
  shiurim: rows,
});

describe("person split", () => {
  const rows = [
    row("yi-a-01", [5750], { works: ["chasam-sofer"], people: ["chasam-sofer"] }),
    row("yi-b-01", [5740], { people: ["chasam-sofer"] }),
    row("en-c-01", [], { people: [] }),
    row("yi-d-01", [5760], { works: ["chasam-sofer"] }),
    row("yi-e-01", [5730], {}),
  ];
  const stories = [story("en-c-01~st0", ["chasam-sofer", "baal-shem-tov"]), story("yi-e-01~st2", ["baal-shem-tov"]), story("yi-b-01~st1", ["chasam-sofer"])];

  it("cited = shiurim citing the person's sefer; in stories = stories with the person; discussed = listed among the people", () => {
    const split = personSplit("chasam-sofer", { shiurIds: ["yi-b-01", "yi-a-01", "en-c-01"] }, corpus(rows), stories);
    expect(split.cited.map((r) => r.id)).toEqual(["yi-a-01", "yi-d-01"]);
    expect(split.inStories.map((s) => s.id)).toEqual(["en-c-01~st0", "yi-b-01~st1"]);
    // en-c-01 is in the entity only through its story, so it is not "discussed"
    expect(split.discussed.map((r) => r.id)).toEqual(["yi-b-01", "yi-a-01"]);
  });

  it("never drops a shiur of the entity that has no other reason to be there", () => {
    const split = personSplit("x", { shiurIds: ["yi-e-01"] }, corpus(rows), []);
    expect(split.discussed.map((r) => r.id)).toEqual(["yi-e-01"]);
  });
});

describe("helpers", () => {
  it("byYear puts undated last and keeps ties stable", () => {
    expect(byYear([row("a", []), row("b", [5760, 5740]), row("c", [5750]), row("d", [5740])]).map((r) => r.id)).toEqual(["b", "d", "c", "a"]);
  });

  it("rowsById is cached per corpus file", () => {
    const c = corpus([row("yi-a-01", [])]);
    expect(rowsById(c)).toBe(rowsById(c));
    expect(rowsById(c).get("yi-a-01")?.id).toBe("yi-a-01");
  });

  it("groups moments by shiur in first-seen order", () => {
    const m = (id: string) => ({ id, shiurId: id.split("~")[0]!, kind: "i" as const, t: 1, end: 2 });
    expect(groupByShiur([m("a~i0"), m("b~i1"), m("a~i2")]).map((g) => [g.shiurId, g.moments.map((x) => x.id)])).toEqual([
      ["a", ["a~i0", "a~i2"]],
      ["b", ["b~i1"]],
    ]);
  });

  it("year histogram sorts years and counts the undated", () => {
    expect(yearHistogram({ "5760": 2, unknown: 3, "5740": 1 })).toEqual({
      bars: [
        { year: 5740, count: 1 },
        { year: 5760, count: 2 },
      ],
      unknown: 3,
      max: 3,
    });
    expect(yearHistogram({})).toEqual({ bars: [], unknown: 0, max: 0 });
  });

  it("queue items keep timed moments only, with their end", () => {
    expect(queueItems([story("a~st0", [], 5), story("b~st1", [], null)])).toEqual([{ shiurId: "a", start: 5, end: 65, momentId: "a~st0" }]);
  });
});

describe("maasios model", () => {
  const all = [story("a~st0", ["bst", "maggid"]), story("b~st0", ["bst"], 20, "en"), story("c~st0", [], null), story("d~st0", ["maggid", "maggid"])];

  it("counts stories per person (most first, a person once per story)", () => {
    expect(storyPeople(all)).toEqual([
      { key: "bst", count: 2 },
      { key: "maggid", count: 2 },
    ]);
  });

  it("filters by person and audio language", () => {
    expect(filterStories(all, { person: "bst", audio: "both" }).map((s) => s.id)).toEqual(["a~st0", "b~st0"]);
    expect(filterStories(all, { person: "bst", audio: "yi" }).map((s) => s.id)).toEqual(["a~st0"]);
    expect(filterStories(all, { person: null, audio: "en" }).map((s) => s.id)).toEqual(["b~st0"]);
    expect(playableStories(all).map((s) => s.id)).toEqual(["a~st0", "b~st0", "d~st0"]);
  });

  it("keeps the person in the query string with other parameters", () => {
    expect(personFromQuery("?p=bst&audio=yi")).toBe("bst");
    expect(personFromQuery("?p=")).toBeNull();
    expect(personSearch("?audio=yi", "bst")).toBe("?audio=yi&p=bst");
    expect(personSearch("?p=bst", null)).toBe("");
  });
});
