import { describe, expect, it } from "vitest";
import { LIVE_DATA_SCHEMA_VERSION, type CorpusFile, type CorpusRow, type PersonDetail, type PersonStory, type StoryRow } from "../live-data.ts";
import { alsoCalled, byYear, groupByShiur, personGroups, personNames, queueItems, rowsById, yearHistogram } from "../model.ts";

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

const person = (over: Partial<PersonDetail> = {}): PersonDetail => ({
  kind: "person",
  id: "chasam-sofer",
  names: { he: "חתם סופר", en: "the Chasam Sofer", yi: "דער חתם סופר" },
  aliases: [],
  description: null,
  works: [],
  cited: [],
  stories: [],
  ...over,
});

describe("person groups", () => {
  const rows = [row("yi-a-01", [5750]), row("yi-b-01", [5740]), row("en-c-01", []), row("yi-d-01", [5760]), row("yi-e-01", [5730])];
  const st = (id: string, tellings: number, page: boolean): PersonStory => ({
    id,
    title: { en: id, yi: id },
    tellings,
    page,
    first: { shiurId: "yi-a-01", momentId: "yi-a-01~st0", t: 10 },
  });

  it("cited = shiurim citing his seforim; stories = his merged stories as given; discussed = his shiurim, by year", () => {
    const g = personGroups(
      { shiurIds: ["yi-b-01", "yi-a-01", "en-c-01"], person: person({ cited: ["yi-d-01", "yi-a-01", "no-such-shiur"], stories: [st("s1", 3, true), st("s2", 1, false)] }) },
      corpus(rows),
    );
    expect(g.cited.map((r) => r.id)).toEqual(["yi-a-01", "yi-d-01"]);
    expect(g.stories.map((x) => x.id)).toEqual(["s1", "s2"]);
    expect(g.discussed.map((r) => r.id)).toEqual(["yi-b-01", "yi-a-01", "en-c-01"]);
  });

  it("reads a file without person details as discussed only", () => {
    const g = personGroups({ shiurIds: ["yi-e-01"] }, corpus(rows));
    expect(g).toEqual({ cited: [], stories: [], discussed: [rows[4]] });
  });

  it("shows each name once and only aliases that are not already a name", () => {
    expect(personNames({ he: "רש\"י", en: "Rashi", yi: "רש\"י" })).toEqual([
      { lang: "he", text: "רש\"י" },
      { lang: "en", text: "Rashi" },
    ]);
    expect(personNames({ he: "", en: "Onkelos", yi: " " })).toEqual([{ lang: "en", text: "Onkelos" }]);
    expect(alsoCalled(person({ aliases: ["Chasam Sofer", "the Chasam Sofer", " ", "Rabbi Moshe Sofer", "Chasam Sofer"] }))).toEqual([
      "Chasam Sofer",
      "Rabbi Moshe Sofer",
    ]);
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
