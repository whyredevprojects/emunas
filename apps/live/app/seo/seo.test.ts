import { createLinks, type SiteHosts } from "@emunas/links";
import { UI_LANGS } from "@emunas/i18n";
import { describe, expect, it } from "vitest";
import { buildSeoPage, clip, headTags, type HeadTag, type RootSeoData } from "./head.ts";
import { createPageText, linkDataFor, prerenderPaths, todayPaths } from "./model.ts";
import { classifyLivePath, isIndexable, normalizeLivePath } from "./policy.ts";
import { ROBOTS_TXT } from "./robots.ts";
import { corpusFixture, layerCorpusFixture, SHIUR_CATALOG, SHIUR_FULL } from "./test-fixtures.ts";
import { seoHosts } from "./env.ts";

const HOSTS: SiteHosts = { quiet: "https://library.example.org", live: "https://analyze.example.org" };
const links = createLinks({ hosts: HOSTS, data: linkDataFor(corpusFixture) });
const text = createPageText(corpusFixture);

function seoFor(path: string): RootSeoData["seo"] {
  const t = text(path);
  return { hosts: HOSTS, page: t ? buildSeoPage(path, t, links) : null };
}
const find = (tags: HeadTag[], pred: (t: HeadTag) => boolean) => tags.filter(pred);
const canonicals = (tags: HeadTag[]) =>
  find(tags, (t) => t.tag === "link" && t.rel === "canonical").map((t) => (t as { href: string }).href);
const robots = (tags: HeadTag[]) => find(tags, (t) => t.tag === "meta" && "name" in t && t.name === "robots");
const meta = (tags: HeadTag[], key: string) =>
  tags.find((t) => t.tag === "meta" && (("name" in t && t.name === key) || ("property" in t && t.property === key))) as
    | { content: string }
    | undefined;

describe("policy", () => {
  it("classifies every Live route", () => {
    const cases: [string, string, string | null][] = [
      ["/", "root", null],
      ["/en/", "today", null],
      ["/yi", "today", null],
      ["/en/s/abc", "shiur", "abc"],
      ["/en/s/abc/", "shiur", "abc"],
      ["/yi/series", "series-index", null],
      ["/yi/series/tanya-yi", "series", "tanya-yi"],
      ["/en/o/chanukah", "occasion", "chanukah"],
      ["/en/seforim", "works-index", null],
      ["/en/seforim/genesis", "work", "genesis"],
      ["/en/seforim/genesis/3", "work-chapter", "genesis"],
      ["/en/p/achashverosh", "person", "achashverosh"],
      ["/en/c/%D7%90", "concept", "א"],
      ["/en/maasios", "maasios", null],
      ["/en/maasios/sugar-sled", "story", "sugar-sled"],
      ["/en/t/hester-panim", "topic", "hester-panim"],
      ["/yi/th/akeidah", "thread", "akeidah"],
      ["/en/t", "unknown", null],
      ["/en/th/a/b", "unknown", null],
      ["/en/explore", "explore", null],
      ["/en/search", "search", null],
      ["/en/shelf", "shelf", null],
      ["/en/shelf/saved", "shelf", null],
      ["/en/pl", "playlist", null],
      ["/en/nope", "unknown", null],
      ["/fr/s/x", "unknown", null],
      ["/en/s/%E0", "unknown", null],
    ];
    for (const [path, kind, key] of cases) {
      const p = classifyLivePath(path);
      expect([path, p.kind, p.key]).toEqual([path, kind, key]);
    }
  });

  it("indexes content pages only", () => {
    for (const k of ["shiur", "series", "occasion", "work", "person", "concept", "topic", "story"] as const) expect(isIndexable(k)).toBe(true);
    for (const k of ["root", "today", "explore", "search", "shelf", "playlist", "maasios", "thread", "unknown"] as const) {
      expect(isIndexable(k)).toBe(false);
    }
  });

  it("normalizes paths the way the Live links write them", () => {
    expect(normalizeLivePath("/en")).toBe("/en/");
    expect(normalizeLivePath("/en/s/x/")).toBe("/en/s/x");
    expect(normalizeLivePath("/en/s/x?t=3#a")).toBe("/en/s/x");
    expect(normalizeLivePath("")).toBe("/");
    expect(normalizeLivePath("/")).toBe("/");
  });
});

describe("prerender list", () => {
  const { paths, skipped } = prerenderPaths(corpusFixture);

  it("lists Today, shiur, series, occasion (≥2), work and person/concept (livePrerender) per UI", () => {
    for (const ui of UI_LANGS) {
      expect(paths).toContain(`/${ui}`);
      expect(paths).toContain(`/${ui}/s/${SHIUR_FULL}`);
      expect(paths).toContain(`/${ui}/s/${SHIUR_CATALOG}`);
      expect(paths).toContain(`/${ui}/series/tanya-yi`);
      expect(paths).toContain(`/${ui}/o/bereishis`);
      expect(paths).toContain(`/${ui}/o/chanukah`);
      expect(paths).toContain(`/${ui}/o/a-wedding`);
      expect(paths).toContain(`/${ui}/seforim/genesis`);
      expect(paths).toContain(`/${ui}/p/achashverosh`);
      expect(paths).toContain(`/${ui}/c/emunah-1`);
      expect(paths).not.toContain(`/${ui}/o/adar`); // one shiur: no data file
      expect(paths).not.toContain(`/${ui}/seforim/midrash`); // genre label
      expect(paths).not.toContain(`/${ui}/seforim/abudraham`); // < 3 shiurim
      expect(paths).not.toContain(`/${ui}/p/rabbi-x`);
      expect(paths).not.toContain(`/${ui}/c/bitachon-2`);
    }
    expect(paths).toHaveLength(UI_LANGS.length * 10);
    expect(new Set(paths).size).toBe(paths.length);
    expect(skipped).toEqual([]);
  });

  it("never prerenders `/` or app-only routes (the SPA fallback is index.html)", () => {
    expect(paths).not.toContain("/");
    for (const p of paths) {
      const kind = classifyLivePath(p).kind;
      expect(kind === "today" || isIndexable(kind), p).toBe(true);
    }
    expect(todayPaths()).toEqual(["/en", "/yi", "/he"]);
  });

  it("skips routes whose data file was not emitted", () => {
    const files = new Set([`shiur/${SHIUR_FULL}.json`, "series/tanya-yi.json", "entity/o/bereishis.json"]);
    const r = prerenderPaths(corpusFixture, files);
    expect(r.paths).toContain(`/en/s/${SHIUR_FULL}`);
    expect(r.paths).not.toContain(`/en/s/${SHIUR_CATALOG}`);
    expect(r.paths).not.toContain("/en/seforim/genesis");
    expect(r.skipped).toContain(`/yi/s/${SHIUR_CATALOG}`);
    expect(r.paths).toContain("/en"); // Today has no data file of its own
  });

  it("encodes keys as one path segment", () => {
    const c = { ...corpusFixture, people: [{ key: "a b", label: { en: "A", yi: "A", he: "A" }, count: 3, prerender: true }] };
    expect(prerenderPaths(c).paths).toContain("/en/p/a%20b");
  });
});

describe("page text", () => {
  it("uses the shiur's oneLiner in the UI language, and the catalog when there are no notes", () => {
    const full = text(`/en/s/${SHIUR_FULL}`)!;
    expect(full.title).toBe("ולאדם לא מצא עזר כנגדו");
    expect(full.titleLang).toBe("yi");
    expect(full.description).toBe("The Mashgiach explains the bond of Hashem and Knesses Yisrael.");
    expect(text(`/yi/s/${SHIUR_FULL}`)!.description).toBe("דער משגיח ערקלערט.");
    const cat = text(`/en/s/${SHIUR_CATALOG}`)!;
    expect(cat.title).toBe("Emunah — The Everlasting Essence");
    expect(cat.description).toContain("EMUNAH #1 (English)");
    expect(cat.description).toContain("in English");
    const yiCat = text(`/yi/s/${SHIUR_FULL}`)!;
    expect(yiCat.titleLang).toBeNull();
  });

  it("Hebrew pages: the Hebrew oneLiner when translated, else Yiddish, and Hebrew-script titles read as he", () => {
    const he = text(`/he/s/${SHIUR_FULL}`)!;
    expect(he.description).toBe("דער משגיח ערקלערט.");
    expect(he.titleLang).toBeNull();
    const [first, ...rest] = corpusFixture.shiurim;
    const translated = { ...corpusFixture, shiurim: [{ ...first!, oneLiner: { ...first!.oneLiner!, he: "המשגיח מבאר." } }, ...rest] };
    expect(createPageText(translated)(`/he/s/${SHIUR_FULL}`)!.description).toBe("המשגיח מבאר.");
    expect(createPageText(translated)(`/yi/s/${SHIUR_FULL}`)!.description).toBe("דער משגיח ערקלערט.");
    expect(text("/he/series/tanya-yi")!.description).toContain('הגה"צ רבי משה וולפסון זצ"ל');
  });

  it("formats years for catalog-only descriptions", () => {
    const c = { ...corpusFixture, shiurim: [{ ...corpusFixture.shiurim[0]!, oneLiner: null }] };
    expect(createPageText(c)(`/en/s/${SHIUR_FULL}`)!.description).toContain('תשל"ו');
  });

  it("describes series, occasions, works, people and concepts with their counts", () => {
    expect(text("/en/series/tanya-yi")).toMatchObject({ title: "Tanya (Yiddish)" });
    expect(text("/en/series/tanya-yi")!.description).toContain("12 shiurim");
    expect(text("/yi/series/tanya-yi")!.title).toBe("תניא");
    expect(text("/en/o/chanukah")!.description).toContain("2 shiurim");
    expect(text("/yi/o/bereishis")!.title).toBe("בראשית");
    expect(text("/en/seforim/genesis")!.description).toContain("Genesis");
    expect(text("/en/seforim/genesis/3")!.title).toBe("Genesis");
    expect(text("/en/p/achashverosh")!.description).toContain("5 shiurim");
    expect(text("/en/c/emunah-1")!.title).toBe("אמונה");
    expect(text("/en/")!.title).toBe("Analyze — Shiurim");
  });

  it("has nothing for unknown keys and app-only pages", () => {
    expect(text("/en/s/missing")).toBeNull();
    expect(text("/en/search")).toBeNull();
    expect(text("/en/explore")).toBeNull();
  });
});

describe("head tags", () => {
  const allPaths = prerenderPaths(corpusFixture).paths;

  it("every prerendered page: canonical on the Quiet origin, never analyze.*, OG title and description", () => {
    for (const path of allPaths) {
      const tags = headTags(path, seoFor(path));
      const c = canonicals(tags);
      expect(c, path).toHaveLength(1);
      expect(c[0]!.startsWith("https://library.example.org/"), path).toBe(true);
      expect(c[0]!.includes("listen."), path).toBe(false);
      expect(c[0]!.includes("#"), path).toBe(false);
      expect(meta(tags, "og:title")?.content, path).toBeTruthy();
      expect(meta(tags, "og:description")?.content, path).toBeTruthy();
      expect(meta(tags, "description")?.content, path).toBeTruthy();
    }
  });

  it("maps canonicals to the Quiet equivalents (§2.2)", () => {
    const c = (p: string) => canonicals(headTags(p, seoFor(p)))[0];
    expect(c(`/en/s/${SHIUR_FULL}`)).toBe(`https://library.example.org/en/shiur/${SHIUR_FULL}/`);
    expect(c(`/yi/series/tanya-yi`)).toBe("https://library.example.org/yi/series/tanya-yi/");
    expect(c("/en/o/bereishis")).toBe("https://library.example.org/en/calendar/parsha/bereishis/");
    expect(c("/en/o/chanukah")).toBe("https://library.example.org/en/calendar/zman/chanukah/");
    expect(c("/en/o/a-wedding")).toBe("https://library.example.org/en/"); // no Quiet page: edition home
    expect(c("/en/seforim/genesis")).toBe("https://library.example.org/en/sources/genesis/");
    expect(c("/en/p/achashverosh")).toBe("https://library.example.org/en/people/achashverosh/");
    expect(c("/yi/c/emunah-1")).toBe("https://library.example.org/yi/erachim/emunah-1/"); // glossary entry (§3.5)
    expect(c("/en/")).toBe("https://library.example.org/en/");
  });

  it("noindex on app-only routes, not on content pages", () => {
    for (const p of ["/en/", "/yi/", "/en/explore", "/en/search", "/yi/shelf", "/en/shelf/saved", "/en/pl", "/", "/en/x/y"]) {
      expect(robots(headTags(p, seoFor(p))), p).toHaveLength(1);
    }
    for (const p of [`/en/s/${SHIUR_FULL}`, "/en/series/tanya-yi", "/en/o/chanukah", "/en/seforim/genesis", "/en/p/achashverosh"]) {
      expect(robots(headTags(p, seoFor(p))), p).toHaveLength(0);
    }
  });

  it("hreflang alternates for every UI language and x-default on content pages only", () => {
    const tags = headTags(`/en/s/${SHIUR_FULL}`, seoFor(`/en/s/${SHIUR_FULL}`));
    const alts = tags.filter((t) => t.tag === "link" && t.rel === "alternate");
    expect(alts).toEqual([
      { tag: "link", rel: "alternate", hrefLang: "en", href: `https://analyze.example.org/en/s/${SHIUR_FULL}` },
      { tag: "link", rel: "alternate", hrefLang: "yi", href: `https://analyze.example.org/yi/s/${SHIUR_FULL}` },
      { tag: "link", rel: "alternate", hrefLang: "he", href: `https://analyze.example.org/he/s/${SHIUR_FULL}` },
      { tag: "link", rel: "alternate", hrefLang: "x-default", href: "https://analyze.example.org/" },
    ]);
    expect(headTags("/en/search", seoFor("/en/search")).some((t) => t.tag === "link" && t.rel === "alternate")).toBe(false);
  });

  it("OG url is the Live page; locale follows the UI", () => {
    const tags = headTags(`/yi/s/${SHIUR_FULL}`, seoFor(`/yi/s/${SHIUR_FULL}`));
    expect(meta(tags, "og:url")?.content).toBe(`https://analyze.example.org/yi/s/${SHIUR_FULL}`);
    expect(meta(tags, "og:locale")?.content).toBe("yi");
    expect(meta(tags, "og:type")?.content).toBe("article");
    const he = headTags(`/he/s/${SHIUR_FULL}`, seoFor(`/he/s/${SHIUR_FULL}`));
    expect(meta(he, "og:locale")?.content).toBe("he_IL");
    const alternates = he.filter((t) => t.tag === "meta" && "property" in t && t.property === "og:locale:alternate");
    expect(alternates.map((t) => (t as { content: string }).content)).toEqual(["en_US", "yi"]);
  });

  it("on client navigation (page data for another path) keeps robots and canonical, drops OG", () => {
    const data = seoFor(`/en/s/${SHIUR_FULL}`);
    const tags = headTags(`/en/s/${SHIUR_CATALOG}`, data);
    expect(canonicals(tags)).toEqual([`https://library.example.org/en/shiur/${SHIUR_CATALOG}/`]);
    expect(meta(tags, "og:title")).toBeUndefined();
    expect(robots(headTags("/en/search", data))).toHaveLength(1);
  });

  it("SPA fallback document: noindex only; the real path takes over after hydration", () => {
    const data: RootSeoData["seo"] = { hosts: HOSTS, page: null, fallback: true };
    expect(headTags("/", data)).toEqual([{ tag: "meta", name: "robots", content: "noindex" }]);
    expect(canonicals(headTags("/en/p/rabbi-x", data))).toEqual(["https://library.example.org/en/people/rabbi-x/"]);
  });

  it("without configured hosts: no canonical or hreflang, never a guessed origin", () => {
    const t = text(`/en/s/${SHIUR_FULL}`)!;
    const page = buildSeoPage(`/en/s/${SHIUR_FULL}`, t, null);
    const tags = headTags(`/en/s/${SHIUR_FULL}`, { hosts: null, page });
    expect(canonicals(tags)).toEqual([]);
    expect(tags.some((x) => x.tag === "link")).toBe(false);
    expect(meta(tags, "og:url")).toBeUndefined();
    expect(meta(tags, "og:title")?.content).toBe(t.title);
    expect(robots(headTags("/en/search", null))).toHaveLength(1);
  });

  it("clips long descriptions at a word boundary", () => {
    const long = "word ".repeat(100);
    const c = clip(long, 50);
    expect(c.length).toBeLessThanOrEqual(50);
    expect(c.endsWith("…")).toBe(true);
    expect(clip("  a\n b  ")).toBe("a b");
  });
});

describe("env and robots.txt", () => {
  it("reads hosts from EMUNAS_* and VITE_EMUNAS_* variables", () => {
    expect(seoHosts({})).toBeNull();
    expect(seoHosts({ EMUNAS_DOMAIN: "example.org" })).toEqual(HOSTS);
    expect(seoHosts({ VITE_EMUNAS_DOMAIN: "example.org" })).toEqual(HOSTS);
    expect(seoHosts({ EMUNAS_WORKERS_SUBDOMAIN: "acct" })).toEqual({
      quiet: "https://emunas-quiet.acct.workers.dev",
      live: "https://emunas-live.acct.workers.dev",
    });
    expect(seoHosts({ EMUNAS_QUIET_ORIGIN: "http://localhost:4321" })).toBeNull();
    expect(() => seoHosts({ EMUNAS_DOMAIN: "analyze.example.org" })).toThrow();
  });

  it("robots.txt allows all and disallows /api/ and /admin/, no sitemap", () => {
    expect(ROBOTS_TXT).toContain("User-agent: *\nAllow: /");
    expect(ROBOTS_TXT).toContain("Disallow: /api/");
    expect(ROBOTS_TXT).toContain("Disallow: /admin/");
    expect(ROBOTS_TXT.toLowerCase()).not.toContain("sitemap");
  });
});

describe("corpus layer (C1.7)", () => {
  const lLinks = createLinks({ hosts: HOSTS, data: linkDataFor(layerCorpusFixture) });
  const lText = createPageText(layerCorpusFixture);
  const lSeo = (path: string): RootSeoData["seo"] => {
    const t = lText(path);
    return { hosts: HOSTS, page: t ? buildSeoPage(path, t, lLinks) : null };
  };

  it("prerenders every topic, threads and stories with a page, and corpus-id entity pages, per UI", () => {
    const { paths } = prerenderPaths(layerCorpusFixture);
    for (const ui of ["en", "yi"]) {
      for (const p of ["t/hester-panim", "t/rare-topic", "th/akeidah-last-generation", "maasios/sugar-sled", "seforim/bereishis", "p/moshe-rabbeinu", "c/tzimtzum"]) {
        expect(paths, p).toContain(`/${ui}/${p}`);
      }
      // Below the line: a two-shiur thread, a story told once, a person with one shiur, a concept merged into a topic.
      for (const p of ["th/two-member", "maasios/told-once", "p/a-local", "c/hester-panim"]) expect(paths, p).not.toContain(`/${ui}/${p}`);
    }
    const files = new Set(["topic/hester-panim.json", "story/sugar-sled.json"]);
    const r = prerenderPaths(layerCorpusFixture, files);
    expect(r.paths).toContain("/en/t/hester-panim");
    expect(r.skipped).toContain("/en/th/akeidah-last-generation");
  });

  it("canonical to Quiet where Quiet has the page; otherwise noindex and no canonical", () => {
    const tagsOf = (p: string) => headTags(p, lSeo(p));
    expect(canonicals(tagsOf("/en/t/hester-panim"))).toEqual(["https://library.example.org/en/inyanim/hester-panim/"]);
    expect(robots(tagsOf("/en/t/hester-panim"))).toHaveLength(0);
    expect(canonicals(tagsOf("/en/maasios/sugar-sled"))).toEqual(["https://library.example.org/en/stories/sugar-sled/"]);
    for (const p of ["/en/t/rare-topic", "/yi/th/akeidah-last-generation"]) {
      const tags = tagsOf(p);
      expect(canonicals(tags), p).toEqual([]);
      expect(robots(tags), p).toHaveLength(1);
      expect(tags.some((t) => t.tag === "link" && t.rel === "alternate"), p).toBe(false);
      expect(meta(tags, "og:title")?.content, p).toBeTruthy();
    }
  });

  it("thread pages are noindex even on client navigation, and their description is not the summary", () => {
    const t = lText("/en/th/akeidah-last-generation")!;
    expect(t.description).toContain("8 shiurim");
    expect(t.noindex).toBe(true);
    const tags = headTags("/en/th/akeidah-last-generation", { hosts: HOSTS, page: null });
    expect(robots(tags)).toHaveLength(1);
    expect(canonicals(tags)).toEqual([]);
  });

  it("describes topics and stories with their counts", () => {
    expect(lText("/en/t/hester-panim")).toMatchObject({ title: "Hester Panim", kind: "topic" });
    expect(lText("/en/t/hester-panim")!.description).toContain("112 shiurim");
    expect(lText("/yi/maasios/sugar-sled")!.title).toBe("דער צוקער שליטן");
    expect(lText("/en/maasios/sugar-sled")!.description).toContain("14 times");
    expect(lText("/en/t/missing")).toBeNull();
  });

  it("links: a merged concept goes to its topic; pages below the line have no Live link", () => {
    expect(lLinks.live.concept("en", "hester-panim")).toBe("https://analyze.example.org/en/t/hester-panim");
    expect(lLinks.hrefFor("live", { kind: "entry", ed: "en", entry: "story", id: "told-once" })).toBeNull();
    expect(lLinks.hrefFor("live", { kind: "entry", ed: "en", entry: "thread", id: "akeidah-last-generation" })).toBe(
      "https://analyze.example.org/en/th/akeidah-last-generation",
    );
  });
});
