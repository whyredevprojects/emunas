import { createLinks, type Hosts } from "@emunas/links";
import { describe, expect, it } from "vitest";
import { buildSeoPage, clip, headTags, type HeadTag, type RootSeoData } from "./head.ts";
import { createPageText, linkDataFor, prerenderPaths, todayPaths } from "./model.ts";
import { classifyLivePath, isIndexable, normalizeLivePath } from "./policy.ts";
import { ROBOTS_TXT } from "./robots.ts";
import { corpusFixture, SHIUR_CATALOG, SHIUR_FULL } from "./test-fixtures.ts";
import { seoHosts } from "./env.ts";

const HOSTS: Hosts = { quiet: "https://example.org", live: "https://listen.example.org" };
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
    for (const k of ["shiur", "series", "occasion", "work", "person", "concept"] as const) expect(isIndexable(k)).toBe(true);
    for (const k of ["root", "today", "explore", "search", "shelf", "playlist", "maasios", "unknown"] as const) {
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
    for (const ui of ["en", "yi"]) {
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
    expect(paths).toHaveLength(2 * 10);
    expect(new Set(paths).size).toBe(paths.length);
    expect(skipped).toEqual([]);
  });

  it("never prerenders `/` or app-only routes (the SPA fallback is index.html)", () => {
    expect(paths).not.toContain("/");
    for (const p of paths) {
      const kind = classifyLivePath(p).kind;
      expect(kind === "today" || isIndexable(kind), p).toBe(true);
    }
    expect(todayPaths()).toEqual(["/en", "/yi"]);
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
    const c = { ...corpusFixture, people: [{ key: "a b", label: { en: "A", yi: "A" }, count: 3, prerender: true }] };
    expect(prerenderPaths(c).paths).toContain("/en/p/a%20b");
  });
});

describe("page text", () => {
  it("uses the shiur's oneLiner in the UI language, and the catalog when there are no notes", () => {
    const full = text(`/en/s/${SHIUR_FULL}`)!;
    expect(full.title).toBe("ולאדם לא מצא עזר כנגדו");
    expect(full.titleLang).toBe("yi");
    expect(full.description).toBe("The Rav explains the bond of Hashem and Knesses Yisrael.");
    expect(text(`/yi/s/${SHIUR_FULL}`)!.description).toBe("דער משגיח ערקלערט.");
    const cat = text(`/en/s/${SHIUR_CATALOG}`)!;
    expect(cat.title).toBe("Emunah — The Everlasting Essence");
    expect(cat.description).toContain("EMUNAH #1 (English)");
    expect(cat.description).toContain("in English");
    const yiCat = text(`/yi/s/${SHIUR_FULL}`)!;
    expect(yiCat.titleLang).toBeNull();
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
    expect(text("/en/")!.title).toBe("Emunas — Listen");
  });

  it("has nothing for unknown keys and app-only pages", () => {
    expect(text("/en/s/missing")).toBeNull();
    expect(text("/en/search")).toBeNull();
    expect(text("/en/explore")).toBeNull();
  });
});

describe("head tags", () => {
  const allPaths = prerenderPaths(corpusFixture).paths;

  it("every prerendered page: canonical on the Quiet origin, never listen.*, OG title and description", () => {
    for (const path of allPaths) {
      const tags = headTags(path, seoFor(path));
      const c = canonicals(tags);
      expect(c, path).toHaveLength(1);
      expect(c[0]!.startsWith("https://example.org/"), path).toBe(true);
      expect(c[0]!.includes("listen."), path).toBe(false);
      expect(c[0]!.includes("#"), path).toBe(false);
      expect(meta(tags, "og:title")?.content, path).toBeTruthy();
      expect(meta(tags, "og:description")?.content, path).toBeTruthy();
      expect(meta(tags, "description")?.content, path).toBeTruthy();
    }
  });

  it("maps canonicals to the Quiet equivalents (§2.2)", () => {
    const c = (p: string) => canonicals(headTags(p, seoFor(p)))[0];
    expect(c(`/en/s/${SHIUR_FULL}`)).toBe(`https://example.org/en/shiur/${SHIUR_FULL}/`);
    expect(c(`/yi/series/tanya-yi`)).toBe("https://example.org/yi/series/tanya-yi/");
    expect(c("/en/o/bereishis")).toBe("https://example.org/en/calendar/parsha/bereishis/");
    expect(c("/en/o/chanukah")).toBe("https://example.org/en/calendar/zman/chanukah/");
    expect(c("/en/o/a-wedding")).toBe("https://example.org/en/"); // no Quiet page: edition home
    expect(c("/en/seforim/genesis")).toBe("https://example.org/en/sources/genesis/");
    expect(c("/en/p/achashverosh")).toBe("https://example.org/en/people/achashverosh/");
    expect(c("/yi/c/emunah-1")).toBe("https://example.org/yi/erachim/emunah-1/"); // glossary entry (§3.5)
    expect(c("/en/")).toBe("https://example.org/en/");
  });

  it("noindex on app-only routes, not on content pages", () => {
    for (const p of ["/en/", "/yi/", "/en/explore", "/en/search", "/yi/shelf", "/en/shelf/saved", "/en/pl", "/", "/en/x/y"]) {
      expect(robots(headTags(p, seoFor(p))), p).toHaveLength(1);
    }
    for (const p of [`/en/s/${SHIUR_FULL}`, "/en/series/tanya-yi", "/en/o/chanukah", "/en/seforim/genesis", "/en/p/achashverosh"]) {
      expect(robots(headTags(p, seoFor(p))), p).toHaveLength(0);
    }
  });

  it("hreflang alternates for both UI languages and x-default on content pages only", () => {
    const tags = headTags(`/en/s/${SHIUR_FULL}`, seoFor(`/en/s/${SHIUR_FULL}`));
    const alts = tags.filter((t) => t.tag === "link" && t.rel === "alternate");
    expect(alts).toEqual([
      { tag: "link", rel: "alternate", hrefLang: "yi", href: `https://listen.example.org/yi/s/${SHIUR_FULL}` },
      { tag: "link", rel: "alternate", hrefLang: "en", href: `https://listen.example.org/en/s/${SHIUR_FULL}` },
      { tag: "link", rel: "alternate", hrefLang: "x-default", href: "https://listen.example.org/" },
    ]);
    expect(headTags("/en/search", seoFor("/en/search")).some((t) => t.tag === "link" && t.rel === "alternate")).toBe(false);
  });

  it("OG url is the Live page; locale follows the UI", () => {
    const tags = headTags(`/yi/s/${SHIUR_FULL}`, seoFor(`/yi/s/${SHIUR_FULL}`));
    expect(meta(tags, "og:url")?.content).toBe(`https://listen.example.org/yi/s/${SHIUR_FULL}`);
    expect(meta(tags, "og:locale")?.content).toBe("yi");
    expect(meta(tags, "og:type")?.content).toBe("article");
  });

  it("on client navigation (page data for another path) keeps robots and canonical, drops OG", () => {
    const data = seoFor(`/en/s/${SHIUR_FULL}`);
    const tags = headTags(`/en/s/${SHIUR_CATALOG}`, data);
    expect(canonicals(tags)).toEqual([`https://example.org/en/shiur/${SHIUR_CATALOG}/`]);
    expect(meta(tags, "og:title")).toBeUndefined();
    expect(robots(headTags("/en/search", data))).toHaveLength(1);
  });

  it("SPA fallback document: noindex only; the real path takes over after hydration", () => {
    const data: RootSeoData["seo"] = { hosts: HOSTS, page: null, fallback: true };
    expect(headTags("/", data)).toEqual([{ tag: "meta", name: "robots", content: "noindex" }]);
    expect(canonicals(headTags("/en/p/rabbi-x", data))).toEqual(["https://example.org/en/people/rabbi-x/"]);
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
    expect(() => seoHosts({ EMUNAS_DOMAIN: "listen.example.org" })).toThrow();
  });

  it("robots.txt allows all and disallows /api/ and /admin/, no sitemap", () => {
    expect(ROBOTS_TXT).toContain("User-agent: *\nAllow: /");
    expect(ROBOTS_TXT).toContain("Disallow: /api/");
    expect(ROBOTS_TXT).toContain("Disallow: /admin/");
    expect(ROBOTS_TXT.toLowerCase()).not.toContain("sitemap");
  });
});
