/**
 * Corpus entries (corpus-wave-plan §3.5, C1.4 acceptance): round trips for every new route in
 * both editions, cross-site equivalents with page flags, merged concepts, canonical/noindex.
 */
import { describe, expect, it } from "vitest";
import {
  EDS,
  formatLive,
  formatQuiet,
  hrefFor,
  livePaths,
  pageLookupFromLayer,
  parseLive,
  parseQuiet,
  quietPaths,
  type CorpusKind,
  type Route,
} from "../src/index.ts";
import { CORPUS_DATA, LAYER, corpusLinks as links } from "./corpus-fixtures.ts";
import { HOSTS } from "./fixtures.ts";

const Q = quietPaths(CORPUS_DATA);
const L = livePaths(CORPUS_DATA);

describe.each(EDS)("new routes round-trip, edition %s", (ed) => {
  const quiet: [string, string, Route][] = [
    ["topic", `/${ed}/inyanim/emunah/`, { kind: "entry", ed, entry: "topic", id: "emunah" }],
    ["topic all/", `/${ed}/inyanim/emunah/all/`, { kind: "entry", ed, entry: "topic", id: "emunah", all: true }],
    ["glossary entry", `/${ed}/erachim/tzimtzum/`, { kind: "entry", ed, entry: "concept", id: "tzimtzum" }],
    ["person", `/${ed}/people/divrei-chaim/`, { kind: "entry", ed, entry: "person", id: "divrei-chaim" }],
    ["person all/", `/${ed}/people/divrei-chaim/all/`, { kind: "entry", ed, entry: "person", id: "divrei-chaim", all: true }],
    ["work", `/${ed}/sources/ramban/`, { kind: "entry", ed, entry: "work", id: "ramban" }],
    ["story", `/${ed}/stories/the-sugar-sled/`, { kind: "entry", ed, entry: "story", id: "the-sugar-sled" }],
    ["topic anchor", `/${ed}/inyanim/#emunah`, { kind: "entry", ed, entry: "topic", id: "emunah" }],
    ["glossary anchor", `/${ed}/erachim/#rare-term`, { kind: "entry", ed, entry: "concept", id: "rare-term" }],
    ["story anchor", `/${ed}/stories/#told-once`, { kind: "entry", ed, entry: "story", id: "told-once" }],
    ["topic tree", `/${ed}/inyanim/`, { kind: "index", ed, index: "topics" }],
    ["glossary", `/${ed}/erachim/`, { kind: "index", ed, index: "glossary" }],
    ["stories index", `/${ed}/stories/`, { kind: "index", ed, index: "stories" }],
  ];
  for (const [name, path, route] of quiet) {
    it(`quiet ${name}: parses to its route`, () => {
      expect(parseQuiet(path)).toEqual(route);
    });
  }
  for (const [name, path] of quiet.filter(([n]) => !n.endsWith("anchor"))) {
    it(`quiet ${name}: parse → format is identity`, () => {
      expect(formatQuiet(parseQuiet(path)!, CORPUS_DATA)).toBe(path);
    });
  }
  it("quiet anchors re-format to the anchor while there is no page", () => {
    expect(formatQuiet(parseQuiet(`/${ed}/erachim/#rare-term`)!, CORPUS_DATA)).toBe(`/${ed}/erachim/#rare-term`);
    expect(formatQuiet(parseQuiet(`/${ed}/stories/#told-once`)!, CORPUS_DATA)).toBe(`/${ed}/stories/#told-once`);
  });

  const live: [string, string, CorpusKind, string][] = [
    ["topic", `/${ed}/t/emunah`, "topic", "emunah"],
    ["thread", `/${ed}/th/lechem-matzah-45`, "thread", "lechem-matzah-45"],
    ["story", `/${ed}/maasios/the-sugar-sled`, "story", "the-sugar-sled"],
    ["concept", `/${ed}/c/tzimtzum`, "concept", "tzimtzum"],
    ["person", `/${ed}/p/divrei-chaim`, "person", "divrei-chaim"],
    ["work", `/${ed}/seforim/ramban`, "work", "ramban"],
  ];
  for (const [name, path, entry, id] of live) {
    it(`live ${name}: parse → format is identity`, () => {
      const r = parseLive(path, CORPUS_DATA);
      expect(r).toEqual({ kind: "entry", ed, entry, id });
      expect(formatLive(r!, CORPUS_DATA)).toBe(path);
    });
  }

  it("builders produce the §3.5 addresses", () => {
    expect(Q.topic(ed, "emunah")).toBe(`/${ed}/inyanim/emunah/`);
    expect(Q.topic(ed, "emunah", { all: true })).toBe(`/${ed}/inyanim/emunah/all/`);
    expect(Q.glossaryEntry(ed, "tzimtzum")).toBe(`/${ed}/erachim/tzimtzum/`);
    expect(Q.person(ed, "divrei-chaim", { all: true })).toBe(`/${ed}/people/divrei-chaim/all/`);
    expect(Q.work(ed, "ramban")).toBe(`/${ed}/sources/ramban/`);
    expect(Q.story(ed, "the-sugar-sled")).toBe(`/${ed}/stories/the-sugar-sled/`);
    expect(Q.thread(ed, "lechem-matzah-45")).toBe(`/${ed}/#indexes`);
    expect(Q.topics(ed)).toBe(`/${ed}/inyanim/`);
    expect(Q.glossary(ed)).toBe(`/${ed}/erachim/`);
    expect(Q.people(ed)).toBe(`/${ed}/people/`);
    expect(Q.sources(ed)).toBe(`/${ed}/sources/`);
    expect(L.topic(ed, "emunah")).toBe(`/${ed}/t/emunah`);
    expect(L.thread(ed, "two-member")).toBe(`/${ed}/th/two-member`);
    expect(L.story(ed, "the-sugar-sled")).toBe(`/${ed}/maasios/the-sugar-sled`);
    expect(L.concept(ed, "tzimtzum")).toBe(`/${ed}/c/tzimtzum`);
    expect(L.person(ed, "divrei-chaim")).toBe(`/${ed}/p/divrei-chaim`);
    expect(L.work(ed, "ramban")).toBe(`/${ed}/seforim/ramban`);
  });

  it("all/ is only for topics and people, and only with a page", () => {
    expect(Q.person(ed, "once-named", { all: true })).toBe(`/${ed}/people/#once-named`);
    expect(Q.story(ed, "the-sugar-sled", { all: true })).toBe(`/${ed}/stories/the-sugar-sled/`);
    expect(parseQuiet(`/${ed}/stories/the-sugar-sled/all/`)).toBeNull();
    expect(parseQuiet(`/${ed}/inyanim/emunah/more/`)).toBeNull();
  });
});

describe("equivalent(quiet → live → quiet) is identity for topic, concept and story", () => {
  for (const ed of EDS) {
    const paths = [
      Q.topic(ed, "emunah"),
      Q.topic(ed, "hester-panim"),
      Q.glossaryEntry(ed, "tzimtzum"),
      Q.story(ed, "the-sugar-sled"),
      Q.person(ed, "divrei-chaim"),
      Q.work(ed, "ramban"),
    ];
    it(ed, () => {
      for (const p of paths) {
        const live = links.equivalent(HOSTS.quiet + p);
        expect(live, p).not.toBeNull();
        expect(live!.startsWith(`${HOSTS.live}/`)).toBe(true);
        expect(links.equivalent(live!)).toBe(HOSTS.quiet + p);
      }
    });
  }

  it("live → quiet → live is identity for the same kinds", () => {
    for (const p of ["/yi/t/chanukah", "/en/c/tzimtzum", "/en/maasios/the-sugar-sled", "/yi/p/divrei-chaim", "/en/seforim/ramban"]) {
      expect(links.equivalent(links.equivalent(HOSTS.live + p)!)).toBe(HOSTS.live + p);
    }
  });

  it("the continuation page maps to the entity and back to its first page", () => {
    expect(links.equivalent(`${HOSTS.quiet}/en/inyanim/emunah/all/`)).toBe(`${HOSTS.live}/en/t/emunah`);
    expect(links.equivalent(`${HOSTS.quiet}/yi/people/divrei-chaim/all/`)).toBe(`${HOSTS.live}/yi/p/divrei-chaim`);
  });
});

describe("a concept merged into a topic maps to its topic", () => {
  it("on both sites' builders", () => {
    expect(Q.glossaryEntry("en", "hester-panim-term")).toBe("/en/inyanim/hester-panim/");
    expect(L.concept("yi", "hester-panim-term")).toBe("/yi/t/hester-panim");
  });

  it("across sites and in the canonical", () => {
    expect(links.equivalent(`${HOSTS.live}/en/c/hester-panim-term`)).toBe(`${HOSTS.quiet}/en/inyanim/hester-panim/`);
    expect(links.equivalent(`${HOSTS.quiet}/en/erachim/hester-panim-term/`)).toBe(`${HOSTS.live}/en/t/hester-panim`);
    expect(links.canonicalFor(`${HOSTS.live}/yi/c/hester-panim-term`)).toBe(`${HOSTS.quiet}/yi/inyanim/hester-panim/`);
    expect(links.noindexFor(`${HOSTS.live}/yi/c/hester-panim-term`)).toBe(false);
  });
});

describe("below the thresholds", () => {
  it("Quiet links the index anchor", () => {
    expect(Q.glossaryEntry("en", "ohr-haganuz-short")).toBe("/en/erachim/#ohr-haganuz-short");
    expect(Q.person("yi", "hitler")).toBe("/yi/people/#hitler");
    expect(Q.work("en", "midrash")).toBe("/en/sources/#midrash");
    expect(Q.story("en", "told-once")).toBe("/en/stories/#told-once");
    expect(links.equivalent(`${HOSTS.live}/en/c/ohr-haganuz-short`)).toBe(`${HOSTS.quiet}/en/erachim/#ohr-haganuz-short`);
  });

  it("Live gives no link", () => {
    const r = (entry: CorpusKind, id: string): Route => ({ kind: "entry", ed: "en", entry, id });
    expect(hrefFor("live", r("concept", "rare-term"), CORPUS_DATA)).toBeNull();
    expect(hrefFor("live", r("person", "hitler"), CORPUS_DATA)).toBeNull();
    expect(hrefFor("live", r("work", "two-cites"), CORPUS_DATA)).toBeNull();
    expect(hrefFor("live", r("story", "told-once"), CORPUS_DATA)).toBeNull();
    expect(hrefFor("live", r("thread", "two-member"), CORPUS_DATA)).toBeNull();
    expect(hrefFor("live", r("thread", "lechem-matzah-45"), CORPUS_DATA)).toBe("/en/th/lechem-matzah-45");
    expect(links.equivalent(`${HOSTS.quiet}/en/sources/two-cites/`)).toBeNull();
    expect(links.equivalent(`${HOSTS.quiet}/en/erachim/#rare-term`)).toBeNull();
    expect(links.equivalent(`${HOSTS.quiet}/en/stories/#told-once`)).toBeNull();
    expect(links.hrefFor("live", r("story", "the-sugar-sled"))).toBe(`${HOSTS.live}/en/maasios/the-sugar-sled`);
  });

  it("Quiet never returns null from hrefFor", () => {
    expect(hrefFor("quiet", { kind: "entry", ed: "yi", entry: "thread", id: "two-member" }, CORPUS_DATA)).toBe("/yi/#indexes");
  });
});

describe("threads: Live only in this cut", () => {
  it("map to the Quiet edition home's #indexes", () => {
    expect(links.equivalent(`${HOSTS.live}/en/th/lechem-matzah-45`)).toBe(`${HOSTS.quiet}/en/#indexes`);
    expect(links.equivalent(`${HOSTS.live}/yi/th/two-member`)).toBe(`${HOSTS.quiet}/yi/#indexes`);
  });

  it("have no canonical and are noindex", () => {
    for (const id of ["lechem-matzah-45", "two-member", "unknown"]) {
      expect(links.canonicalFor(`${HOSTS.live}/en/th/${id}`)).toBeNull();
      expect(links.noindexFor(`${HOSTS.live}/en/th/${id}`)).toBe(true);
      expect(links.noindexFor(`/yi/th/${id}`)).toBe(true);
    }
  });
});

describe("canonicalFor and noindexFor on corpus entries", () => {
  const ENTRIES = [
    "/en/t/emunah",
    "/en/t/unknown-topic",
    "/yi/c/tzimtzum",
    "/yi/c/ohr-haganuz-short",
    "/yi/c/rare-term",
    "/en/p/divrei-chaim",
    "/en/p/hitler",
    "/en/seforim/ramban/12",
    "/en/seforim/two-cites",
    "/en/maasios/the-sugar-sled",
    "/en/maasios/told-once",
    "/en/th/lechem-matzah-45",
  ];

  it("points at the Quiet page when Quiet has one, else null and noindex; never analyze.*", () => {
    for (const p of ENTRIES) {
      const c = links.canonicalFor(HOSTS.live + p);
      if (c === null) {
        expect(links.noindexFor(HOSTS.live + p), p).toBe(true);
      } else {
        expect(c.startsWith(`${HOSTS.quiet}/`), p).toBe(true);
        expect(c, p).not.toMatch(/analyze\.|#/);
        expect(links.noindexFor(HOSTS.live + p), p).toBe(false);
      }
    }
  });

  it("gives the expected targets", () => {
    expect(links.canonicalFor(`${HOSTS.live}/en/t/emunah`)).toBe(`${HOSTS.quiet}/en/inyanim/emunah/`);
    expect(links.canonicalFor(`${HOSTS.live}/yi/c/tzimtzum`)).toBe(`${HOSTS.quiet}/yi/erachim/tzimtzum/`);
    expect(links.canonicalFor(`${HOSTS.live}/en/seforim/ramban/12`)).toBe(`${HOSTS.quiet}/en/sources/ramban/`);
    expect(links.canonicalFor(`${HOSTS.live}/en/maasios/the-sugar-sled`)).toBe(`${HOSTS.quiet}/en/stories/the-sugar-sled/`);
    expect(links.canonicalFor(`${HOSTS.live}/yi/c/ohr-haganuz-short`)).toBeNull();
    expect(links.canonicalFor(`${HOSTS.live}/en/p/hitler`)).toBeNull();
    expect(links.canonicalFor(`${HOSTS.live}/en/maasios/told-once`)).toBeNull();
    // an id the layer does not know has no page
    expect(links.canonicalFor(`${HOSTS.live}/en/t/unknown-topic`)).toBeNull();
  });

  it("is not noindex for other pages, nor for Quiet URLs", () => {
    expect(links.noindexFor(`${HOSTS.live}/en/s/x`)).toBe(false);
    expect(links.noindexFor(`${HOSTS.live}/en/maasios`)).toBe(false);
    expect(links.noindexFor(`${HOSTS.quiet}/en/erachim/#rare-term`)).toBe(false);
    expect(links.noindexFor(`/en/erachim/#rare-term`, "quiet")).toBe(false);
  });

  it("a Quiet anchor URL is canonical to its index page", () => {
    expect(links.canonicalFor(`${HOSTS.quiet}/en/erachim/#rare-term`)).toBe(`${HOSTS.quiet}/en/erachim/`);
    expect(links.canonicalFor(`${HOSTS.quiet}/en/inyanim/emunah/all/`)).toBe(`${HOSTS.quiet}/en/inyanim/emunah/all/`);
  });

  it("hreflang and withEdition keep the entry", () => {
    expect(links.hreflangAlternates("/en/inyanim/emunah/all/").map((h) => h.href)).toEqual([
      `${HOSTS.quiet}/en/inyanim/emunah/all/`,
      `${HOSTS.quiet}/yi/inyanim/emunah/all/`,
      `${HOSTS.quiet}/he/inyanim/emunah/all/`,
      `${HOSTS.quiet}/`,
    ]);
    expect(links.withEdition(`${HOSTS.live}/en/th/lechem-matzah-45`, "yi")).toBe(`${HOSTS.live}/yi/th/lechem-matzah-45`);
  });
});

describe("pageLookupFromLayer", () => {
  it("reads the flags per site and kind", () => {
    const d = pageLookupFromLayer(LAYER);
    expect(d.hasPage("quiet", "concept", "tzimtzum")).toBe(true);
    expect(d.hasPage("quiet", "concept", "ohr-haganuz-short")).toBe(false);
    expect(d.hasPage("live", "concept", "ohr-haganuz-short")).toBe(true);
    expect(d.hasPage("quiet", "thread", "lechem-matzah-45")).toBe(false);
    expect(d.hasPage("live", "thread", "lechem-matzah-45")).toBe(true);
    expect(d.hasPage("live", "story", "nope")).toBe(false);
    expect(d.conceptTopic("hester-panim-term")).toBe("hester-panim");
    expect(d.conceptTopic("tzimtzum")).toBeUndefined();
  });

  it("answers undefined for a kind whose file is absent, and reads flags defensively", () => {
    const d = pageLookupFromLayer({ people: { people: [{ id: "x" }, { id: "y", pages: { quiet: true } }] } });
    expect(d.hasPage("quiet", "topic", "emunah")).toBeUndefined();
    expect(d.hasPage("live", "thread", "a")).toBeUndefined();
    expect(d.hasPage("quiet", "person", "x")).toBe(false);
    expect(d.hasPage("quiet", "person", "y")).toBe(true);
    expect(d.hasPage("live", "person", "y")).toBe(false);
  });

  it("layer flags decide; without them the page is assumed to exist", () => {
    expect(quietPaths(pageLookupFromLayer(LAYER)).person("en", "hitler")).toBe("/en/people/#hitler");
    expect(quietPaths().person("en", "hitler")).toBe("/en/people/hitler/");
  });
});

describe("topic addresses", () => {
  it("/{ed}/inyanim/{topicId}/ is the topic page", () => {
    expect(parseQuiet("/en/inyanim/hester-panim/")).toEqual({ kind: "entry", ed: "en", entry: "topic", id: "hester-panim" });
  });
});

