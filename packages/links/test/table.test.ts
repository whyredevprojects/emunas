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
      name: "concept",
      quiet: `/${ed}/inyanim/emunah/`,
      live: `/${ed}/c/emunah`,
      built: { quiet: Q.concept(ed, "emunah"), live: L.concept(ed, "emunah") },
    },
    {
      name: "search",
      quiet: `/${ed}/search/?q=lag%20baomer`,
      live: `/${ed}/search?q=lag%20baomer`,
      built: { quiet: Q.search(ed, "lag baomer"), live: L.search(ed, "lag baomer") },
    },
    {
      name: "audio",
      quiet: "/audio/yi-zmanim-tv-bb-04-r2.mp3",
      live: "/audio/yi-zmanim-tv-bb-04-r2.mp3",
      built: { quiet: Q.audio("yi-zmanim-tv-bb-04-r2"), live: L.audio("yi-zmanim-tv-bb-04-r2") },
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
    expect(links.live.shiur("en", ID, { t: 754.4 })).toBe(`${HOSTS.live}/en/s/${ID}?t=754`);
    expect(links.quiet.shiur("yi", ID, { section: 3 })).toBe(`${HOSTS.quiet}/yi/shiur/${ID}/#s3`);
    expect(links.audio("rec-1", { download: true })).toBe("/audio/rec-1.mp3?download=1");
  });
});
