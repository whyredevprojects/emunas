/**
 * C2.3: the stories index and story page models (Quiet C4.5) on a small synthetic layer, so each
 * rule is pinned: page flags decide pages, tellings by year with the undated last, plain names for
 * unresolved or unlisted people, the three parts of the index, anchors, and no pairing.
 */
import type { IndexRow, LayerMomentRef, LayerPerson, LayerStory } from "@emunas/corpus/public";
import { pageLookupFromLayer } from "@emunas/links";
import { describe, expect, it } from "vitest";
import {
  MOST_RETOLD_MIN,
  STORIES_ANCHORS,
  storiesCrumbs,
  storiesIndexModel,
  storyPageModel,
  storyPeople,
  tellingHref,
  tellingRows,
  type StoriesSource,
} from "../model.ts";
import { storiesEn, storiesYi } from "../strings.ts";

function row(id: string, lang: "yi" | "en", extra: { parsha?: string; years?: number[]; n?: string } = {}): IndexRow {
  return {
    id,
    lang,
    years: extra.years ?? [],
    parsha: extra.parsha ? { raw: extra.parsha, key: extra.parsha } : null,
    zman: null,
    catalog: { titleOriginal: `Title ${id}`, sectionTitle: `Section of ${id}`, n: extra.n ?? null },
  } as unknown as IndexRow;
}

const ROWS = new Map<string, IndexRow>([
  ["yi-a-01", row("yi-a-01", "yi", { parsha: "נח", years: [5743], n: "12" })],
  ["yi-a-02", row("yi-a-02", "yi", { years: [5750] })],
  ["en-b-01", row("en-b-01", "en", { parsha: "Vayera" })],
  ["en-b-02", row("en-b-02", "en", { years: [5770] })],
  ["yi-c-01", row("yi-c-01", "yi")],
]);

function telling(shiurId: string, i: number, year: number | null, t: number | null = 100 * (i + 1), chapterIdx: number | null = 2): LayerMomentRef {
  return { shiurId, momentId: `${shiurId}~st${i}`, chapterIdx, t, year, lang: shiurId.startsWith("en") ? "en" : "yi" };
}

function person(id: string, p: Partial<LayerPerson> = {}): LayerPerson {
  return {
    id,
    nameHe: p.nameHe ?? `${id} he`,
    nameEn: p.nameEn ?? `${id} en`,
    nameYi: p.nameYi ?? "",
    aliases: [],
    type: p.type ?? "chassidic_rebbe",
    group: p.group ?? "chassidic_rebbe",
    groupOrder: 5,
    description: null,
    shiurIds: [],
    count: 3,
    storyIds: [],
    worksAuthored: [],
    sameIdWork: null,
    sameAsTopic: null,
    excluded: p.excluded ?? null,
    listed: p.listed ?? { quiet: true, live: true },
    pages: p.pages ?? { quiet: true, live: true },
    quietAllList: false,
    reviewed: false,
  };
}

function story(id: string, tellings: LayerMomentRef[], s: Partial<LayerStory> = {}): LayerStory {
  const page = new Set(tellings.map((x) => x.shiurId)).size >= 2;
  return {
    id,
    title: s.title ?? { en: `Story ${id}`, yi: `מעשה ${id}` },
    retelling: s.retelling ?? { en: `Retelling of ${id}.`, yi: `די מעשה ${id}.` },
    people: s.people ?? [],
    attributionVaries: s.attributionVaries ?? false,
    tellings,
    shiurCount: new Set(tellings.map((x) => x.shiurId)).size,
    reviewed: s.reviewed ?? false,
    pages: s.pages ?? { quiet: page, live: page },
  };
}

const PEOPLE = [
  person("baal-shem-tov", { nameEn: "the Baal Shem Tov", nameHe: "הבעל שם טוב", nameYi: "דער בעל שם טוב" }),
  person("avraham-avinu", { nameEn: "Avraham Avinu", nameHe: "אברהם אבינו", type: "tanach", group: "tanach" }),
  person("chofetz-chaim", { nameEn: "the Chofetz Chaim", nameHe: "החפץ חיים", type: "acharon", group: "acharon", pages: { quiet: false, live: false } }),
  person("a-politician", { nameEn: "A Politician", type: "other", group: "other", listed: { quiet: false, live: false }, pages: { quiet: false, live: false } }),
  person("the-ravs-father", { nameEn: "the Rav's father", type: "individual", group: "other", excluded: "family", listed: { quiet: false, live: false } }),
];

const STORIES: LayerStory[] = [
  // told five times, about the Baal Shem Tov; one telling in a shiur the catalog does not have
  story(
    "the-poretz-and-the-sled",
    [telling("yi-a-02", 0, 5750), telling("en-b-01", 1, null), telling("yi-a-01", 2, 5743), telling("en-b-02", 3, 5770), telling("yi-c-01", 4, null), telling("no-such-shiur", 0, 5700)],
    { people: [{ id: "baal-shem-tov" }, { name: "Reb Aryeh", linked: false }], attributionVaries: true },
  ),
  // told twice, Avraham Avinu and the Baal Shem Tov
  story("avraham-and-the-guests", [telling("yi-a-01", 1, 5743), telling("en-b-01", 0, null)], { people: [{ id: "avraham-avinu" }, { id: "baal-shem-tov" }] }),
  // told once, about the Chofetz Chaim (listed, no page)
  story("the-chofetz-chaim-and-the-wagon", [telling("yi-a-02", 3, 5750, 615.4)], { people: [{ id: "chofetz-chaim" }] }),
  // told once, nobody listed: only an unresolved name, an unlisted and an excluded person
  story("the-cook", [telling("en-b-02", 1, 5770, null, 4)], { people: [{ name: "Chaim", linked: false }, { id: "a-politician" }, { id: "the-ravs-father" }] }),
  // told once with no time and no chapter
  story("a-boy-at-the-kosel", [telling("en-b-01", 2, null, null, null)], { title: { en: "A boy at the Kosel", yi: "" } }),
  // nothing citable: dropped from the index
  story("lost", [telling("no-such-shiur", 1, null)]),
];

function source(stories: LayerStory[] = STORIES, people: LayerPerson[] = PEOPLE): StoriesSource {
  const links = pageLookupFromLayer({ stories: { stories }, people: { people } });
  const byId = new Map(people.map((p) => [p.id, p]));
  return {
    stories,
    person: (id) => byId.get(id),
    hasPage: (kind, id) => links.hasPage("quiet", kind, id) === true,
    links,
  };
}

describe("story strings", () => {
  it("have the same keys in both editions, Yiddish in Hebrew script", () => {
    expect(Object.keys(storiesYi).sort()).toEqual(Object.keys(storiesEn).sort());
    for (const [k, v] of Object.entries(storiesYi)) {
      const forms = typeof v === "string" ? [v] : Object.values(v);
      for (const f of forms) expect(/[א-ת]/.test(f), k).toBe(true);
    }
  });

  it("speak of the Rav as דער משגיח in Yiddish", () => {
    expect(storiesYi["index.lead"]).toContain("דער משגיח");
  });
});

describe("tellings", () => {
  it("orders by year with the undated last, keeps each row's own language, and drops unknown shiurim", () => {
    const rows = tellingRows("en", STORIES[0]!.tellings, ROWS);
    expect(rows.map((r) => r.shiurId)).toEqual(["yi-a-01", "yi-a-02", "en-b-02", "en-b-01", "yi-c-01"]);
    expect(rows.map((r) => r.lang)).toEqual(["yi", "yi", "en", "en", "yi"]);
    expect(rows.map((r) => r.langName)).toEqual(["Yiddish", "Yiddish", "English", "English", "Yiddish"]);
    expect(rows[0]).toMatchObject({ occasion: { text: "נח", dir: "rtl" }, n: "12", years: [5743], time: "5:00", href: "/en/shiur/yi-a-01/#t=300" });
    expect(rows[3]!.years).toEqual([]);
    // the occasion falls back to the catalog section
    expect(rows[1]!.occasion.text).toBe("Section of yi-a-02");
  });

  it("links to the time, else the chapter, else the shiur", () => {
    expect(tellingHref("yi", { shiurId: "x", t: 61.5, chapterIdx: 3 })).toBe("/yi/shiur/x/#t=62");
    expect(tellingHref("yi", { shiurId: "x", t: null, chapterIdx: 3 })).toBe("/yi/shiur/x/#s3");
    expect(tellingHref("yi", { shiurId: "x", t: null, chapterIdx: null })).toBe("/yi/shiur/x/");
  });

  it("reads odd input defensively", () => {
    expect(tellingRows("en", undefined, ROWS)).toEqual([]);
    const dup = [telling("yi-a-01", 0, 5743), telling("yi-a-01", 0, 5743)];
    expect(tellingRows("en", dup, ROWS)).toHaveLength(1);
  });
});

describe("story page", () => {
  it("has the title, people (plain text when not linkable), the retelling, rows and the attribution note", () => {
    const m = storyPageModel("en", STORIES[0]!, source(), ROWS);
    expect(m.title.text).toBe("Story the-poretz-and-the-sled");
    expect(m.people.map((p) => [p.name.text, p.href])).toEqual([
      ["the Baal Shem Tov", "/en/people/baal-shem-tov/"],
      ["Reb Aryeh", null],
    ]);
    expect(m.attributionVaries).toBe(true);
    expect(m.retelling).toBe("Retelling of the-poretz-and-the-sled.");
    expect(m.rows).toHaveLength(5);
    expect(m.reviewed).toBe(false);
  });

  it("uses the Yiddish texts in the Yiddish edition and links an unpaged listed person to its index line", () => {
    const m = storyPageModel("yi", STORIES[2]!, source(), ROWS);
    expect(m.title.text).toBe("מעשה the-chofetz-chaim-and-the-wagon");
    expect(m.retelling).toBe("די מעשה the-chofetz-chaim-and-the-wagon.");
    expect(m.people.map((p) => [p.name.text, p.href])).toEqual([["החפץ חיים", "/yi/people/#chofetz-chaim"]]);
  });

  it("prints unlisted and excluded people as plain names, never linked", () => {
    const people = storyPeople("en", STORIES[3]!, source());
    expect(people.map((p) => [p.name.text, p.href])).toEqual([
      ["Chaim", null],
      ["A Politician", null],
      ["the Rav's father", null],
    ]);
  });

  it("keeps the label when a retelling was blanked (suppressed), and falls back across languages only for the title", () => {
    const blank = story("blank", [telling("yi-a-01", 0, 5743), telling("en-b-01", 0, null)], { retelling: { en: "", yi: "  " } });
    expect(storyPageModel("en", blank, source([blank]), ROWS).retelling).toBeNull();
    const m = storyPageModel("yi", STORIES[4]!, source(), ROWS);
    expect(m.title.text).toBe("A boy at the Kosel");
    expect(m.retelling).toBe("די מעשה a-boy-at-the-kosel.");
  });

  it("breadcrumbs: Indexes › Stories › the story", () => {
    const m = storyPageModel("en", STORIES[1]!, source(), ROWS);
    expect(storiesCrumbs("en", m.title).map((c) => [c.label, c.href])).toEqual([
      ["Indexes", "/en/#indexes"],
      ["Stories", "/en/stories/"],
      ["Story avraham-and-the-guests", undefined],
    ]);
  });
});

describe("stories index", () => {
  const m = storiesIndexModel("en", source(), ROWS);

  it("lists most retold stories (four or more tellings), most often told first", () => {
    expect(MOST_RETOLD_MIN).toBe(4);
    expect(m.mostRetold.map((l) => [l.id, l.tellings, l.href])).toEqual([["the-poretz-and-the-sled", 5, "/en/stories/the-poretz-and-the-sled/"]]);
    expect(m.mostRetold.every((l) => !l.anchor)).toBe(true);
  });

  it("groups by person in the order of the index of names, listed people only", () => {
    expect(m.groups.map((g) => g.group)).toEqual(["tanach", "acharon", "chassidic_rebbe"]);
    expect(m.groups.map((g) => g.label)).toEqual(["Tanach", "Acharonim", "Chassidic Rebbes"]);
    const bst = m.groups[2]!.people[0]!;
    expect(bst).toMatchObject({ id: "baal-shem-tov", anchor: STORIES_ANCHORS.person("baal-shem-tov"), href: "/en/people/baal-shem-tov/" });
    expect(bst.name.text).toBe("the Baal Shem Tov");
    expect(bst.alt?.text).toBe("הבעל שם טוב");
    expect(bst.stories.map((s) => s.id)).toEqual(["avraham-and-the-guests", "the-poretz-and-the-sled"]);
    // a story under two people appears under both
    expect(m.groups[0]!.people[0]!.stories.map((s) => s.id)).toEqual(["avraham-and-the-guests"]);
    const names = m.groups.flatMap((g) => g.people.map((p) => p.id));
    expect(names).not.toContain("a-politician");
    expect(names).not.toContain("the-ravs-father");
  });

  it("puts every story not under a listed person in 'without a name', alphabetically", () => {
    expect(m.withoutName.map((l) => l.id)).toEqual(["a-boy-at-the-kosel", "the-cook"]);
  });

  it("links a story with a page to it and a story told once to the place in the shiur", () => {
    const once = m.groups[1]!.people[0]!.stories[0]!;
    expect(once.id).toBe("the-chofetz-chaim-and-the-wagon");
    expect(once.href).toBeNull();
    expect(once.moments.map((x) => [x.href, x.time, x.langName])).toEqual([["/en/shiur/yi-a-02/#t=615", "10:15", "Yiddish"]]);
    const cook = m.withoutName.find((l) => l.id === "the-cook")!;
    expect(cook.moments[0]!.href).toBe("/en/shiur/en-b-02/#s4");
  });

  it("gives every listed story exactly one anchor, where @emunas/links sends a story without a page", () => {
    const lines = [...m.groups.flatMap((g) => g.people.flatMap((p) => p.stories)), ...m.withoutName];
    const anchors = lines.filter((l) => l.anchor).map((l) => l.id);
    expect(new Set(anchors).size).toBe(anchors.length);
    expect([...anchors].sort()).toEqual(STORIES.filter((s) => s.id !== "lost").map((s) => s.id).sort());
    expect(m.total).toBe(5);
    // the id anchors never clash with the part, group and person anchors
    for (const a of [STORIES_ANCHORS.mostRetold, STORIES_ANCHORS.byPerson, STORIES_ANCHORS.withoutName, STORIES_ANCHORS.group("x"), STORIES_ANCHORS.person("x")]) {
      expect(a).toContain("~");
    }
  });

  it("follows the layer's page flags, not a recount here", () => {
    const flagged = STORIES.map((s) => (s.id === "avraham-and-the-guests" ? { ...s, pages: { quiet: false, live: true } } : s));
    const x = storiesIndexModel("en", source(flagged), ROWS);
    const line = x.groups[0]!.people[0]!.stories[0]!;
    expect(line.href).toBeNull();
    expect(line.moments).toHaveLength(2);
  });

  it("is empty without a layer", () => {
    expect(storiesIndexModel("yi", source([], []), ROWS)).toEqual({ mostRetold: [], groups: [], withoutName: [], total: 0 });
  });
});
