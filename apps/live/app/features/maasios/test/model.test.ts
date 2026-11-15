import { describe, expect, it } from "vitest";
import type { StoryIndexRow, StoryPlay } from "../../../data/index.ts";
import {
  apartByStory,
  choosePlay,
  chooseTelling,
  facetSearch,
  facetsFromQuery,
  filterStories,
  heardCount,
  personCounts,
  storiesOnlyQueue,
  storyTopics,
  topicChains,
  topicOptions,
} from "../model.ts";

const play = (lang: "en" | "yi", shiurId: string, t: number | null = 10): StoryPlay => ({
  lang,
  shiurId,
  momentId: `${shiurId}~st0`,
  t,
  end: t === null ? null : t + 60,
});

function row(id: string, o: Partial<StoryIndexRow> = {}): StoryIndexRow {
  const plays = o.plays ?? [play("yi", `${id}-yi`)];
  return {
    id,
    title: { en: id, yi: id },
    people: [],
    names: [],
    topics: [],
    tellings: plays.length,
    langs: [...new Set(plays.map((p) => p.lang))],
    page: plays.length > 1,
    first: { shiurId: plays[0]!.shiurId, momentId: plays[0]!.momentId, t: plays[0]!.t },
    ...o,
    plays,
  };
}

const nodes = [
  { id: "zmanim", parentId: null, level: 1 },
  { id: "pesach", parentId: "zmanim", level: 2 },
  { id: "seder", parentId: "pesach", level: 3 },
  { id: "emunah", parentId: null, level: 1 },
];

describe("facets in the query string", () => {
  it("reads person, topic and told-more-than-once; ignores the rest", () => {
    expect(facetsFromQuery("?p=bst&topic=pesach&many=1&audio=yi")).toEqual({ person: "bst", topic: "pesach", many: true });
    expect(facetsFromQuery("?p=&topic=&many=0")).toEqual({ person: null, topic: null, many: false });
  });

  it("changes one facet and keeps other parameters", () => {
    expect(facetSearch("?audio=yi", { person: "bst" })).toBe("?audio=yi&p=bst");
    expect(facetSearch("?p=bst&many=1", { many: false })).toBe("?p=bst");
    expect(facetSearch("?p=bst", { person: null })).toBe("");
    expect(facetSearch("", { topic: "pesach", many: true })).toBe("?topic=pesach&many=1");
  });
});

describe("filtering", () => {
  const chains = topicChains(nodes);
  const all = [
    row("a", { people: ["bst", "maggid"], topics: ["seder"] }),
    row("b", { people: ["bst"], plays: [play("en", "b-en"), play("yi", "b-yi")], topics: ["emunah"] }),
    row("c", { names: ["Reb Mendel"], plays: [play("en", "c-en")] }),
  ];

  it("a topic matches its own stories and those of its sub-topics", () => {
    expect([...storyTopics(all[0]!, chains)].sort()).toEqual(["pesach", "seder", "zmanim"]);
    expect(filterStories(all, { person: null, topic: "zmanim", many: false, audio: "both" }, chains).map((r) => r.id)).toEqual(["a"]);
    expect(filterStories(all, { person: null, topic: "seder", many: false, audio: "both" }, chains).map((r) => r.id)).toEqual(["a"]);
  });

  it("by person, told more than once, and audio language (a story with a telling in it)", () => {
    expect(filterStories(all, { person: "bst", topic: null, many: false, audio: "both" }).map((r) => r.id)).toEqual(["a", "b"]);
    expect(filterStories(all, { person: null, topic: null, many: true, audio: "both" }).map((r) => r.id)).toEqual(["b"]);
    expect(filterStories(all, { person: null, topic: null, many: false, audio: "en" }).map((r) => r.id)).toEqual(["b", "c"]);
    expect(filterStories(all, { person: "bst", topic: null, many: false, audio: "yi" }).map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("counts merged people only (raw names are never a facet), most stories first", () => {
    expect(personCounts(all)).toEqual([
      { id: "bst", count: 2 },
      { id: "maggid", count: 1 },
    ]);
  });

  it("topic options in tree order, counted with sub-topics, empty ones left out", () => {
    expect(topicOptions(all, nodes)).toEqual([
      { id: "zmanim", level: 1, count: 1 },
      { id: "pesach", level: 2, count: 1 },
      { id: "seder", level: 3, count: 1 },
      { id: "emunah", level: 1, count: 1 },
    ]);
    expect(topicOptions([all[2]!], nodes)).toEqual([]);
  });
});

describe("which telling plays", () => {
  const r = row("b", { plays: [play("en", "b-en"), play("yi", "b-yi")] });

  it("the language filter first, otherwise the overall best (the emitter's order)", () => {
    expect(choosePlay(r, "yi")?.shiurId).toBe("b-yi");
    expect(choosePlay(r, "en")?.shiurId).toBe("b-en");
    expect(choosePlay(r, "both")?.shiurId).toBe("b-en");
    expect(choosePlay(row("y"), "en")).toBeNull();
    expect(choosePlay(row("u", { plays: [play("yi", "u", null)] }), "both")).toBeNull();
  });

  it("on a story page: the filter's language, then the page order, skipping untimed tellings", () => {
    const ts = [
      { lang: "yi" as const, t: null, id: 1 },
      { lang: "en" as const, t: 5, id: 2 },
      { lang: "yi" as const, t: 9, id: 3 },
    ];
    expect(chooseTelling(ts, "both")?.id).toBe(2);
    expect(chooseTelling(ts, "yi")?.id).toBe(3);
    expect(chooseTelling(ts.slice(0, 1), "yi")).toBeNull();
  });
});

describe("stories-only queue", () => {
  const rows = [
    row("a"),
    row("b", { plays: [play("en", "b-en", 100), play("yi", "b-yi", 200)] }),
    row("c", { plays: [play("en", "c-en", null)] }),
    row("d", { plays: [play("en", "d-en", 30)] }),
  ];

  it("one telling per story, chosen as on the card, untimed stories left out", () => {
    const q = storiesOnlyQueue(rows, "both", new Set());
    expect(q.map((x) => [x.storyId, x.shiurId, x.start, x.end])).toEqual([
      ["a", "a-yi", 10, 70],
      ["b", "b-en", 100, 160],
      ["d", "d-en", 30, 90],
    ]);
    expect(storiesOnlyQueue(rows, "yi", new Set()).map((x) => x.shiurId)).toEqual(["a-yi", "b-yi"]);
  });

  it("skips stories heard in this visit", () => {
    const heard = new Set(["a", "d"]);
    expect(storiesOnlyQueue(rows, "both", heard).map((x) => x.storyId)).toEqual(["b"]);
    expect(heardCount(rows, heard)).toBe(2);
  });

  it("never two tellings of one story back to back, even when a story is listed twice", () => {
    const twice = [rows[1]!, rows[1]!, rows[0]!];
    const q = storiesOnlyQueue(twice, "both", new Set());
    expect(q.map((x) => x.storyId)).toEqual(["b", "a"]);
  });

  it("apartByStory separates tellings of one story and keeps the order otherwise", () => {
    const items = ["x", "x", "y", "x", "z", "z"].map((storyId, i) => ({ storyId, i }));
    const out = apartByStory(items);
    expect(out.map((o) => o.storyId)).toEqual(["x", "y", "x", "z", "x", "z"]);
    for (let i = 1; i < out.length; i++) expect(out[i]!.storyId).not.toBe(out[i - 1]!.storyId);
    expect(apartByStory([])).toEqual([]);
  });
});
