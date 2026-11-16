/**
 * W4.6 unit tests: build env (hosts, feedback address, dev placeholders, deploy strictness), head
 * tags (canonical, hreflang, OG), sitemap and robots.txt builders, the About content contract, and
 * that `@emunas/links` section paths equal the catalog pages' on every section of today's data.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { quietPaths, sectionSlug as linksSectionSlug } from "@emunas/links";
import { buildCorpus } from "./corpus-build.ts";
import { afterAll, describe, expect, it } from "vitest";
import { loadCatalogCorpus } from "../../catalog/corpus.ts";
import { sectionHref, sectionSlug, sectionSummaries } from "../../catalog/model.ts";
import { barePath, headTags, hreflangFor } from "../head.ts";
import {
  PLACEHOLDER_FEEDBACK_EMAIL,
  PLACEHOLDER_HOSTS,
  isDeployBuild,
  parseFeedbackEmail,
  siteEnv,
} from "../site-env.ts";
import {
  editionPaths,
  fillRoute,
  pagePaths,
  robotsTxt,
  routeOfFile,
  sitemapIndexXml,
  sitemapXml,
  SITEMAP_URL_LIMIT,
  xmlEscape,
} from "../sitemap.ts";
import { aboutFileKey } from "../../../pages/[ed]/about/_content.ts";
import { ABOUT_PARTS, ABOUT_STRINGS } from "../../../pages/[ed]/about/_strings.ts";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../..");

// ------------------------------------------------------------------ build env

describe("site env", () => {
  it("uses example.invalid placeholders outside a deploy build", () => {
    const env = siteEnv({});
    expect(env.hosts).toEqual(PLACEHOLDER_HOSTS);
    expect(env.feedbackEmail).toBe(PLACEHOLDER_FEEDBACK_EMAIL);
    expect(env.placeholder).toEqual({ hosts: true, feedbackEmail: true });
    expect(env.links.live.shiur("en", "x")).toBe("https://listen.example.invalid/en/s/x");
  });

  it("reads EMUNAS_DOMAIN, the workers.dev subdomain and explicit origins", () => {
    const prod = siteEnv({ EMUNAS_DOMAIN: "Emunas.Example", EMUNAS_FEEDBACK_EMAIL: " errors@emunas.example " });
    expect(prod.hosts).toEqual({ quiet: "https://emunas.example", live: "https://listen.emunas.example" });
    expect(prod.feedbackEmail).toBe("errors@emunas.example");
    expect(prod.placeholder).toEqual({ hosts: false, feedbackEmail: false });

    const staging = siteEnv({ EMUNAS_WORKERS_SUBDOMAIN: "acct", EMUNAS_STAGE: "staging" });
    expect(staging.hosts).toEqual({
      quiet: "https://emunas-quiet-staging.acct.workers.dev",
      live: "https://emunas-live-staging.acct.workers.dev",
    });

    const local = siteEnv({ EMUNAS_QUIET_ORIGIN: "http://localhost:4321", EMUNAS_LIVE_ORIGIN: "http://localhost:5173" });
    expect(local.links.quiet.home("yi")).toBe("http://localhost:4321/yi/");
  });

  it("fails on malformed or half-set values, deploy or not", () => {
    expect(() => siteEnv({ EMUNAS_LIVE_ORIGIN: "http://localhost:5173" })).toThrow(/no hosts configured/);
    expect(() => siteEnv({ EMUNAS_DOMAIN: "listen.emunas.example" })).toThrow();
    expect(() => siteEnv({ EMUNAS_DOMAIN: "not a domain" })).toThrow();
    expect(() => siteEnv({ EMUNAS_FEEDBACK_EMAIL: "nobody" })).toThrow(/EMUNAS_FEEDBACK_EMAIL/);
    expect(() => parseFeedbackEmail("a@b.c?subject=x")).toThrow();
    expect(() => parseFeedbackEmail("a b@c.d")).toThrow();
  });

  it("refuses placeholders in a CI deploy build", () => {
    expect(isDeployBuild({ CI: "true", EMUNAS_DEPLOY: "1" })).toBe(true);
    expect(isDeployBuild({ CI: "true" })).toBe(false);
    expect(isDeployBuild({ EMUNAS_DEPLOY: "1" })).toBe(false);
    const deploy = { CI: "true", EMUNAS_DEPLOY: "1" };
    expect(() => siteEnv(deploy)).toThrow(/no site hosts configured/);
    expect(() => siteEnv({ ...deploy, EMUNAS_DOMAIN: "emunas.example" })).toThrow(/EMUNAS_FEEDBACK_EMAIL is not set/);
    const ok = siteEnv({ ...deploy, EMUNAS_DOMAIN: "emunas.example", EMUNAS_FEEDBACK_EMAIL: "e@emunas.example" });
    expect(ok.placeholder).toEqual({ hosts: false, feedbackEmail: false });
  });
});

// ------------------------------------------------------------------ head tags

describe("head tags", () => {
  const hosts = { quiet: "https://emunas.example" };
  const base = { title: "T", description: "D", siteName: "S" };

  it("are self-canonical on the Quiet origin, without query or fragment", () => {
    const tags = headTags({ ...base, path: "/yi/search/?q=x#top" }, hosts);
    expect(tags.canonical).toBe("https://emunas.example/yi/search/");
    expect(tags.robots).toBeNull();
    expect(barePath("/en/shiur/a/#t=5")).toBe("/en/shiur/a/");
    expect(() => barePath("en/")).toThrow(TypeError);
  });

  it("pair the same path in both editions plus x-default → the root", () => {
    for (const path of ["/yi/section/unc-zmanim/", "/en/years/5780/", "/en/people/baal-shem-tov/"]) {
      const rest = path.slice(3);
      expect(hreflangFor(path, hosts.quiet)).toEqual([
        { hreflang: "yi", href: `https://emunas.example/yi${rest}` },
        { hreflang: "en", href: `https://emunas.example/en${rest}` },
        { hreflang: "x-default", href: "https://emunas.example/" },
      ]);
    }
    expect(hreflangFor("/", hosts.quiet).map((a) => a.href)).toEqual([
      "https://emunas.example/yi/",
      "https://emunas.example/en/",
      "https://emunas.example/",
    ]);
    expect(hreflangFor("/robots.txt", hosts.quiet)).toEqual([]);
  });

  it("carry OG title, description, url; article for shiur pages", () => {
    const tags = headTags({ ...base, path: "/en/shiur/en-parsha-en-nch-01/" }, hosts);
    const og = Object.fromEntries(tags.og.map((m) => [m.property, m.content]));
    expect(og).toEqual({
      "og:type": "article",
      "og:site_name": "S",
      "og:title": "T",
      "og:description": "D",
      "og:url": "https://emunas.example/en/shiur/en-parsha-en-nch-01/",
      "og:locale": "en_US",
    });
    expect(headTags({ ...base, path: "/yi/" }, hosts).og.find((m) => m.property === "og:type")?.content).toBe("website");
  });

  it("drop canonical and hreflang and say noindex on noindex pages and placeholder builds", () => {
    for (const tags of [
      headTags({ ...base, path: "/en/shell-sample/", noindex: true }, hosts),
      headTags({ ...base, path: "/en/" }, hosts, { placeholder: true }),
    ]) {
      expect(tags.robots).toBe("noindex");
      expect(tags.canonical).toBeNull();
      expect(tags.alternates).toEqual([]);
    }
  });
});

// ------------------------------------------------------------------ sitemaps, robots

describe("sitemaps", () => {
  it("map page files to routes and fill params", () => {
    expect(routeOfFile("../../pages/index.astro")).toBe("/");
    expect(routeOfFile("../../pages/[ed]/index.astro")).toBe("/[ed]/");
    expect(routeOfFile("../../pages/[ed]/shiur/[id]/index.astro")).toBe("/[ed]/shiur/[id]/");
    expect(routeOfFile("../../pages/[ed]/people/[person].astro")).toBe("/[ed]/people/[person]/");
    expect(routeOfFile("../../pages/[ed]/about/_part.astro")).toBeNull();
    expect(routeOfFile("../../pages/_x/index.astro")).toBeNull();
    expect(fillRoute("/[ed]/shiur/[id]/", { ed: "yi", id: "a b" })).toBe("/yi/shiur/a%20b/");
    expect(fillRoute("/[...rest]/", { rest: "a/b" })).toBe("/a/b/");
    expect(() => fillRoute("/[ed]/", {})).toThrow(/\[ed\]/);
  });

  it("collect every page of each edition, without check-only pages", async () => {
    const paths = await pagePaths({
      "../../pages/index.astro": undefined,
      "../../pages/[ed]/index.astro": () => [{ params: { ed: "yi" } }, { params: { ed: "en" } }],
      "../../pages/[ed]/shiur/[id]/index.astro": async () => [{ params: { ed: "en", id: "b" } }, { params: { ed: "en", id: "a" } }],
      "../../pages/[ed]/shell-sample/index.astro": () => [{ params: { ed: "en" } }],
      "../../pages/[ed]/search/_strings.astro": undefined,
    });
    expect(paths).toEqual(["/", "/en/", "/en/shell-sample/", "/en/shiur/a/", "/en/shiur/b/", "/yi/"]);
    expect(editionPaths(paths, "en")).toEqual(["/en/", "/en/shiur/a/", "/en/shiur/b/"]);
    expect(editionPaths(paths, "yi")).toEqual(["/yi/"]);
    await expect(pagePaths({ "../../pages/[ed]/x.astro": undefined })).rejects.toThrow(/getStaticPaths/);
  });

  it("write a urlset with alternates and an index of both editions", () => {
    const xml = sitemapXml("https://e.example", ["/en/", "/en/search/?q=a&b"]);
    expect(xml).toContain("<loc>https://e.example/en/</loc>");
    expect(xml).toContain('<xhtml:link rel="alternate" hreflang="yi" href="https://e.example/yi/"/>');
    expect(xml).toContain('hreflang="x-default" href="https://e.example/"');
    expect(xml).toContain("q=a&amp;b");
    expect(xml.match(/<url>/g)).toHaveLength(2);
    expect(xmlEscape(`<"'&>`)).toBe("&lt;&quot;&apos;&amp;&gt;");
    expect(() => sitemapXml("https://e.example", Array.from({ length: SITEMAP_URL_LIMIT + 1 }, (_, i) => `/en/${i}/`))).toThrow();
    const index = sitemapIndexXml("https://e.example");
    expect(index).toContain("<loc>https://e.example/sitemap-yi.xml</loc>");
    expect(index).toContain("<loc>https://e.example/sitemap-en.xml</loc>");
  });

  it("robots.txt allows all but /api/ and /admin/ and names the index; placeholder builds disallow all", () => {
    expect(robotsTxt("https://e.example").split("\n")).toEqual([
      "User-agent: *",
      "Allow: /",
      "Disallow: /api/",
      "Disallow: /admin/",
      "",
      "Sitemap: https://e.example/sitemap-index.xml",
      "",
    ]);
    expect(robotsTxt("https://example.invalid", { placeholder: true })).toMatch(/^Disallow: \/$/m);
  });
});

// ------------------------------------------------------------------ About contract

describe("About", () => {
  it("has the five parts of concept-quiet §5.11, notes among them, in both editions", () => {
    expect(ABOUT_PARTS).toEqual(["mashgiach", "arrangement", "notes", "report", "excluded"]);
    for (const ed of ["yi", "en"] as const) {
      for (const p of ABOUT_PARTS) expect(ABOUT_STRINGS[ed].headings[p].trim(), `${ed} ${p}`).not.toBe("");
    }
    for (const v of Object.values(ABOUT_STRINGS.yi.headings)) expect(/[א-ת]/.test(v)).toBe(true);
  });

  it("reads human texts only from content/about/{ed}/{part}.md", () => {
    expect(aboutFileKey("../../../content/about/en/notes.md")).toEqual({ ed: "en", part: "notes" });
    expect(aboutFileKey("../../../content/about/yi/mashgiach.md")).toEqual({ ed: "yi", part: "mashgiach" });
    expect(aboutFileKey("../../../content/about/de/mashgiach.md")).toBeNull();
    expect(aboutFileKey("../../../content/about/en/other.md")).toBeNull();
  });
});

// ------------------------------------------------------------------ section builder ≡ catalog pages

describe("@emunas/links section paths", () => {
  const dirs: string[] = [];
  afterAll(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });

  it("equal the catalog pages' addresses for every section of today's data", () => {
    const out = mkdtempSync(join(tmpdir(), "quiet-seo-sections-"));
    dirs.push(out);
    buildCorpus(repo, out, "https://media.example.org");
    const sections = sectionSummaries(loadCatalogCorpus(out));
    expect(sections.length).toBeGreaterThan(10);
    expect(sections.some((s) => s.source !== "pocket-guide-2012")).toBe(true);
    for (const s of sections) {
      const ref = { source: s.source, id: s.key.slice(s.key.indexOf(":") + 1) };
      expect(linksSectionSlug(ref), s.key).toBe(sectionSlug(ref));
      expect(linksSectionSlug(ref), s.key).toBe(s.slug);
      for (const ed of ["yi", "en"] as const) expect(quietPaths().section(ed, ref)).toBe(sectionHref(ed, ref));
    }
  }, 60_000);
});
