/**
 * Every row of the integration-plan §2.2 table, in both editions: the builders produce the
 * table's path on each site, each path parses and re-formats to itself, and `equivalent`
 * maps each site's URL to the other's row.
 */
import { describe, expect, it } from "vitest";
import { EDS, formatLive, formatQuiet, livePaths, parseLive, parseQuiet, quietPaths, type Ed } from "../src/index.ts";
import { DATA, HOSTS, links } from "./fixtures.ts";

const Q = quietPaths(DATA);
const L = livePaths(DATA);
const ID = "yi-parshas-hashavua-brshys-01";

interface Row {
  readonly name: string;
  readonly quiet: string;
  readonly live: string;
  readonly built: { readonly quiet: string; readonly live: string };
}

function rows(ed: Ed): Row[] {
  return [
    { name: "home", quiet: `/${ed}/`, live: `/${ed}/`, built: { quiet: Q.home(ed), live: L.home(ed) } },
    {
      name: "shiur",
      quiet: `/${ed}/shiur/${ID}/`,
      live: `/${ed}/s/${ID}`,
      built: { quiet: Q.shiur(ed, ID), live: L.shiur(ed, ID) },
    },
    {
      name: "section",
      quiet: `/${ed}/shiur/${ID}/#s2`,
      live: `/${ed}/s/${ID}?t=845&m=${ID}~s2`,
      built: { quiet: Q.shiur(ed, ID, { section: 2 }), live: L.shiur(ed, ID, { t: 845, m: `${ID}~s2` }) },
    },
    {
      name: "time",
      quiet: `/${ed}/shiur/${ID}/#t=754`,
      live: `/${ed}/s/${ID}?t=754`,
      built: { quiet: Q.shiur(ed, ID, { t: 754 }), live: L.shiur(ed, ID, { t: 754 }) },
    },
    {
      name: "series",
      quiet: `/${ed}/series/tanya-1/`,
      live: `/${ed}/series/tanya-1`,
      built: { quiet: Q.series(ed, "tanya-1"), live: L.series(ed, "tanya-1") },
    },
    {
      name: "parsha",
      quiet: `/${ed}/calendar/parsha/noach/`,
      live: `/${ed}/o/noach`,
      built: { quiet: Q.parsha(ed, "noach"), live: L.occasion(ed, "noach") },
    },
    {
      name: "zman",
      quiet: `/${ed}/calendar/zman/lag-baomer/`,
      live: `/${ed}/o/lag-baomer`,
      built: { quiet: Q.zman(ed, "lag-baomer"), live: L.occasion(ed, "lag-baomer") },
    },
    {
      name: "work",
      quiet: `/${ed}/sources/ramban/`,
      live: `/${ed}/seforim/ramban`,
      built: { quiet: Q.work(ed, "ramban"), live: L.work(ed, "ramban") },
    },
    {
      name: "person",
      quiet: `/${ed}/people/dovid-hamelech/`,
      live: `/${ed}/p/dovid-hamelech`,
      built: { quiet: Q.person(ed, "dovid-hamelech"), live: L.person(ed, "dovid-hamelech") },
    },
    {
      name: "glossary entry (concept)",
      quiet: `/${ed}/erachim/emunah/`,
      live: `/${ed}/c/emunah`,
      built: { quiet: Q.glossaryEntry(ed, "emunah"), live: L.concept(ed, "emunah") },
    },
    {
      name: "topic",
      quiet: `/${ed}/inyanim/hashgacha-pratis/`,
      live: `/${ed}/t/hashgacha-pratis`,
      built: { quiet: Q.topic(ed, "hashgacha-pratis"), live: L.topic(ed, "hashgacha-pratis") },
    },
    {
      name: "story",
      quiet: `/${ed}/stories/the-sugar-sled/`,
      live: `/${ed}/maasios/the-sugar-sled`,
      built: { quiet: Q.story(ed, "the-sugar-sled"), live: L.story(ed, "the-sugar-sled") },
    },
    {
      name: "topic tree",
      quiet: `/${ed}/inyanim/`,
      live: `/${ed}/explore`,
      built: { quiet: Q.topics(ed), live: L.explore(ed) },
    },
    {
      name: "stories index",
      quiet: `/${ed}/stories/`,
      live: `/${ed}/maasios`,
      built: { quiet: Q.stories(ed), live: L.stories(ed) },
    },
    {
      name: "search",
      quiet: `/${ed}/search/?q=lag%20baomer`,
      live: `/${ed}/search?q=lag%20baomer`,
      built: { quiet: Q.search(ed, "lag baomer"), live: L.search(ed, "lag baomer") },
    },
  ];
}

describe.each(EDS)("§2.2 table, edition %s", (ed) => {
  for (const row of rows(ed)) {
    describe(row.name, () => {
      it("builders produce the table paths", () => {
        expect(row.built.quiet).toBe(row.quiet);
        expect(row.built.live).toBe(row.live);
      });

      it("each site's path round-trips through parse and format", () => {
        const q = parseQuiet(row.quiet);
        const l = parseLive(row.live, DATA);
        expect(q).not.toBeNull();
        expect(l).not.toBeNull();
        expect(formatQuiet(q!, DATA)).toBe(row.quiet);
        expect(formatLive(l!, DATA)).toBe(row.live);
      });

      it("equivalent maps quiet → live and live → quiet", () => {
        expect(links.equivalent(HOSTS.quiet + row.quiet)).toBe(HOSTS.live + row.live);
        expect(links.equivalent(HOSTS.live + row.live)).toBe(HOSTS.quiet + row.quiet);
      });

      it("absolute builders prefix the right origin", () => {
        expect(links.siteOf(HOSTS.quiet + row.quiet)).toBe("quiet");
        expect(links.siteOf(HOSTS.live + row.live)).toBe("live");
      });
    });
  }
});

describe("absolute builders", () => {
  it("cross-site links carry the other host", () => {
    expect(links.live.shiur("en", ID, { t: 754.4 })).toBe(`${HOSTS.live}/en/s/${ID}?t=754.4`);
    expect(links.quiet.shiur("yi", ID, { section: 3 })).toBe(`${HOSTS.quiet}/yi/shiur/${ID}/#s3`);
  });
});

describe("time links keep fractional seconds (Quiet #t=, Live ?t=)", () => {
  it("formats and parses Quiet's page hash to the millisecond", () => {
    expect(quietPaths().shiur("en", ID, { t: 582.12 })).toBe(`/en/shiur/${ID}/#t=582.12`);
    expect(quietPaths().shiur("en", ID, { t: 1855.5444 })).toBe(`/en/shiur/${ID}/#t=1855.544`);
    expect(quietPaths().shiur("en", ID, { t: 754 })).toBe(`/en/shiur/${ID}/#t=754`);
    expect(parseQuiet(`/en/shiur/${ID}/#t=582.12`)).toMatchObject({ kind: "shiur", id: ID, t: 582.12 });
  });

  it("formats and parses Live's ?t= to the millisecond", () => {
    expect(livePaths().shiur("en", ID, { t: 582.12 })).toBe(`/en/s/${ID}?t=582.12`);
    expect(livePaths().shiur("en", ID, { t: 1855.5444 })).toBe(`/en/s/${ID}?t=1855.544`);
    expect(livePaths().shiur("en", ID, { t: 754 })).toBe(`/en/s/${ID}?t=754`);
    expect(parseLive(`/en/s/${ID}?t=582.12`)).toMatchObject({ kind: "shiur", id: ID, t: 582.12 });
    expect(parseLive(`/en/s/${ID}?t=1855.5444`)).toMatchObject({ kind: "shiur", id: ID, t: 1855.544 });
    expect(links.equivalent(`${HOSTS.live}/en/s/${ID}?t=582.12`)).toBe(`${HOSTS.quiet}/en/shiur/${ID}/#t=582.12`);
    expect(links.equivalent(`${HOSTS.quiet}/en/shiur/${ID}/#t=582.12`)).toBe(`${HOSTS.live}/en/s/${ID}?t=582.12`);
  });
});

describe("no audio builders (Amendment A1: audio lives on the media host)", () => {
  it("exposes no audio builder on paths or links", () => {
    expect("audio" in quietPaths()).toBe(false);
    expect("audio" in livePaths()).toBe(false);
    expect("audio" in links).toBe(false);
    expect("audio" in links.quiet).toBe(false);
    expect("audio" in links.live).toBe(false);
  });

  it("does not export audioPath", async () => {
    const mod: Record<string, unknown> = await import("../src/index.ts");
    expect(mod["audioPath"]).toBeUndefined();
  });

  it("/audio/*.mp3 is not a page on either site", () => {
    expect(parseQuiet("/audio/r1.mp3")).toBeNull();
    expect(parseLive("/audio/r1.mp3?download=1", DATA)).toBeNull();
  });
});
