/**
 * W3.4 page models on a small hand-made corpus: page sets, traditional order, grading wording,
 * Sefaria only for resolved places, "place not identified", lines without a page linking straight
 * to the shiur at its time, alphabetical order and jump letters per edition.
 */
import type { ConceptEntry, EntitiesFile, PersonEntry, StoryEntry, WorkEntry } from "@emunas/corpus/aggregate";
import type { BuildInfo, IndexRow } from "@emunas/corpus/public";
import { describe, expect, it } from "vitest";
import type { ChapterRef, IndexesData } from "../corpus.ts";
import {
  compareNames,
  conceptPage,
  conceptsIndex,
  entityHref,
  letterOf,
  pageKeys,
  peopleIndex,
  personPage,
  run,
  sefariaHref,
  sortForm,
  sourcesIndex,
  storiesIndex,
  workPage,
} from "../model.ts";

function row(id: string, lang: "yi" | "en", parsha: string | null, n: string | null, years: number[]): IndexRow {
  return {
    id,
    rev: "r",
    lang,
    category: "parsha",
    status: "full",
    catalog: { source: "pocket-guide-2012", sectionId: "s", sectionTitle: "פרשת השבוע", n, page: 1, titleOriginal: "T", subTitle: null, derived: "catalog" },
    parsha: parsha === null ? null : { raw: parsha, key: parsha },
    zman: null,
    perek: null,
    years,
    series: null,
    duration: 3600,
    recordingIds: [`${id}-rec`],
    oneLiner: null,
    entities: { works: [], people: [], concepts: [] },
    counts: { chapters: 1, sources: 1, stories: 0, questions: 0, insights: 0 },
  };
}

const ROWS = [row("yi-a-01", "yi", "בראשית", "1", [5736]), row("yi-a-02", "yi", "נח", "5", [5743]), row("en-a-01", "en", null, null, [])];

const work = (w: Partial<WorkEntry> & Pick<WorkEntry, "key" | "en">): WorkEntry => ({
  mapped: true,
  group: "torah",
  order: 1,
  he: null,
  yi: null,
  sefaria: [],
  scheme: "tanach",
  genre: false,
  names: [w.en],
  shiurCount: 1,
  mentionCount: 1,
  refs: [],
  unlocated: [],
  ...w,
});

const WORKS: WorkEntry[] = [
  work({
    key: "bereishis",
    en: "Bereishis",
    he: "בראשית",
    yi: "בראשית",
    shiurCount: 2,
    mentionCount: 4,
    refs: [
      {
        ref: "Genesis 1:1",
        label: { en: "Bereishis 1:1", he: "בראשית א, א" },
        sortKey: [1001, 0, 1, 1, 0],
        mentions: [
          { shiurId: "yi-a-02", id: "yi-a-02~src1", t: 100.6, resolution: "inferred", mention: "alluded", ref: "Bereishis 1:1" },
          { shiurId: "yi-a-01", id: "yi-a-01~src0", t: 30, resolution: "resolved", mention: "quoted", ref: "Bereishis 1:1" },
        ],
      },
      {
        ref: "Genesis 2:7",
        label: { en: "Bereishis 2:7", he: "בראשית ב, ז" },
        sortKey: [1001, 0, 2, 7, 0],
        mentions: [{ shiurId: "yi-a-01", id: "yi-a-01~src3", t: 50, resolution: "inferred", mention: "alluded", ref: "Bereishis 2:7" }],
      },
    ],
    unlocated: [
      { shiurId: "yi-a-02", id: "yi-a-02~src4", t: 200, resolution: "unresolved", mention: "alluded", ref: null },
      { shiurId: "yi-a-01", id: "yi-a-01~src5", t: 10, resolution: "inferred", mention: "alluded", ref: "Bereishis 17" },
      { shiurId: "unknown-shiur", id: "unknown-shiur~src0", t: 1, resolution: "unresolved", mention: "alluded", ref: null },
    ],
  }),
  work({
    key: "bava-metzia",
    en: "Bava Metzia",
    group: "bavli",
    scheme: "shas",
    unlocated: [{ shiurId: "en-a-01", id: "en-a-01~src0", t: 12, resolution: "unresolved", mention: "alluded", ref: null }],
  }),
  work({
    key: "midrash",
    en: "Midrash",
    group: "midrash",
    genre: true,
    shiurCount: 2,
    mentionCount: 3,
    unlocated: [
      { shiurId: "yi-a-02", id: "yi-a-02~src9", t: 300, resolution: "unresolved", mention: "alluded", ref: null },
      { shiurId: "yi-a-02", id: "yi-a-02~src8", t: 90, resolution: "unresolved", mention: "alluded", ref: null },
      { shiurId: "yi-a-01", id: "yi-a-01~src9", t: 40, resolution: "unresolved", mention: "alluded", ref: null },
    ],
  }),
  work({ key: "sefer-x", en: "Sefer X", mapped: false, group: null, order: null, scheme: "none", unlocated: [{ shiurId: "yi-a-01", id: "yi-a-01~src7", t: 5, resolution: "unresolved", mention: "alluded", ref: null }] }),
];

const person = (p: Partial<PersonEntry> & Pick<PersonEntry, "key" | "en">): PersonEntry => ({
  mapped: true,
  he: null,
  names: [p.en],
  shiurCount: 1,
  shiurim: [],
  ...p,
});

const PEOPLE: PersonEntry[] = [
  person({ key: "the-baal-shem-tov", en: "the Ba'al Shem Tov", he: "הבעל שם טוב", shiurCount: 2, shiurim: [{ id: "yi-a-01", mentioned: true, stories: ["yi-a-01~st0"] }, { id: "yi-a-02", mentioned: true, stories: [] }] }),
  person({ key: "avraham-avinu", en: "Avraham Avinu", he: "אברהם אבינו", shiurim: [{ id: "yi-a-02", mentioned: false, stories: ["yi-a-02~st1", "yi-a-02~st0"] }] }),
  person({ key: "zalman", en: "Zalman", shiurim: [{ id: "en-a-01", mentioned: true, stories: [] }] }),
];

const story = (s: Partial<StoryEntry> & Pick<StoryEntry, "id" | "shiurId">): StoryEntry => ({
  lang: "yi",
  years: [],
  title: { en: `Story ${s.id}`, yi: `מעשה ${s.id}` },
  people: [],
  peopleKeys: [],
  t: 0,
  end: 10,
  ...s,
});

const STORIES: StoryEntry[] = [
  story({ id: "yi-a-01~st0", shiurId: "yi-a-01", t: 400, peopleKeys: ["the-baal-shem-tov"] }),
  story({ id: "yi-a-02~st0", shiurId: "yi-a-02", t: 900, peopleKeys: ["avraham-avinu"] }),
  story({ id: "yi-a-02~st1", shiurId: "yi-a-02", t: 600, peopleKeys: ["avraham-avinu"] }),
  story({ id: "en-a-01~st0", shiurId: "en-a-01", t: 70 }),
];

const CONCEPTS: ConceptEntry[] = [
  { key: "mesirus-nefesh-abc123", he: "מסירות נפש", variants: ["מסירות נפש", "מסירת נפש"], shiurCount: 3, shiurim: [{ id: "yi-a-01", sections: ["yi-a-01~s2", "yi-a-01~s9"] }, { id: "yi-a-02", sections: [] }, { id: "en-a-01", sections: [] }] },
  { key: "ahavas-yisroel-def456", he: "אהבת ישראל", variants: ["אהבת ישראל"], shiurCount: 3, shiurim: [{ id: "yi-a-02", sections: [] }] },
];

const ENTITIES: EntitiesFile = {
  thresholds: { quiet: { work: 2, person: 2, concept: 3 }, live: { prerender: 3 } },
  works: [
    { key: "bereishis", shiurim: 2, quietPage: true, livePrerender: false },
    { key: "bava-metzia", shiurim: 1, quietPage: false, livePrerender: false },
    { key: "midrash", shiurim: 2, quietPage: false, livePrerender: false },
    { key: "sefer-x", shiurim: 1, quietPage: false, livePrerender: false },
  ],
  people: [
    { key: "the-baal-shem-tov", shiurim: 2, quietPage: true, livePrerender: false },
    { key: "avraham-avinu", shiurim: 1, quietPage: false, livePrerender: false },
    { key: "zalman", shiurim: 1, quietPage: false, livePrerender: false },
  ],
  concepts: [
    { key: "mesirus-nefesh-abc123", shiurim: 3, quietPage: true, livePrerender: true },
    { key: "ahavas-yisroel-def456", shiurim: 3, quietPage: false, livePrerender: true },
  ],
  occasions: [],
};

const CHAPTERS: Record<string, ChapterRef[]> = {
  "yi-a-01": [{ idx: 2, t: 754, title: { en: "On self-sacrifice", yi: "וועגן מסירות נפש" } }],
};

const BUILD: BuildInfo = { buildId: "b", dataSha: null, schemaVersion: 2, mediaOrigin: "https://media.example.invalid", counts: { total: 997, full: 518, catalogOnly: 479, downgraded: 0 } };

const data: IndexesData = {
  dir: "/nowhere",
  build: BUILD,
  works: { works: WORKS },
  people: { people: PEOPLE },
  concepts: { minShiurim: 3, omitted: { stopListed: 0, belowThreshold: 0 }, concepts: CONCEPTS },
  stories: { stories: STORIES, byPerson: [{ key: "avraham-avinu", storyIds: ["yi-a-02~st0", "yi-a-02~st1"] }, { key: "the-baal-shem-tov", storyIds: ["yi-a-01~st0"] }, { key: null, storyIds: ["en-a-01~st0"] }] },
  entities: ENTITIES,
  rows: new Map(ROWS.map((r) => [r.id, r])),
  chapters: (id) => new Map((CHAPTERS[id] ?? []).map((c) => [c.idx, c])),
};

describe("page sets", () => {
  it("are exactly the entities.json quietPage keys", () => {
    expect([...pageKeys(data, "work")]).toEqual(["bereishis"]);
    expect([...pageKeys(data, "person")]).toEqual(["the-baal-shem-tov"]);
    expect([...pageKeys(data, "concept")]).toEqual(["mesirus-nefesh-abc123"]);
  });

  it("entity links go to the page, or to the line on the index", () => {
    expect(entityHref("en", "work", "bereishis", true)).toBe("/en/sources/bereishis/");
    expect(entityHref("yi", "person", "zalman", false)).toBe("/yi/people/#zalman");
    expect(entityHref("en", "concept", "x-1", true)).toBe("/en/inyanim/x-1/");
  });
});

describe("sources index", () => {
  const groups = sourcesIndex(data, "en");

  it("keeps the traditional order, then works not in the table, then generic labels", () => {
    expect(groups.map((g) => g.group)).toEqual(["torah", "bavli", "unmapped", "general"]);
    expect(groups.map((g) => g.label)).toEqual(["Torah", "Talmud Bavli", "Not yet in the list of seforim", "General references"]);
    expect(groups.find((g) => g.group === "general")?.note).toMatch(/Midrash/);
  });

  it("links a work with a page to it and lists no shiurim on its line", () => {
    const b = groups[0]!.works[0]!;
    expect(b).toMatchObject({ key: "bereishis", href: "/en/sources/bereishis/", cites: [] });
    expect(b.alt).toEqual({ text: "בראשית", lang: "he", dir: "rtl" });
  });

  it("links any other work straight to its shiurim at the earliest moment, in catalog order", () => {
    const midrash = groups.find((g) => g.group === "general")!.works[0]!;
    expect(midrash.href).toBeNull();
    expect(midrash.cites.map((c) => c.href)).toEqual(["/en/shiur/yi-a-01/#t=40", "/en/shiur/yi-a-02/#t=90"]);
    const bm = groups[1]!.works[0]!;
    expect(bm.cites.map((c) => c.href)).toEqual(["/en/shiur/en-a-01/#t=12"]);
  });

  it("names works in the edition's language", () => {
    const yi = sourcesIndex(data, "yi");
    expect(yi[0]!.works[0]!.name).toEqual({ text: "בראשית", lang: "yi", dir: "rtl" });
    expect(yi[0]!.label).toBe("תורה");
  });
});

describe("work page", () => {
  const page = workPage(data, "en", WORKS[0]!);

  it("lists references in the work's order, mentions in catalog order with their times", () => {
    expect(page.refs.map((r) => r.label.text)).toEqual(["Bereishis 1:1", "Bereishis 2:7"]);
    expect(page.refs[0]!.mentions.map((m) => m.cite.href)).toEqual(["/en/shiur/yi-a-01/#t=30", "/en/shiur/yi-a-02/#t=101"]);
  });

  it("says 'apparently' for inferred places and nothing for resolved ones", () => {
    expect(page.refs[0]!.mentions.map((m) => m.qualifier)).toEqual([null, "apparently"]);
    expect(workPage(data, "yi", WORKS[0]!).refs[0]!.mentions[1]!.qualifier).toBe("לכאורה");
  });

  it("links to Sefaria only where some mention resolved the place", () => {
    expect(page.refs[0]!.sefaria).toBe("https://www.sefaria.org/Genesis%201%3A1");
    expect(page.refs[1]!.sefaria).toBeNull();
  });

  it("puts unordered references, then mentions with no place, last", () => {
    expect(page.otherRefs.map((m) => [m.text.text, m.qualifier, m.cite.href])).toEqual([["Bereishis 17", "apparently", "/en/shiur/yi-a-01/#t=10"]]);
    // the mention of a shiur the corpus does not have is dropped, not linked
    expect(page.unplaced.map((m) => m.cite.href)).toEqual(["/en/shiur/yi-a-02/#t=200"]);
  });

  it("uses the Hebrew labels in the Yiddish edition", () => {
    expect(workPage(data, "yi", WORKS[0]!).refs.map((r) => r.label.text)).toEqual(["בראשית א, א", "בראשית ב, ז"]);
  });
});

describe("people", () => {
  it("sorts by name without the article, edition script first, with jump letters", () => {
    const en = peopleIndex(data, "en");
    expect(en.map((b) => b.letter)).toEqual(["A", "B", "Z"]);
    expect(en.flatMap((b) => b.items.map((p) => p.key))).toEqual(["avraham-avinu", "the-baal-shem-tov", "zalman"]);
    const yi = peopleIndex(data, "yi");
    // Hebrew names (א, ה) before the Latin-only name
    expect(yi.flatMap((b) => b.items.map((p) => p.name.text))).toEqual(["אברהם אבינו", "הבעל שם טוב", "Zalman"]);
    expect(yi.map((b) => b.letter)).toEqual(["א", "ה", "Z"]);
  });

  it("gives a person below the threshold a line that links to the shiur, at their story when there is one", () => {
    const lines = peopleIndex(data, "en").flatMap((b) => b.items);
    const avraham = lines.find((p) => p.key === "avraham-avinu")!;
    expect(avraham.href).toBeNull();
    expect(avraham.cites.map((c) => c.href)).toEqual(["/en/shiur/yi-a-02/#t=600"]);
    const zalman = lines.find((p) => p.key === "zalman")!;
    expect(zalman.cites.map((c) => c.href)).toEqual(["/en/shiur/en-a-01/"]);
    expect(lines.find((p) => p.key === "the-baal-shem-tov")).toMatchObject({ href: "/en/people/the-baal-shem-tov/", cites: [] });
  });

  it("person page: shiurim in catalog order with their story titles at their times", () => {
    const page = personPage(data, "yi", PEOPLE[0]!);
    expect(page.shiurim.map((s) => s.cite.href)).toEqual(["/yi/shiur/yi-a-01/", "/yi/shiur/yi-a-02/"]);
    expect(page.shiurim[0]!.stories.map((s) => [s.title, s.cite.href])).toEqual([["מעשה yi-a-01~st0", "/yi/shiur/yi-a-01/#t=400"]]);
    expect(page.alt?.text).toBe("the Ba'al Shem Tov");
  });
});

describe("stories index", () => {
  it("groups by person in alphabetical order, unnamed last, stories in their order", () => {
    const { groups, letters, rest } = storiesIndex(data, "en");
    expect(groups.map((g) => g.key)).toEqual(["avraham-avinu", "the-baal-shem-tov", null]);
    expect(letters.map((b) => b.letter)).toEqual(["A", "B"]);
    expect(groups[0]!.personHref).toBe("/en/people/#avraham-avinu");
    expect(groups[1]!.personHref).toBe("/en/people/the-baal-shem-tov/");
    expect(groups[0]!.stories.map((s) => s.cite.href)).toEqual(["/en/shiur/yi-a-02/#t=900", "/en/shiur/yi-a-02/#t=600"]);
    expect(rest?.stories.map((s) => s.title)).toEqual(["Story en-a-01~st0"]);
  });
});

describe("inyanim", () => {
  it("uses the Hebrew term as the headword in both editions, with Hebrew jump letters", () => {
    for (const ed of ["en", "yi"] as const) {
      const blocks = conceptsIndex(data, ed);
      expect(blocks.flatMap((b) => b.items.map((c) => c.he))).toEqual([
        { text: "מסירות נפש", lang: "he", dir: "rtl" },
        { text: "אהבת ישראל", lang: "he", dir: "rtl" },
      ]);
      expect(blocks.map((b) => b.letter)).toEqual(["מ", "א"]);
    }
  });

  it("links a concept without a page straight to its shiurim", () => {
    const line = conceptsIndex(data, "en").flatMap((b) => b.items).find((c) => c.key === "ahavas-yisroel-def456")!;
    expect(line.href).toBeNull();
    expect(line.cites.map((c) => c.href)).toEqual(["/en/shiur/yi-a-02/"]);
  });

  it("concept page: sections whose title carries the term, linked by section anchor; unknown sections dropped", () => {
    const page = conceptPage(data, "en", CONCEPTS[0]!);
    expect(page.variants.map((v) => v.text)).toEqual(["מסירת נפש"]);
    expect(page.shiurim.map((s) => s.cite.href)).toEqual(["/en/shiur/yi-a-01/", "/en/shiur/yi-a-02/", "/en/shiur/en-a-01/"]);
    expect(page.shiurim[0]!.sections).toEqual([{ idx: 2, title: "On self-sacrifice", t: 754, href: "/en/shiur/yi-a-01/#s2" }]);
  });
});

describe("helpers", () => {
  it("sortForm drops articles, marks and leading quote marks", () => {
    expect(sortForm("the Chasam Sofer")).toBe("Chasam Sofer");
    expect(sortForm("\"Reb\" Zusha")).toBe("Reb\" Zusha");
    expect(sortForm("בְּרֵאשִׁית")).toBe("בראשית");
  });

  it("letterOf maps final forms and non-letters", () => {
    expect(letterOf("ךמא")).toBe("כ");
    expect(letterOf("élan")).toBe("E");
    expect(letterOf("1st")).toBe("#");
  });

  it("compareNames is total and stable on ties", () => {
    const a = { name: run("Alpha", "en"), key: "a" };
    const b = { name: run("alpha", "en"), key: "b" };
    expect([b, a].sort(compareNames("en")).map((x) => x.key)).toEqual(["a", "b"]);
  });

  it("sefariaHref encodes the ref as one path segment", () => {
    expect(sefariaHref(" Berakhot 5a ")).toBe("https://www.sefaria.org/Berakhot%205a");
  });
});
