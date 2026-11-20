import { describe, expect, it } from "vitest";
import { UI_LANGS } from "@emunas/i18n";
import { createLinks, EDS, workersDevHosts } from "../src/index.ts";
import { DATA, HOSTS, links } from "./fixtures.ts";

const ID = "yi-parshas-hashavua-brshys-01";

const LIVE_URLS = [
  "/",
  "/en/",
  "/yi/",
  `/en/s/${ID}`,
  `/en/s/${ID}?t=754&m=${ID}~s2&audio=yi,en&read=en`,
  "/yi/series",
  "/yi/series/tanya-1",
  "/en/o/noach",
  "/en/o/lag-baomer",
  "/en/o/unknown",
  "/en/seforim",
  "/en/seforim/ramban/3",
  "/en/p/once-mentioned",
  "/en/p/dovid-hamelech",
  "/en/c/two-only",
  "/en/maasios",
  "/en/explore?lens=years",
  "/en/search?q=x",
  "/en/shelf/playlists",
  "/en/pl",
  "/audio/r1.mp3",
  "/en/nonsense",
  "/garbage%",
  "analyze.emunas.example/en/",
  "",
];

describe("canonicalFor", () => {
  it("never returns a analyze.* URL, for any input", () => {
    const inputs = [
      ...LIVE_URLS,
      ...LIVE_URLS.map((p) => HOSTS.live + p),
      ...LIVE_URLS.map((p) => HOSTS.quiet + p),
      `https://analyze.other.example/en/s/${ID}`,
    ];
    for (const url of inputs) {
      const c = links.canonicalFor(url);
      if (c === null) {
        // no canonical: only for a Live corpus entry without a Quiet page, which is noindex
        expect(links.noindexFor(url.startsWith("/") ? HOSTS.live + url : url), url).toBe(true);
        continue;
      }
      expect(c.startsWith(`${HOSTS.quiet}/`), url).toBe(true);
      expect(c, url).not.toMatch(/^https?:\/\/listen\./);
      expect(c, url).not.toContain("#");
    }
  });

  it("is the quiet equivalent without fragments", () => {
    expect(links.canonicalFor(`${HOSTS.live}/en/s/${ID}?t=754&m=${ID}~s2`)).toBe(`${HOSTS.quiet}/en/shiur/${ID}/`);
    expect(links.canonicalFor(`${HOSTS.live}/yi/o/noach`)).toBe(`${HOSTS.quiet}/yi/calendar/parsha/noach/`);
    // below the Quiet threshold: no canonical (and noindex), never the index page
    expect(links.canonicalFor(`${HOSTS.live}/yi/p/once-mentioned`)).toBeNull();
    expect(links.canonicalFor(`${HOSTS.live}/yi/p/dovid-hamelech`)).toBe(`${HOSTS.quiet}/yi/people/dovid-hamelech/`);
    expect(links.canonicalFor(`/en/series/tanya-1`)).toBe(`${HOSTS.quiet}/en/series/tanya-1/`);
  });

  it("a quiet URL is self-canonical", () => {
    expect(links.canonicalFor(`${HOSTS.quiet}/en/shiur/${ID}/#t=12`)).toBe(`${HOSTS.quiet}/en/shiur/${ID}/`);
    expect(links.canonicalFor(`${HOSTS.quiet}/yi/sources/ramban/`)).toBe(`${HOSTS.quiet}/yi/sources/ramban/`);
  });

  it("holds on workers.dev hosts too", () => {
    const wd = createLinks({ hosts: workersDevHosts("acct"), data: DATA });
    const c = wd.canonicalFor(`${wd.hosts.live}/en/s/${ID}`);
    expect(c).toBe(`https://emunas-quiet.acct.workers.dev/en/shiur/${ID}/`);
  });
});

describe("hreflangAlternates", () => {
  it("quiet shiur: every edition plus x-default to the root", () => {
    expect(links.hreflangAlternates(`/en/shiur/${ID}/#t=845`)).toEqual([
      { hreflang: "en", href: `${HOSTS.quiet}/en/shiur/${ID}/` },
      { hreflang: "yi", href: `${HOSTS.quiet}/yi/shiur/${ID}/` },
      { hreflang: "he", href: `${HOSTS.quiet}/he/shiur/${ID}/` },
      { hreflang: "x-default", href: `${HOSTS.quiet}/` },
    ]);
  });

  it("quiet root lists every edition home", () => {
    expect(links.hreflangAlternates("/")).toEqual([
      { hreflang: "en", href: `${HOSTS.quiet}/en/` },
      { hreflang: "yi", href: `${HOSTS.quiet}/yi/` },
      { hreflang: "he", href: `${HOSTS.quiet}/he/` },
      { hreflang: "x-default", href: `${HOSTS.quiet}/` },
    ]);
  });

  it("live pages use the live host", () => {
    expect(links.hreflangAlternates(`/he/s/${ID}?t=5`, "live")).toEqual([
      { hreflang: "en", href: `${HOSTS.live}/en/s/${ID}` },
      { hreflang: "yi", href: `${HOSTS.live}/yi/s/${ID}` },
      { hreflang: "he", href: `${HOSTS.live}/he/s/${ID}` },
      { hreflang: "x-default", href: `${HOSTS.live}/` },
    ]);
  });

  it("covers exactly UI_LANGS plus x-default", () => {
    expect(links.hreflangAlternates("/yi/").map((h) => h.hreflang)).toEqual([...UI_LANGS, "x-default"]);
  });

  it("every Quiet page type maps to the same page in each edition", () => {
    const paths = ["/en/series/tanya-1/", "/en/calendar/zman/lag-baomer/", "/en/inyanim/emunah/", "/en/search/?q=a", "/en/about/"];
    for (const p of paths) {
      const alts = links.hreflangAlternates(p);
      expect(alts).toHaveLength(EDS.length + 1);
      for (const ed of EDS) {
        expect(alts.find((x) => x.hreflang === ed)?.href).toBe(HOSTS.quiet + p.replace(/^\/en\//, `/${ed}/`));
      }
    }
  });

  it("is empty for non-pages", () => {
    expect(links.hreflangAlternates("/nope/")).toEqual([]);
  });
});

describe("withEdition", () => {
  it("switches edition keeping place", () => {
    expect(links.withEdition(`${HOSTS.quiet}/en/shiur/${ID}/#t=845`, "yi")).toBe(`${HOSTS.quiet}/yi/shiur/${ID}/#t=845`);
    expect(links.withEdition(`${HOSTS.quiet}/yi/shiur/${ID}/#t=845`, "he")).toBe(`${HOSTS.quiet}/he/shiur/${ID}/#t=845`);
    expect(links.withEdition(`${HOSTS.live}/he/s/${ID}?t=5`, "en")).toBe(`${HOSTS.live}/en/s/${ID}?t=5`);
    expect(links.withEdition(`${HOSTS.live}/en/s/${ID}?t=9&read=en`, "yi")).toBe(`${HOSTS.live}/yi/s/${ID}?t=9`);
    expect(links.withEdition(`${HOSTS.quiet}/`, "en")).toBe(`${HOSTS.quiet}/en/`);
    expect(links.withEdition(`${HOSTS.quiet}/audio/a.mp3`, "en")).toBe(`${HOSTS.quiet}/en/`);
  });
});
