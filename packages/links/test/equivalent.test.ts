import { describe, expect, it } from "vitest";
import { UI_LANGS } from "@emunas/i18n";
import { createLinks, EDS, formatQuiet, isEd, livePaths, parseLive, parseQuiet, quietPaths } from "../src/index.ts";
import { DATA, HOSTS, links } from "./fixtures.ts";

const Q = quietPaths(DATA);
const ID = "yi-parshas-hashavua-brshys-01";
const EN_ID = "en-parsha-en-nch-01";

function roundTrip(quietUrl: string): string | null {
  const live = links.equivalent(quietUrl);
  expect(live).not.toBeNull();
  expect(live!.startsWith(`${HOSTS.live}/`)).toBe(true);
  return links.equivalent(live!);
}

describe("equivalent(quiet → live → quiet) is identity", () => {
  for (const ed of EDS) {
    const cases: Record<string, string[]> = {
      shiur: [Q.shiur(ed, ID), Q.shiur(ed, EN_ID), Q.shiur(ed, "yi-tanya-1-01")],
      time: [0, 1, 754, 3599, 86_399].map((t) => Q.shiur(ed, ID, { t })),
      series: [Q.series(ed, "tanya-1"), Q.series(ed, "parshas-hashavua-yi")],
      occasion: [Q.parsha(ed, "bereishis"), Q.parsha(ed, "noach"), Q.zman(ed, "lag-baomer"), Q.zman(ed, "shavuos")],
      work: [Q.work(ed, "ramban"), Q.work(ed, "sfas-emes"), Q.work(ed, "rare-sefer")],
      person: [Q.person(ed, "dovid-hamelech"), Q.person(ed, "baal-shem-tov"), Q.person(ed, "once-mentioned")],
      "glossary entry": [Q.glossaryEntry(ed, "emunah"), Q.glossaryEntry(ed, "hisbodedus"), Q.glossaryEntry(ed, "two-only")],
      topic: [Q.topic(ed, "emunah-topic"), Q.topic(ed, "hashgacha-pratis")],
      story: [Q.story(ed, "the-sugar-sled")],
    };
    for (const [name, paths] of Object.entries(cases)) {
      it(`${name} (${ed})`, () => {
        for (const p of paths) expect(roundTrip(HOSTS.quiet + p)).toBe(HOSTS.quiet + p);
      });
    }
  }
});

describe("quiet entries without a page of their own (layer page flags)", () => {
  it("map to the index anchor", () => {
    expect(links.equivalent(`${HOSTS.live}/en/p/once-mentioned`)).toBe(`${HOSTS.quiet}/en/people/#once-mentioned`);
    expect(links.equivalent(`${HOSTS.live}/yi/seforim/rare-sefer`)).toBe(`${HOSTS.quiet}/yi/sources/#rare-sefer`);
    expect(links.equivalent(`${HOSTS.live}/en/c/two-only`)).toBe(`${HOSTS.quiet}/en/erachim/#two-only`);
    // with a page of its own
    expect(links.equivalent(`${HOSTS.live}/en/p/baal-shem-tov`)).toBe(`${HOSTS.quiet}/en/people/baal-shem-tov/`);
    expect(links.equivalent(`${HOSTS.live}/en/c/hisbodedus`)).toBe(`${HOSTS.quiet}/en/erachim/hisbodedus/`);
  });

  it("builders use the page flags; without a flag the page is assumed to exist", () => {
    expect(Q.person("yi", "once-mentioned")).toBe("/yi/people/#once-mentioned");
    expect(Q.glossaryEntry("yi", "two-only")).toBe("/yi/erachim/#two-only");
    expect(Q.glossaryEntry("yi", "hisbodedus")).toBe("/yi/erachim/hisbodedus/");
    expect(quietPaths().work("en", "unknown")).toBe("/en/sources/unknown/");
  });

  it("has no legacy normalize-keyed entity address (C3.1)", () => {
    expect(quietPaths()).not.toHaveProperty("concept");
    expect(formatQuiet({ kind: "index", ed: "yi", index: "topics" })).toBe("/yi/inyanim/");
  });

  it("an index anchor parses back to the entity", () => {
    expect(links.equivalent(`${HOSTS.quiet}/en/people/#once-mentioned`)).toBe(`${HOSTS.live}/en/p/once-mentioned`);
    // bare index without anchor is the index page
    expect(links.equivalent(`${HOSTS.quiet}/en/sources/`)).toBe(`${HOSTS.live}/en/seforim`);
  });
});

describe("live → quiet", () => {
  it("drops live-only params", () => {
    expect(links.equivalent(`${HOSTS.live}/en/s/${ID}?t=754&audio=yi,en&read=en&lens=list`)).toBe(
      `${HOSTS.quiet}/en/shiur/${ID}/#t=754`,
    );
    expect(links.equivalent(`${HOSTS.live}/yi/search?q=emunah&audio=yi&kind=section`)).toBe(
      `${HOSTS.quiet}/yi/search/?q=emunah`,
    );
    // Explore opens on the topic map: the Quiet topic tree
    expect(links.equivalent(`${HOSTS.live}/en/explore?lens=luach&unit=moments`)).toBe(`${HOSTS.quiet}/en/inyanim/`);
  });

  it("keeps the time of a moment and drops the moment itself (Quiet links a place by its time)", () => {
    expect(links.equivalent(`${HOSTS.live}/en/s/${ID}?t=900&m=${ID}~s2`)).toBe(`${HOSTS.quiet}/en/shiur/${ID}/#t=900`);
    expect(links.equivalent(`${HOSTS.live}/en/s/${ID}?t=900&m=${ID}~st1`)).toBe(`${HOSTS.quiet}/en/shiur/${ID}/#t=900`);
    expect(links.equivalent(`${HOSTS.live}/en/s/${ID}?m=${ID}~s2`)).toBe(`${HOSTS.quiet}/en/shiur/${ID}/`);
    expect(links.equivalent(`${HOSTS.live}/en/s/${ID}?m=${ID}~q0`)).toBe(`${HOSTS.quiet}/en/shiur/${ID}/`);
  });

  it("ignores a moment from another shiur and bad times", () => {
    expect(links.equivalent(`${HOSTS.live}/en/s/${ID}?m=other~s2`)).toBe(`${HOSTS.quiet}/en/shiur/${ID}/`);
    expect(links.equivalent(`${HOSTS.live}/en/s/${ID}?t=-5`)).toBe(`${HOSTS.quiet}/en/shiur/${ID}/`);
    expect(links.equivalent(`${HOSTS.live}/en/s/${ID}?t=abc`)).toBe(`${HOSTS.quiet}/en/shiur/${ID}/`);
  });

  it("maps live-only listings to the closest quiet page", () => {
    expect(links.equivalent(`${HOSTS.live}/yi/seforim`)).toBe(`${HOSTS.quiet}/yi/sources/`);
    expect(links.equivalent(`${HOSTS.live}/yi/seforim/ramban/12`)).toBe(`${HOSTS.quiet}/yi/sources/ramban/`);
    expect(links.equivalent(`${HOSTS.live}/en/maasios`)).toBe(`${HOSTS.quiet}/en/stories/`);
    expect(links.equivalent(`${HOSTS.live}/en/series`)).toBe(`${HOSTS.quiet}/en/contents/`);
    expect(links.equivalent(`${HOSTS.live}/en/shelf/queue`)).toBe(`${HOSTS.quiet}/en/`);
    expect(links.equivalent(`${HOSTS.live}/en/pl`)).toBe(`${HOSTS.quiet}/en/`);
    expect(links.equivalent(`${HOSTS.live}/`)).toBe(`${HOSTS.quiet}/`);
  });

  it("an occasion of unknown kind falls back to the edition home", () => {
    expect(links.equivalent(`${HOSTS.live}/en/o/unknown-occasion`)).toBe(`${HOSTS.quiet}/en/`);
    const bare = createLinks({ hosts: HOSTS });
    expect(bare.equivalent(`${HOSTS.live}/en/o/noach`)).toBe(`${HOSTS.quiet}/en/`);
  });

  it("unknown paths fall back to the edition home or the root", () => {
    expect(links.equivalent(`${HOSTS.live}/en/nonsense/path`)).toBe(`${HOSTS.quiet}/en/`);
    expect(links.equivalent(`${HOSTS.live}/fr/s/x`)).toBe(`${HOSTS.quiet}/`);
    expect(links.equivalent(`${HOSTS.live}/en/s/%E0%A4%A`)).toBe(`${HOSTS.quiet}/`);
  });
});

describe("quiet → live", () => {
  it("maps quiet-only pages", () => {
    expect(links.equivalent(`${HOSTS.quiet}/en/contents/`)).toBe(`${HOSTS.live}/en/`);
    expect(links.equivalent(`${HOSTS.quiet}/yi/section/chumash/`)).toBe(`${HOSTS.live}/yi/`);
    expect(links.equivalent(`${HOSTS.quiet}/yi/years/5743/`)).toBe(`${HOSTS.live}/yi/`);
    expect(links.equivalent(`${HOSTS.quiet}/yi/stories/`)).toBe(`${HOSTS.live}/yi/maasios`);
    expect(links.equivalent(`${HOSTS.quiet}/en/about/`)).toBe(`${HOSTS.live}/en/`);
    expect(links.equivalent(`${HOSTS.quiet}/en/calendar/zman/`)).toBe(`${HOSTS.live}/en/`);
  });

  it("has no section anchor: `#s{i}` is the shiur itself", () => {
    expect(links.equivalent(`${HOSTS.quiet}/en/shiur/x-1/#s4`)).toBe(`${HOSTS.live}/en/s/x-1`);
  });

  it("tolerates missing trailing slashes and percent-encoded keys", () => {
    expect(links.equivalent(`${HOSTS.quiet}/en/shiur/${ID}`)).toBe(`${HOSTS.live}/en/s/${ID}`);
    expect(links.equivalent(`${HOSTS.quiet}/en/people/a%20b/`)).toBe(`${HOSTS.live}/en/p/a%20b`);
  });
});

describe("site detection", () => {
  it("needs `from` for relative paths and rejects foreign origins", () => {
    expect(links.equivalent(`/en/s/${ID}`)).toBeNull();
    expect(links.equivalent(`/en/s/${ID}`, "live")).toBe(`${HOSTS.quiet}/en/shiur/${ID}/`);
    expect(links.equivalent(`https://evil.example/en/s/${ID}`)).toBeNull();
    expect(links.equivalent("not a url")).toBeNull();
  });

  it("matches origins case-insensitively", () => {
    expect(links.siteOf("HTTPS://Analyze.Emunas.Example/en/")).toBe("live");
  });
});

describe("Hebrew edition", () => {
  it("parses and formats /he/ like every other edition on both sites", () => {
    expect(parseQuiet("/he/shiur/a/#t=12.5")).toEqual({ kind: "shiur", ed: "he", id: "a", t: 12.5 });
    expect(parseLive("/he/s/a?t=3")).toEqual({ kind: "shiur", ed: "he", id: "a", t: 3 });
    expect(quietPaths().home("he")).toBe("/he/");
    expect(livePaths().search("he", "אמונה")).toBe(`/he/search?q=${encodeURIComponent("אמונה")}`);
    expect(parseQuiet("/fr/")).toBeNull();
  });

  it("isEd follows UI_LANGS", () => {
    for (const l of UI_LANGS) expect(isEd(l)).toBe(true);
    expect(EDS).toEqual(UI_LANGS);
    expect(isEd("de")).toBe(false);
  });
});

describe("builders reject bad input", () => {
  it("throws on bad editions, ids and moments", () => {
    expect(() => quietPaths().home("de" as "en")).toThrow(TypeError);
    expect(() => livePaths().home("de" as "en")).toThrow(/edition must be one of "en", "yi", "he"/);
    expect(() => quietPaths().shiur("en", "")).toThrow(TypeError);
    expect(() => quietPaths().shiur("en", "a/b")).toThrow(TypeError);
    expect(() => livePaths().shiur("en", "a", { m: "b~s1" })).toThrow(TypeError);
  });

  it("ignores unusable times", () => {
    expect(livePaths().shiur("en", "a", { t: Number.NaN })).toBe("/en/s/a");
    expect(quietPaths().shiur("en", "a", { t: -1 })).toBe("/en/shiur/a/");
    expect(livePaths().shiur("en", "a", { t: 12.6, m: { kind: "kp", index: 0 } })).toBe("/en/s/a?t=12.6&m=a~kp0");
  });
});
