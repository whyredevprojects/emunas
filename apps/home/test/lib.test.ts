import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fontManifest } from "@emunas/tokens";
import { describe, expect, it } from "vitest";
import { ARTICLE_INFO, ESSAY_HEBREW, FEATURED_ESSAYS, SEFARIM } from "../src/lib/content.ts";
import { fileLinks } from "../src/lib/check-files.ts";
import { fontPreloads, homeFontsCss } from "../src/lib/fonts.ts";
import { ARTICLES, ESSAYS, ESSAY_GROUP_LISTS, LEGACY_FILES, fileAt } from "../src/lib/legacy-files.ts";
import { formatSize, parseLegacyFiles, slugOf, splitTitle } from "../src/lib/legacy-schema.ts";
import { PAGES, SITEMAP_PATHS, headTags, hreflangFor, robotsTxt, sitemapXml } from "../src/lib/seo.ts";
import { siteLinks } from "../src/lib/langs.ts";
import { HOME_DEFAULT_LANG, englishAttrs, homePath, langOfPath, langStaticPaths, pathInLang, switchHomeLang } from "../src/lib/lang-path.ts";
import { siteEnv } from "../src/lib/site-env.ts";
import { placeholders, segments, tables, type UiKey } from "../src/i18n/index.ts";
import { UI_LANGS, otherUiLangs, type Message } from "@emunas/i18n";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");

const good = {
  key: "site/files/essays/noach.pdf",
  path: "/files/essays/noach.pdf",
  kind: "essay",
  title: "Noach: Escorted by the Succah",
  group: "Bereishis",
  order: 2,
  sizeBytes: 149610,
  sha256: "a".repeat(64),
  contentType: "application/pdf",
  originalUrl: "https://www.emunas.com/uploads/x.pdf",
};

describe("parseLegacyFiles", () => {
  it("accepts a valid manifest", () => {
    expect(parseLegacyFiles([good])).toHaveLength(1);
  });
  it.each([
    ["not an array", {}],
    ["no essays", []],
    ["key/path mismatch", [{ ...good, key: "site/files/essays/other.pdf" }]],
    ["path outside /files/", [{ ...good, path: "/uploads/noach.pdf" }]],
    ["essay in the wrong directory", [{ ...good, path: "/files/articles/noach.pdf", key: "site/files/articles/noach.pdf" }]],
    ["bad group", [{ ...good, group: "Mishlei" }]],
    ["group on an article", [good, { ...good, kind: "article", path: "/files/articles/a.pdf", key: "site/files/articles/a.pdf", group: "Shemos" }]],
    ["bad hash", [{ ...good, sha256: "xyz" }]],
    ["zero size", [{ ...good, sizeBytes: 0 }]],
    ["duplicate path", [good, good]],
  ])("rejects %s", (_, raw) => {
    expect(() => parseLegacyFiles(raw)).toThrow();
  });
});

describe("the manifest in src/data", () => {
  it("has the essays in every group, both articles and the portrait", () => {
    expect(ESSAYS.length).toBeGreaterThan(40);
    expect(ESSAY_GROUP_LISTS.map((g) => g.group)).toEqual(["Bereishis", "Shemos", "Vayikra", "Bamidbar", "Devarim", "Yomim Tovim"]);
    expect(ARTICLES).toHaveLength(2);
    expect(fileAt("/files/images/portrait.jpg").kind).toBe("image");
    expect(LEGACY_FILES.length).toBe(ESSAYS.length + ARTICLES.length + 1);
  });
  it("has a Hebrew cover name for every essay", () => {
    expect(ESSAYS.filter((e) => ESSAY_HEBREW[slugOf(e)] === undefined).map((e) => e.path)).toEqual([]);
  });
  it("has cover details for every article and the featured essays exist", () => {
    for (const a of ARTICLES) expect(ARTICLE_INFO[a.path], a.path).toBeDefined();
    for (const p of FEATURED_ESSAYS) expect(fileAt(p).kind).toBe("essay");
  });
});

describe("content", () => {
  it("lists ten sefarim with https publisher links", () => {
    expect(SEFARIM).toHaveLength(10);
    for (const s of SEFARIM) expect(s.href).toMatch(/^https:\/\//);
  });
  it("keeps the shared Festivals of Faith subtitle off the four Festivals books", () => {
    expect(SEFARIM.filter((s) => s.subtitle?.includes("radiance of Shabbos")).map((s) => s.title)).toEqual(["Feast of Faith"]);
  });
});

describe("helpers", () => {
  it("splits titles and formats sizes", () => {
    expect(splitTitle("Noach: Escorted by the Succah")).toEqual({ head: "Noach", sub: "Escorted by the Succah" });
    expect(splitTitle("Plain")).toEqual({ head: "Plain", sub: null });
    expect(formatSize(149610)).toBe("146 KB");
    expect(formatSize(19375065)).toBe("18 MB");
    expect(formatSize(4307368)).toBe("4.1 MB");
  });
  it("finds /files/ links in href and src, on any origin", () => {
    const html = `<a href="/files/essays/a.pdf">a</a><img src='/files/images/p.jpg'><a href="https://x.org/files/b.pdf#p2">b</a><a href="/essays/">e</a>`;
    expect(fileLinks(html)).toEqual(["/files/essays/a.pdf", "/files/images/p.jpg", "/files/b.pdf"]);
  });
});

describe("site env and SEO", () => {
  it("derives home, library and listen from EMUNAS_DOMAIN", () => {
    const e = siteEnv({ EMUNAS_DOMAIN: "example.org" });
    expect(e.placeholder).toBe(false);
    expect(e.hosts).toEqual({ home: "https://example.org", quiet: "https://library.example.org", live: "https://analyze.example.org" });
    const l = siteLinks(e.hosts, "en");
    expect(l.library).toBe("https://library.example.org/en/");
    expect(l.listen).toBe("https://analyze.example.org/en/");
    expect(l.libraryEditions).toEqual([
      { lang: "yi", dir: "rtl", name: "אידיש", href: "https://library.example.org/yi/" },
      { lang: "he", dir: "rtl", name: "עברית", href: "https://library.example.org/he/" },
    ]);
    expect(l.listenEditions.map((x) => x.href)).toEqual(["https://analyze.example.org/yi/", "https://analyze.example.org/he/"]);
    const h = siteLinks(e.hosts, "he");
    expect(h.library).toBe("https://library.example.org/he/");
    expect(h.listen).toBe("https://analyze.example.org/he/");
    expect(h.libraryEditions.map((x) => x.lang)).toEqual(["en", "yi"]);
  });
  it("uses noindex placeholders outside a deploy build and fails in one", () => {
    expect(siteEnv({}).placeholder).toBe(true);
    expect(() => siteEnv({ CI: "1", EMUNAS_DEPLOY: "1" })).toThrow(/no site hosts/);
  });
  it("is self-canonical on the home origin, with every language as an alternate", () => {
    const t = headTags({ lang: "en", page: "/essays/", title: "Essays", description: "d", siteName: "Emunas" }, "https://example.org");
    expect(t.canonical).toBe("https://example.org/essays/");
    expect(t.robots).toBeNull();
    expect(t.alternates).toEqual([
      { hreflang: "en", href: "https://example.org/essays/" },
      { hreflang: "yi", href: "https://example.org/yi/essays/" },
      { hreflang: "he", href: "https://example.org/he/essays/" },
      { hreflang: "x-default", href: "https://example.org/essays/" },
    ]);
    expect(t.og).toContainEqual({ property: "og:locale", content: "en_US" });
    const he = headTags({ lang: "he", page: "/essays/", title: "מאמרים", description: "d", siteName: "אמונת" }, "https://example.org");
    expect(he.canonical).toBe("https://example.org/he/essays/");
    expect(he.og).toContainEqual({ property: "og:locale", content: "he_IL" });
    expect(he.alternates).toEqual(hreflangFor("/essays/", "https://example.org"));
    const p = headTags({ lang: "en", page: "/essays/", title: "Essays", description: "d", siteName: "Emunas" }, "https://example.org", { placeholder: true });
    expect(p.canonical).toBeNull();
    expect(p.alternates).toEqual([]);
    expect(p.robots).toBe("noindex");
  });
  it("lists every page in every language in the sitemap", () => {
    expect(SITEMAP_PATHS).toHaveLength(PAGES.length * UI_LANGS.length);
    expect(SITEMAP_PATHS).toContain("/");
    expect(SITEMAP_PATHS).toContain("/he/");
    expect(SITEMAP_PATHS).toContain("/yi/about/");
    expect(SITEMAP_PATHS.some((p) => p.startsWith(`/${HOME_DEFAULT_LANG}/`))).toBe(false);
  });
  it("writes the sitemap and robots.txt", () => {
    expect(sitemapXml("https://example.org", ["/", "/a/"])).toContain("<loc>https://example.org/a/</loc>");
    expect(robotsTxt("https://example.org")).toContain("Sitemap: https://example.org/sitemap.xml");
    expect(robotsTxt("https://example.org", { placeholder: true })).toContain("Disallow: /");
  });
});

describe("language paths", () => {
  it("puts the default language at the root and every other under its code", () => {
    expect(homePath(HOME_DEFAULT_LANG, "/about/")).toBe("/about/");
    expect(homePath("he", "/about/")).toBe("/he/about/");
    expect(homePath("yi", "/")).toBe("/yi/");
    expect(() => homePath("he", "about/")).toThrow();
  });
  it("reads and switches the language of a path", () => {
    expect(langOfPath("/he/about/")).toBe("he");
    expect(langOfPath("/about/")).toBe(HOME_DEFAULT_LANG);
    expect(langOfPath("/hebrew/")).toBe(HOME_DEFAULT_LANG);
    expect(pathInLang("/yi/")).toBe("/");
    expect(pathInLang("/yi/essays/")).toBe("/essays/");
    expect(switchHomeLang("/about/", "he")).toBe("/he/about/");
    expect(switchHomeLang("/he/about/", "yi")).toBe("/yi/about/");
    expect(switchHomeLang("/he/", HOME_DEFAULT_LANG)).toBe("/");
  });
  it("generates one static path per interface language, the default without a prefix", () => {
    expect(langStaticPaths()).toEqual(UI_LANGS.map((lang) => ({ params: { lang: lang === HOME_DEFAULT_LANG ? undefined : lang }, props: { lang } })));
  });
  it("marks English text only on a page in another language", () => {
    expect(englishAttrs("en")).toEqual({});
    for (const l of otherUiLangs("en")) expect(englishAttrs(l)).toEqual({ lang: "en", dir: "ltr" });
  });
});

describe("UI strings", () => {
  const texts = (m: Message): string[] => (typeof m === "string" ? [m] : Object.values(m).filter((v): v is string => typeof v === "string"));
  const keys = Object.keys(tables.en) as UiKey[];

  it("splits a message at its placeholders", () => {
    expect(segments("Call {phone} now")).toEqual(["Call ", { name: "phone" }, " now"]);
    expect(placeholders("{b} and {a}")).toEqual(["a", "b"]);
  });
  it("keeps every placeholder of the English message in each translation", () => {
    const bad: string[] = [];
    for (const lang of otherUiLangs("en")) {
      for (const k of keys) {
        const want = placeholders(texts(tables.en[k]).join(" ")).filter((n) => n !== "count");
        const got = new Set(placeholders(texts(tables[lang][k]).join(" ")));
        for (const n of want) if (!got.has(n)) bad.push(`${lang} ${k}: {${n}}`);
      }
    }
    expect(bad).toEqual([]);
  });
  it("writes Yiddish and Hebrew in Hebrew letters without nikud, and names the Mashgiach rightly", () => {
    for (const lang of otherUiLangs("en")) {
      for (const k of keys) {
        for (const s of texts(tables[lang][k])) {
          // Nikud and cantillation marks; the maqaf (U+05BE) is punctuation and allowed.
          expect(s, `${lang} ${k}`).not.toMatch(/[\u0591-\u05BD\u05BF-\u05C7]/u);
          expect(s, `${lang} ${k}`).not.toMatch(/שליט|דער רב|(?<![א-ת])הרב(?![א-ת])/u);
        }
      }
    }
    expect(tables.he["home.h1"]).toBe("המשגיח");
    expect(tables.yi["home.h1"]).toBe("דער משגיח");
  });
  it("never calls him the Rav or shlit\"a in English", () => {
    for (const k of keys) for (const s of texts(tables.en[k])) expect(s, k).not.toMatch(/\bthe Ro?v\b|shlit/i);
  });
});

describe("fonts", () => {
  it("points the tokens font URLs at /fonts/", () => {
    const css = homeFontsCss('/* Generated by x. Do not edit. */\n@font-face { src: url("../fonts/a.woff2") format("woff2"); }\n');
    expect(css).toContain('url("/fonts/a.woff2")');
    expect(css).not.toContain("../fonts/");
  });
  it("public/fonts and src/styles/fonts.css are in sync with @emunas/tokens", () => {
    const tokensRoot = dirname(createRequire(import.meta.url).resolve("@emunas/tokens/package.json"));
    const want = homeFontsCss(readFileSync(join(tokensRoot, "css", "fonts.css"), "utf8"));
    expect(readFileSync(join(APP, "src", "styles", "fonts.css"), "utf8")).toBe(want);
    const files = readdirSync(join(APP, "public", "fonts")).filter((f) => f.endsWith(".woff2")).sort();
    expect(files).toEqual(fontManifest.faces.map((f) => f.file).sort());
    for (const f of files) {
      expect(readFileSync(join(APP, "public", "fonts", f)).equals(readFileSync(join(tokensRoot, "fonts", f))), f).toBe(true);
    }
    expect(fontPreloads()).toEqual(["/fonts/source-serif-4-latin.woff2"]);
  });
});
