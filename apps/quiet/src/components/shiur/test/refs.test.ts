/**
 * C2.4: the shiur page's corpus-layer line as a pure model (`refs.ts`) on a small synthetic layer:
 * the ענינים line and entry links by corpus id.
 */
import type { LayerConcept, LayerPerson, LayerShiurRefs, LayerStory, LayerTopicNode, LayerWork } from "@emunas/corpus/public";
import { pageLookupFromLayer } from "@emunas/links";
import { describe, expect, it } from "vitest";
import { entryHref, topicLine, TOPIC_LINE_MAX, type ShiurLayer } from "../refs.ts";

const flags = (quiet: boolean) => ({ quiet, live: quiet });

function topic(id: string, en: string, yi: string, page = true): LayerTopicNode {
  return { id, parentId: null, level: 2, label: { en, yi, he: yi }, count: 3, sameAs: null, reviewed: false, pages: flags(page), gateway: false };
}

function person(id: string, over: Partial<LayerPerson> = {}): LayerPerson {
  return {
    id,
    nameHe: `${id}-he`,
    nameEn: `${id}-en`,
    nameYi: `${id}-yi`,
    aliases: [],
    type: "acharon",
    group: "acharon",
    groupOrder: 4,
    description: null,
    shiurIds: [],
    count: 3,
    storyIds: [],
    worksAuthored: [],
    sameIdWork: null,
    sameAsTopic: null,
    excluded: null,
    listed: flags(true),
    pages: flags(true),
    quietAllList: false,
    reviewed: false,
    ...over,
  };
}

function concept(id: string, he: string, over: Partial<LayerConcept> = {}): LayerConcept {
  return {
    id,
    canonicalHe: he,
    label: { en: `${id} gloss`, yi: `${id} yi` },
    transliterations: [],
    definition: { en: "", yi: "" },
    shiurIds: [],
    count: 2,
    exampleRefs: [],
    passim: false,
    liveFacetDrop: false,
    mergedIntoTopic: null,
    reviewed: false,
    pages: flags(false),
    ...over,
  };
}

function work(id: string, over: Partial<LayerWork> = {}): LayerWork {
  return {
    id,
    titleHe: id,
    titleEn: id,
    aliases: [],
    authorPersonId: null,
    sefariaIndexTitle: null,
    kind: "sefer",
    generic: false,
    orderGroup: null,
    order: null,
    parentWorkId: null,
    shiurIds: [],
    count: 1,
    sameIdPerson: null,
    sameAsTopic: null,
    reviewed: false,
    pages: flags(false),
    ...over,
  };
}

const telling = (shiurId: string, i: number) => ({ shiurId, momentId: `${shiurId}~st${i}`, chapterIdx: 0, t: 10, year: null, lang: "en" as const });

function story(id: string, shiurIds: string[], over: Partial<LayerStory> = {}): LayerStory {
  return {
    id,
    title: { en: id, yi: id },
    retelling: { en: "", yi: "" },
    people: [],
    attributionVaries: false,
    tellings: shiurIds.map((s, i) => telling(s, i)),
    shiurCount: new Set(shiurIds).size,
    reviewed: false,
    pages: flags(shiurIds.length >= 2),
    ...over,
  };
}

const topics = [
  topic("emunah", "Emunah", "אמונה"),
  topic("bitachon", "Bitachon", "בטחון"),
  topic("teshuvah", "Teshuvah", "תשובה"),
  topic("shabbos", "Shabbos", "שבת"),
  topic("tefillah", "Tefillah", "תפילה"),
  topic("galus", "Galus", "גלות"),
  topic("low", "Low", "נידריג"),
  topic("pageless", "Pageless", "אן בלאט", false),
];
const people = [
  person("divrei-chaim", { nameEn: "The Divrei Chaim", nameYi: "דער דברי חיים", nameHe: "דברי חיים", aliases: ["the Sanzer Rav"] }),
  person("line-only", { pages: flags(false) }),
  person("unlisted-other", { type: "other", group: "other", listed: flags(false), pages: flags(false) }),
  person("ravs-father", { excluded: "family", listed: flags(false), pages: flags(false) }),
];
const concepts = [
  concept("ahavas-yisrael", "אהבת ישראל", { pages: flags(true) }),
  concept("bitul", "ביטול"),
  concept("bitachon-term", "בטחון", { mergedIntoTopic: "bitachon" }),
];
const works = [
  work("tanya", { pages: flags(true), orderGroup: "acharonim" }),
  work("small-sefer", { orderGroup: "rishonim" }),
  work("midrash", { kind: "genre", generic: true }),
];
const stories = [story("twice", ["s1", "s2"]), story("thrice-two-shiurim", ["s1", "s1", "s3"]), story("once", ["s1"]), story("anchor-only", ["s1", "s4"], { pages: flags(false) })];

const byId = <T extends { id: string }>(list: readonly T[]) => new Map(list.map((x) => [x.id, x]));
const maps = { topics: byId(topics), people: byId(people), concepts: byId(concepts), works: byId(works), stories: byId(stories) };

const layer: ShiurLayer = {
  topic: (id) => maps.topics.get(id),
  person: (id) => maps.people.get(id),
  concept: (id) => maps.concepts.get(id),
  work: (id) => maps.works.get(id),
  story: (id) => maps.stories.get(id),
  links: pageLookupFromLayer({ topics: { tree: topics }, concepts: { concepts }, people: { people }, works: { works }, stories: { stories } }),
};

const refs: LayerShiurRefs = {
  shiurId: "s1",
  otherSpeakerShare: 0,
  topics: [
    { id: "emunah", salience: 0.95 },
    { id: "low", salience: 0.4 },
    { id: "bitachon", salience: 0.7 },
    { id: "teshuvah", salience: 0.6 },
    { id: "missing-topic", salience: 0.9 },
    { id: "shabbos", salience: 0.65 },
    { id: "tefillah", salience: 0.8 },
    { id: "galus", salience: 0.6 },
  ],
  chapters: [{ idx: 0, topicIds: ["pageless", "low"] }],
  conceptIds: ["bitul", "ahavas-yisrael", "bitachon-term", "bitul", "no-such-concept"],
  personIds: ["line-only", "divrei-chaim", "ravs-father", "unlisted-other", "divrei-chaim", "nobody"],
  workIds: ["tanya", "small-sefer", "midrash"],
  sources: [
    { momentId: "s1~src0", workId: "tanya" },
    { momentId: "s1~src1", workId: "small-sefer" },
    { momentId: "s1~src2", workId: "midrash" },
    { momentId: "s1~src3", workId: "not-in-layer" },
  ],
  stories: [
    { momentId: "s1~st0", storyId: "twice", tellings: 2, pages: flags(true) },
    { momentId: "s1~st1", storyId: "thrice-two-shiurim", tellings: 3, pages: flags(true) },
    { momentId: "s1~st2", storyId: "once", tellings: 1, pages: flags(false) },
    { momentId: "s1~st3", storyId: "anchor-only", tellings: 2, pages: flags(false) },
    { momentId: "s1~st4", storyId: "retired-or-missing", tellings: 2, pages: flags(true) },
  ],
  insights: [],
};

describe("entryHref", () => {
  it("links a page, an index line's anchor, or nothing", () => {
    expect(entryHref("en", layer, "topic", "emunah")).toBe("/en/inyanim/emunah/");
    expect(entryHref("yi", layer, "person", "divrei-chaim")).toBe("/yi/people/divrei-chaim/");
    expect(entryHref("en", layer, "person", "line-only")).toBe("/en/people/#line-only");
    expect(entryHref("en", layer, "person", "unlisted-other")).toBeNull();
    expect(entryHref("en", layer, "person", "ravs-father")).toBeNull();
    expect(entryHref("en", layer, "person", "nobody")).toBeNull();
    expect(entryHref("en", layer, "concept", "ahavas-yisrael")).toBe("/en/erachim/ahavas-yisrael/");
    expect(entryHref("en", layer, "concept", "bitul")).toBe("/en/erachim/#bitul");
    expect(entryHref("en", layer, "work", "tanya")).toBe("/en/sources/tanya/");
    expect(entryHref("en", layer, "work", "small-sefer")).toBe("/en/sources/#small-sefer");
    expect(entryHref("en", layer, "work", "midrash")).toBeNull();
    expect(entryHref("en", layer, "story", "twice")).toBe("/en/stories/twice/");
    expect(entryHref("en", layer, "story", "once")).toBe("/en/stories/#once");
    expect(entryHref("en", layer, "thread", "any")).toBeNull();
  });

  it("sends a glossary term merged into a topic to that topic (one inyan, one entry)", () => {
    expect(entryHref("yi", layer, "concept", "bitachon-term")).toBe("/yi/inyanim/bitachon/");
  });
});

describe("topicLine", () => {
  it("prints up to five topics at salience ≥ 0.6, highest first, each linked; never section-level tags", () => {
    const line = topicLine("en", layer, refs);
    expect(line.map((t) => t.id)).toEqual(["emunah", "tefillah", "bitachon", "shabbos", "teshuvah"]);
    expect(line).toHaveLength(TOPIC_LINE_MAX);
    expect(line.every((t) => t.href === `/en/inyanim/${t.id}/`)).toBe(true);
    expect(line.map((t) => t.name)).toEqual(["Emunah", "Tefillah", "Bitachon", "Shabbos", "Teshuvah"]);
    expect(line.some((t) => t.id === "low" || t.id === "pageless" || t.id === "missing-topic")).toBe(false);
  });

  it("uses the Yiddish label in the Yiddish edition", () => {
    const line = topicLine("yi", layer, refs);
    expect(line[0]).toEqual({ id: "emunah", name: "אמונה", href: "/yi/inyanim/emunah/", hebrew: true });
  });

  it("is empty without refs, or when nothing reaches 0.6", () => {
    expect(topicLine("en", layer, null)).toEqual([]);
    expect(topicLine("en", layer, { topics: [{ id: "emunah", salience: 0.59 }] })).toEqual([]);
    // read defensively: odd records are skipped
    expect(topicLine("en", layer, { topics: [null, { id: 3 }, { id: "emunah" }] as unknown as LayerShiurRefs["topics"] })).toEqual([]);
  });
});
