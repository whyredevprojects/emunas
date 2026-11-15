import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterAll, describe, expect, it } from "vitest";
import { checkFallback, checkPage, exportsServerLoader, flattenPages, pagePathOf, parseHead, postBuild } from "./check.server.ts";
import { liveBuildEnd, livePrerenderPaths } from "./config.server.ts";
import { findCorpusDir, readDataFileSet, readSeoCorpus } from "./corpus.server.ts";
import type { RootSeoData } from "./head.ts";
import { createSeoContext, resetSeoContext, seoDataFor, seoLoader, SPA_MODE_HEADER } from "./loader.server.ts";
import { prerenderPaths } from "./model.ts";
import { SeoHead } from "./SeoHead.tsx";
import { corpusFixture, SHIUR_CATALOG, SHIUR_FULL, writeCorpusFixture } from "./test-fixtures.ts";

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), "live-seo-test-"));
  dirs.push(d);
  return d;
}

const ENV = { EMUNAS_DOMAIN: "example.org" };
const QUIET = "https://example.org";

/** Renders the SeoHead for `path` with the given root loader data, as the prerender does. */
function renderHead(path: string, data: RootSeoData): string {
  // A root route with id "root" (as in the app) whose element is the head component.
  const router = createMemoryRouter(
    [{ id: "root", path: "/", Component: SeoHead, children: [{ path: "*", Component: () => null }] }],
    { initialEntries: [path], hydrationData: { loaderData: { root: data } } },
  );
  return `<html><head>${renderToStaticMarkup(createElement(RouterProvider, { router }))}</head><body></body></html>`;
}

describe(".corpus reader", () => {
  const dir = writeCorpusFixture(join(tmp(), ".corpus"));
  const corpus = readSeoCorpus(dir);

  it("reads shiurim, series, occasions and entities with labels and prerender flags", () => {
    expect(corpus.shiurim.map((s) => s.id)).toEqual([SHIUR_FULL, SHIUR_CATALOG, "yi-other-01"]);
    expect(corpus.shiurim[0]!.oneLiner?.en).toContain("Knesses Yisrael");
    expect(corpus.series).toEqual(corpusFixture.series);
    expect(corpus.occasions).toEqual(corpusFixture.occasions);
    expect(corpus.works).toEqual(corpusFixture.works);
    expect(corpus.people).toEqual(corpusFixture.people);
    expect(corpus.concepts[0]).toEqual(corpusFixture.concepts[0]);
    // A concept below the listing threshold has no concepts.json row: labelled by its key.
    expect(corpus.concepts[1]!.label.en).toBe("bitachon-2");
  });

  it("finds .corpus by EMUNAS_CORPUS_DIR or walking up", () => {
    const root = dirname(dir);
    const deep = join(root, "apps", "live");
    mkdirSync(deep, { recursive: true });
    expect(findCorpusDir({}, deep)).toBe(dir);
    expect(findCorpusDir({ EMUNAS_CORPUS_DIR: dir }, "/")).toBe(dir);
    expect(findCorpusDir({ EMUNAS_CORPUS_DIR: join(root, "nope") }, deep)).toBeNull();
    expect(findCorpusDir({}, tmp())).toBeNull();
  });

  it("lists the emitted data files", () => {
    const data = join(tmp(), "data");
    mkdirSync(join(data, "shiur"), { recursive: true });
    expect(readDataFileSet(data)).toBeNull(); // no build.json yet
    writeFileSync(join(data, "build.json"), "{}");
    writeFileSync(join(data, "shiur", "a b.json"), "{}");
    expect(readDataFileSet(data)).toEqual(new Set(["build.json", "shiur/a b.json"]));
  });
});

describe("root loader", () => {
  const corpusDir = writeCorpusFixture(join(tmp(), ".corpus"));
  const env = { ...ENV, EMUNAS_CORPUS_DIR: corpusDir };

  it("returns page SEO for a prerendered path, with the canonical computed from .corpus lookups", () => {
    const ctx = createSeoContext(env, "/");
    const d = seoDataFor(ctx, "/en/o/chanukah/");
    expect(d.seo.hosts).toEqual({ quiet: QUIET, live: "https://listen.example.org" });
    expect(d.seo.page).toMatchObject({
      path: "/en/o/chanukah",
      kind: "occasion",
      title: "Chanukah",
      canonical: `${QUIET}/en/calendar/zman/chanukah/`,
    });
    // Below the Quiet person threshold: the people index, never a 404.
    expect(seoDataFor(ctx, "/en/p/rabbi-x").seo.page?.canonical).toBe(`${QUIET}/en/people/`);
    expect(seoDataFor(ctx, "/en/search").seo.page).toBeNull();
  });

  it("marks the SPA fallback render and reads process.env once", () => {
    const saved = { ...process.env };
    Object.assign(process.env, env);
    try {
      resetSeoContext();
      const fb = seoLoader({ request: new Request("http://localhost/", { headers: { [SPA_MODE_HEADER]: "yes" } }) });
      expect(fb.seo).toEqual({ hosts: { quiet: QUIET, live: "https://listen.example.org" }, page: null, fallback: true });
      const page = seoLoader({ request: new Request(`http://localhost/yi/s/${SHIUR_FULL}/`) });
      expect(page.seo.page?.canonical).toBe(`${QUIET}/yi/shiur/${SHIUR_FULL}/`);
    } finally {
      process.env = saved;
      resetSeoContext();
    }
  });

  it("works without a corpus or hosts (dev): Today keeps its text, no canonical anywhere", () => {
    const ctx = createSeoContext({ EMUNAS_CORPUS_DIR: join(tmp(), "none") }, tmp());
    expect(seoDataFor(ctx, "/en/s/x")).toEqual({ seo: { hosts: null, page: null } });
    expect(seoDataFor(ctx, "/yi/").seo.page).toMatchObject({ kind: "today", title: "אמונת — הערן", canonical: null });
  });
});

describe("SeoHead", () => {
  const corpusDir = writeCorpusFixture(join(tmp(), ".corpus"));
  const ctx = createSeoContext({ ...ENV, EMUNAS_CORPUS_DIR: corpusDir }, "/");

  it("renders the tags the post-build check expects, for every prerendered page", () => {
    for (const path of prerenderPaths(readSeoCorpus(corpusDir)).paths) {
      const html = renderHead(path, seoDataFor(ctx, path));
      const file = path.replace(/^\//u, "") + (path.split("/").length === 2 ? "/index.html" : ".html");
      expect(checkPage(file, html, ctx.links!.hosts), path).toEqual([]);
    }
  });

  it("renders escaped attribute values and the robots tag", () => {
    const html = renderHead("/en/search", seoDataFor(ctx, "/en/search"));
    const head = parseHead(html);
    expect(head.robots).toEqual(["noindex"]);
    expect(head.canonical).toEqual([`${QUIET}/en/search/`]);
    const shiur = parseHead(renderHead(`/en/s/${SHIUR_CATALOG}`, seoDataFor(ctx, `/en/s/${SHIUR_CATALOG}`)));
    expect(shiur.meta.get("og:description")).toContain('zt"l');
  });

  it("the SPA fallback document passes the fallback check", () => {
    const html = renderHead("/", { seo: { hosts: ctx.links!.hosts, page: null, fallback: true } });
    expect(checkFallback(html)).toEqual([]);
  });
});

describe("post-build checks", () => {
  const goodShiur = (canonical: string) =>
    `<html><head><link rel="canonical" href="${canonical}"/>` +
    `<link rel="alternate" hrefLang="en" href="https://listen.example.org/en/s/a"/>` +
    `<meta name="description" content="d"/><meta property="og:title" content="t"/>` +
    `<meta property="og:description" content="d"/></head><body></body></html>`;
  const hosts = { quiet: QUIET, live: "https://listen.example.org" };

  it("parses head tags, decoding entities", () => {
    const h = parseHead(`<head><meta property="og:title" content="a &quot;b&quot; &amp; c"/><meta name="robots" content="noindex"/></head><meta name="x" content="body"/>`);
    expect(h.meta.get("og:title")).toBe('a "b" & c');
    expect(h.robots).toEqual(["noindex"]);
    expect(h.meta.has("x")).toBe(false);
  });

  it("maps files to page paths", () => {
    expect(pagePathOf("en/index.html")).toBe("/en/");
    expect(pagePathOf("en/s/x/index.html")).toBe("/en/s/x");
    expect(pagePathOf("en/s/x.html")).toBe("/en/s/x");
  });

  it("flags a canonical on listen.*, off the Quiet origin, missing, doubled or with a fragment", () => {
    expect(checkPage("en/s/a.html", goodShiur(`${QUIET}/en/shiur/a/`), hosts)).toEqual([]);
    const problems = (html: string) => checkPage("en/s/a.html", html, hosts).map((f) => f.problem);
    expect(problems(goodShiur("https://listen.example.org/en/s/a")).join()).toMatch(/listen\.\* host/u);
    expect(problems(goodShiur("https://other.org/en/shiur/a/")).join()).toMatch(/not on the Quiet origin/u);
    expect(problems(goodShiur(`${QUIET}/en/shiur/a/#s1`)).join()).toMatch(/fragment/u);
    expect(problems(goodShiur(`${QUIET}/a/`).replace("</head>", `<link rel="canonical" href="${QUIET}/b/"/></head>`)).join()).toMatch(
      /more than one/u,
    );
    expect(problems("<html><head></head></html>")).toEqual(
      expect.arrayContaining(["no canonical link", "no og:title", "no og:description", "no meta description", "no hreflang alternates"]),
    );
    expect(problems(goodShiur(`${QUIET}/en/shiur/a/`).replace("<head>", '<head><meta name="robots" content="noindex"/>'))).toEqual([
      "content page (shiur) is noindex",
    ]);
  });

  it("flags app-only pages without noindex", () => {
    const html = `<html><head><link rel="canonical" href="${QUIET}/en/"/><meta property="og:title" content="t"/></head></html>`;
    expect(checkPage("en/index.html", html, hosts).map((f) => f.problem)).toEqual(["app-only page (today) without noindex"]);
    expect(checkPage("en/search.html", html, hosts).map((f) => f.problem)).toEqual(["app-only page (search) without noindex"]);
  });

  it("detects server loaders in route modules", () => {
    expect(exportsServerLoader("export async function loader() {}")).toBe(true);
    expect(exportsServerLoader("export function loader({ request }) {}")).toBe(true);
    expect(exportsServerLoader("export const loader = () => 1;")).toBe(true);
    expect(exportsServerLoader("export { loader } from './x';")).toBe(true);
    expect(exportsServerLoader("export { x as loader };")).toBe(true);
    expect(exportsServerLoader("export async function clientLoader() {}")).toBe(false);
    expect(exportsServerLoader("export { clientLoader };")).toBe(false);
  });

  /** A fake build/client: two good pages, the fallback, .data files, one data JSON. */
  function fakeClient(): string {
    const c = join(tmp(), "client");
    const put = (file: string, body: string) => {
      mkdirSync(dirname(join(c, file)), { recursive: true });
      writeFileSync(join(c, file), body);
    };
    put("index.html", '<html><head><meta name="robots" content="noindex"/></head></html>');
    put("en/index.html", `<html><head><meta name="robots" content="noindex"/><link rel="canonical" href="${QUIET}/en/"/><meta property="og:title" content="t"/></head></html>`);
    put("en/s/a/index.html", goodShiur(`${QUIET}/en/shiur/a/`));
    put("en/s/a.data", "x");
    put("en.data", "x");
    put("_root.data", "x");
    put("data/shiur/a.json", "{}");
    return c;
  }

  it("writes robots.txt, removes .data files, flattens pages and passes", () => {
    const c = fakeClient();
    const r = postBuild({ clientDir: c, hosts, routeFiles: [] });
    expect(r.findings).toEqual([]);
    expect(r.removedDataFiles).toBe(3);
    expect(r.flattened).toBe(1);
    expect(r.pages).toBe(2);
    expect(existsSync(join(c, "en/s/a.html"))).toBe(true);
    expect(existsSync(join(c, "en/s/a"))).toBe(false);
    expect(existsSync(join(c, "en/index.html"))).toBe(true);
    expect(existsSync(join(c, "data/shiur/a.json"))).toBe(true);
    expect(readFileSync(join(c, "robots.txt"), "utf8")).toContain("Disallow: /api/");
    expect(r.files).toBe(5); // index.html, en/index.html, en/s/a.html, data/shiur/a.json, robots.txt
  });

  it("keeps .data files when a route has a server loader, and enforces the file budget", () => {
    const c = fakeClient();
    const route = join(tmp(), "route.tsx");
    writeFileSync(route, "export async function loader() { return 1; }");
    const r = postBuild({ clientDir: c, hosts, routeFiles: [route], maxFiles: 4 });
    expect(r.removedDataFiles).toBe(0);
    expect(r.warnings).toHaveLength(1);
    expect(r.findings.map((f) => f.problem).join()).toMatch(/files in build\/client, budget 4/u);
  });

  it("flags an SPA fallback that is indexable", () => {
    const c = fakeClient();
    writeFileSync(join(c, "index.html"), `<html><head><link rel="canonical" href="${QUIET}/"/></head></html>`);
    const r = postBuild({ clientDir: c, hosts, routeFiles: [] });
    expect(r.findings.map((f) => f.problem)).toEqual(["SPA fallback without noindex", "SPA fallback carries a canonical link"]);
  });

  it("flattenPages leaves the UI homes and existing targets alone", () => {
    const c = fakeClient();
    writeFileSync(join(c, "en/s/a.html"), "taken");
    expect(flattenPages(c)).toBe(0);
    expect(existsSync(join(c, "en/s/a/index.html"))).toBe(true);
  });
});

describe("react-router config hooks", () => {
  it("prerender list from .corpus, filtered by the emitted data tree when present", () => {
    const root = tmp();
    const corpusDir = writeCorpusFixture(join(root, ".corpus"));
    const app = join(root, "apps", "live");
    mkdirSync(app, { recursive: true });
    const logs: string[] = [];
    const paths = livePrerenderPaths({ env: {}, appDir: app, log: (m) => logs.push(m) });
    expect(paths).toEqual(prerenderPaths(readSeoCorpus(corpusDir)).paths);
    expect(logs.join()).toMatch(/no public\/data/u);

    mkdirSync(join(app, "public", "data", "shiur"), { recursive: true });
    writeFileSync(join(app, "public", "data", "build.json"), "{}");
    writeFileSync(join(app, "public", "data", "shiur", `${SHIUR_FULL}.json`), "{}");
    const filtered = livePrerenderPaths({ env: {}, appDir: app, log: (m) => logs.push(m) });
    expect(filtered).toEqual(["/en", `/en/s/${SHIUR_FULL}`, "/yi", `/yi/s/${SHIUR_FULL}`]);
    expect(logs.join()).toMatch(/routes skipped/u);
  });

  it("without a corpus: Today only, and a deploy build fails", () => {
    const app = tmp();
    const none = { EMUNAS_CORPUS_DIR: join(app, "none") };
    expect(livePrerenderPaths({ env: none, appDir: app, log: () => {} })).toEqual(["/en", "/yi"]);
    expect(() => livePrerenderPaths({ env: { ...none, EMUNAS_DEPLOY: "1" }, appDir: app, log: () => {} })).toThrow(/no \.corpus/u);
  });

  it("buildEnd throws with the findings, ignoring the root route's loader", () => {
    const build = tmp();
    const client = join(build, "client");
    mkdirSync(join(client, "en"), { recursive: true });
    writeFileSync(join(client, "en", "index.html"), "<html><head></head></html>");
    const appDirectory = tmp();
    writeFileSync(join(appDirectory, "root.tsx"), "export function loader() {}");
    const args = {
      reactRouterConfig: { appDirectory, buildDirectory: build, routes: { root: { id: "root", file: "root.tsx" } } },
    };
    expect(() => liveBuildEnd(args, ENV, () => {})).toThrow(/app-only page \(today\) without noindex/u);
    writeFileSync(
      join(client, "en", "index.html"),
      `<html><head><meta name="robots" content="noindex"/><link rel="canonical" href="${QUIET}/en/"/><meta property="og:title" content="t"/></head></html>`,
    );
    const logs: string[] = [];
    liveBuildEnd(args, ENV, (m) => logs.push(m));
    expect(logs.join()).toMatch(/1 prerendered pages checked/u);
  });
});
