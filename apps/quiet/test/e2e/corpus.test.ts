/**
 * C3.8: the corpus-layer pages of Quiet with JavaScript off, in both editions (corpus-wave-plan
 * C3.8 (1), §3.5 addresses; concept-quiet-corpus C5, C6 "The label"):
 * - the topic tree `/{ed}/inyanim/`, a topic page (and the gateway's `all/` list), the glossary
 *   `/{ed}/erachim/` and a concept page, a person page, a work page, a story page and a series page
 *   (one with its generated synthesis);
 * - each renders without script: lang/dir, one h1 naming the entity from the layer, one main;
 * - the AI label: an index carries the index label once, an entity page the entry label once;
 * - entity pages link only shiurim that are visible (status `full`; never needs_review or
 *   catalog-only), and every root-relative link on them lands on a built page;
 * - an entity without a Quiet page (below threshold) has no address: its URL is not built.
 *
 * Expectations come from `.corpus/layer/*.json`, so the spec follows the data as it grows. The site
 * is built from today's `data/` (corpus into a temp dir, then `astro build`), or taken from
 * `QUIET_E2E_DIST` (with `QUIET_E2E_CORPUS`, default `<repo>/.corpus`) when it is already built, as
 * after `npm run site:chain`.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCorpusWithAggregates } from "@emunas/corpus/build/aggregate";
import { chromium, type Browser, type Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { astroBuild } from "../astro-build.ts";
import { EDS, dirOf, type Ed } from "../../src/lib/edition.ts";

const app = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const repo = resolve(app, "../..");

let work = "";
let dist = "";
let corpus = "";
let server: Server;
let origin = "";
let browser: Browser;

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

function chrome(): string {
  let pw: string | undefined;
  try {
    pw = chromium.executablePath();
  } catch {
    pw = undefined;
  }
  const found = [process.env["CHROME_PATH"], pw, "/usr/bin/google-chrome"].find(
    (p): p is string => typeof p === "string" && p !== "" && existsSync(p),
  );
  if (!found) throw new Error("No Chrome found: set CHROME_PATH or install Playwright's Chromium");
  return found;
}

beforeAll(async () => {
  const given = process.env["QUIET_E2E_DIST"];
  if (given && existsSync(join(given, "en", "index.html"))) {
    dist = resolve(given);
    corpus = resolve(process.env["QUIET_E2E_CORPUS"] ?? join(repo, ".corpus"));
  } else {
    work = mkdtempSync(join(tmpdir(), "quiet-corpus-"));
    corpus = join(work, ".corpus");
    dist = join(work, "dist");
    const real = existsSync(join(repo, "data", "derived", "ingest.json"));
    const mini = join(repo, "packages", "corpus", "test", "fixtures", "mini");
    buildCorpusWithAggregates({
      dataDir: real ? join(repo, "data") : join(mini, "data"),
      policyDir: real ? join(repo, "site-policy") : join(mini, "site-policy"),
      outDir: corpus,
      mediaOrigin: "https://media.example.org",
      dataSha: null,
    });
    const b = astroBuild(app, dist, { EMUNAS_CORPUS_DIR: corpus, EMUNAS_BUILD_DATE: "2026-11-15", EMUNAS_DOMAIN: "emunas.example" });
    if (b.status !== 0) throw new Error(`astro build failed:\n${b.stdout.slice(-4000)}\n${b.stderr.slice(-4000)}`);
  }
  if (!existsSync(join(corpus, "layer", "layer.json"))) throw new Error(`no corpus layer at ${corpus}/layer (build the corpus first)`);

  server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    let file = normalize(join(dist, decodeURIComponent(url.pathname)));
    if (!file.startsWith(dist)) return void res.writeHead(403).end();
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!existsSync(file)) return void res.writeHead(404, { "content-type": "text/plain" }).end("not found");
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(readFileSync(file));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  origin = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  browser = await chromium.launch({ executablePath: chrome(), args: ["--no-sandbox"] });
}, 600_000);

afterAll(async () => {
  await browser?.close();
  await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
  if (work) rmSync(work, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------------------------
// The layer, read defensively (only the fields this spec needs)

interface Pages {
  quiet?: boolean;
}
interface L {
  en?: string;
  yi?: string;
  he?: string;
}
interface TopicNode {
  id: string;
  parentId: string | null;
  label: L;
  count: number;
  pages?: Pages;
  gateway?: boolean;
}
interface Concept {
  id: string;
  canonicalHe?: string;
  label?: L;
  shiurIds?: string[];
  pages?: Pages;
}
interface Person {
  id: string;
  nameHe?: string | null;
  nameEn?: string | null;
  nameYi?: string | null;
  count?: number;
  pages?: Pages;
}
interface Work {
  id: string;
  titleHe?: string | null;
  titleEn?: string | null;
  count?: number;
  pages?: Pages;
}
interface Story {
  id: string;
  title: L;
  tellings?: unknown[];
  pages?: Pages;
}
interface SeriesSynthesis {
  seriesId: string;
  title?: L;
  overview?: L;
}

function layer<T>(file: string): T {
  return JSON.parse(readFileSync(join(corpus, "layer", file), "utf8")) as T;
}

const onQuiet = (x: { pages?: Pages }) => x.pages?.quiet === true;
const byCount = <T extends { count?: number }>(xs: T[]) => [...xs].sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/gu, " ").trim();

interface Sample {
  topic: TopicNode;
  gateway: TopicNode | null;
  concept: Concept;
  person: Person;
  work: Work;
  story: Story;
  series: SeriesSynthesis | null;
  /** Ids without a Quiet page: their URLs must not be built. */
  noPage: { kind: string; path: (ed: Ed) => string }[];
}

let sampleCache: Sample | null = null;

function sample(): Sample {
  if (sampleCache) return sampleCache;
  const tree = layer<{ tree: TopicNode[] }>("topics.json").tree;
  const concepts = layer<{ concepts: Concept[] }>("concepts.json").concepts;
  const people = layer<{ people: Person[] }>("people.json").people;
  const works = layer<{ works: Work[] }>("works.json").works;
  const stories = layer<{ stories: Story[] }>("stories.json").stories;
  const topic = byCount(tree.filter((t) => onQuiet(t) && t.parentId !== null))[0] ?? byCount(tree.filter(onQuiet))[0];
  const concept = byCount(concepts.filter(onQuiet).map((c) => ({ ...c, count: c.shiurIds?.length ?? 0 })))[0];
  const person = byCount(people.filter(onQuiet))[0];
  const work = byCount(works.filter(onQuiet))[0];
  const story = [...stories.filter(onQuiet)].sort((a, b) => (b.tellings?.length ?? 0) - (a.tellings?.length ?? 0))[0];
  if (!topic || !concept || !person || !work || !story) throw new Error("the layer has no Quiet page of some kind");
  const seriesDir = join(corpus, "layer", "series");
  const synth = existsSync(join(seriesDir, "tanya-yi.json")) ? layer<SeriesSynthesis>("series/tanya-yi.json") : null;
  const noPage: Sample["noPage"] = [];
  const w = works.find((x) => !onQuiet(x));
  if (w) noPage.push({ kind: `work ${w.id}`, path: (ed) => `/${ed}/sources/${w.id}/` });
  const c = concepts.find((x) => !onQuiet(x));
  if (c) noPage.push({ kind: `concept ${c.id}`, path: (ed) => `/${ed}/erachim/${c.id}/` });
  const s = stories.find((x) => !onQuiet(x));
  if (s) noPage.push({ kind: `story ${s.id}`, path: (ed) => `/${ed}/stories/${s.id}/` });
  const p = people.find((x) => !onQuiet(x));
  if (p) noPage.push({ kind: `person ${p.id}`, path: (ed) => `/${ed}/people/${p.id}/` });
  sampleCache = {
    topic,
    gateway: tree.find((t) => onQuiet(t) && t.gateway === true) ?? null,
    concept,
    person,
    work,
    story,
    series: synth,
    noPage,
  };
  return sampleCache;
}

/** Shiur ids with status `full` in `.corpus/index.json` (what an entity page may link). */
let fullCache: Set<string> | null = null;
function fullShiurim(): Set<string> {
  if (!fullCache) {
    const index = JSON.parse(readFileSync(join(corpus, "index.json"), "utf8")) as { shiurim: { id: string; status: string }[] };
    fullCache = new Set(index.shiurim.filter((s) => s.status === "full").map((s) => s.id));
  }
  return fullCache;
}

// ---------------------------------------------------------------------------------------------

async function openNoJs(path: string): Promise<Page> {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1100, height: 900 } });
  await context.route(/^https:\/\/media\./u, (r) => r.abort());
  const page = await context.newPage();
  const res = await page.goto(origin + path, { waitUntil: "load" });
  expect(res?.status(), path).toBe(200);
  return page;
}

async function basics(page: Page, ed: Ed, path: string): Promise<string> {
  expect(await page.getAttribute("html", "lang"), path).toBe(ed);
  expect(await page.getAttribute("html", "dir"), path).toBe(dirOf(ed));
  expect(await page.locator("h1").count(), path).toBe(1);
  expect(await page.locator("main").count(), path).toBe(1);
  return clean(await page.locator("h1").textContent());
}

/** Root-relative links in `main` that do not land on a built page. */
async function brokenLinks(page: Page): Promise<string[]> {
  const hrefs = await page.locator("main a[href^='/']").evaluateAll((as) => as.map((a) => a.getAttribute("href")!));
  return hrefs.filter((h) => {
    const p = decodeURIComponent(new URL(h, "http://x").pathname);
    const direct = join(dist, p);
    return !(existsSync(direct) && statSync(direct).isFile()) && !existsSync(join(dist, p, "index.html"));
  });
}

/** Shiur ids linked from `main` that are not visible. */
async function hiddenShiurLinks(page: Page, ed: Ed): Promise<string[]> {
  const ids = await page
    .locator(`main a[href^='/${ed}/shiur/']`)
    .evaluateAll((as) => as.map((a) => decodeURIComponent(new URL(a.getAttribute("href")!, "http://x").pathname.split("/")[3] ?? "")));
  const full = fullShiurim();
  return [...new Set(ids)].filter((id) => !full.has(id));
}

async function labels(page: Page): Promise<{ index: number; entry: number }> {
  return {
    index: await page.locator("main p.corpus-label-index").count(),
    entry: await page.locator("main .corpus-label-entry p.corpus-label").count(),
  };
}

/** An entity page: basics, the entry label once, only visible shiurim, no broken links. */
async function entityPage(ed: Ed, path: string, names: (string | null | undefined)[]): Promise<void> {
  const page = await openNoJs(path);
  const h1 = await basics(page, ed, path);
  const wanted = names.map(clean).filter((n) => n !== "");
  expect(
    wanted.some((n) => h1.includes(n)),
    `${path}: h1 "${h1}" names one of ${JSON.stringify(wanted)}`,
  ).toBe(true);
  expect((await labels(page)).entry, `${path}: entry label once`).toBe(1);
  expect(await hiddenShiurLinks(page, ed), `${path}: links only visible shiurim`).toEqual([]);
  expect(await brokenLinks(page), `${path}: links land on built pages`).toEqual([]);
  await page.context().close();
}

describe.each(EDS)("%s edition: corpus pages with JavaScript off", (ed) => {
  it("the topic tree: the index label once, every level-1 topic with a page linked", async () => {
    const path = `/${ed}/inyanim/`;
    const page = await openNoJs(path);
    await basics(page, ed, path);
    expect((await labels(page)).index).toBe(1);
    const tree = layer<{ tree: TopicNode[] }>("topics.json").tree;
    const roots = tree.filter((t) => t.parentId === null && onQuiet(t)).map((t) => t.id);
    const linked = new Set(
      await page.locator(`main a[href^='/${ed}/inyanim/']`).evaluateAll((as) => as.map((a) => a.getAttribute("href")!.split("/")[3])),
    );
    for (const id of roots) expect(linked.has(id), `tree links ${id}`).toBe(true);
    expect(await brokenLinks(page)).toEqual([]);
    await page.context().close();
  }, 120_000);

  it("a topic page, and the gateway's full list", async () => {
    const { topic, gateway } = sample();
    await entityPage(ed, `/${ed}/inyanim/${topic.id}/`, [topic.label.he, topic.label.yi, topic.label.en]);
    if (gateway) {
      const all = `/${ed}/inyanim/${gateway.id}/all/`;
      const page = await openNoJs(all);
      await basics(page, ed, all);
      expect(await hiddenShiurLinks(page, ed)).toEqual([]);
      expect(await page.locator(`main a[href^='/${ed}/shiur/']`).count()).toBeGreaterThan(0);
      await page.context().close();
    }
  }, 120_000);

  it("the glossary (ערכים) and a concept page", async () => {
    const path = `/${ed}/erachim/`;
    const page = await openNoJs(path);
    await basics(page, ed, path);
    expect((await labels(page)).index).toBe(1);
    await page.context().close();
    const { concept } = sample();
    await entityPage(ed, `/${ed}/erachim/${concept.id}/`, [concept.canonicalHe, concept.label?.yi, concept.label?.en]);
  }, 120_000);

  it("a person page and a work page", async () => {
    const { person, work } = sample();
    await entityPage(ed, `/${ed}/people/${person.id}/`, [person.nameHe, person.nameYi, person.nameEn]);
    await entityPage(ed, `/${ed}/sources/${work.id}/`, [work.titleHe, work.titleEn]);
  }, 120_000);

  it("a story page", async () => {
    const { story } = sample();
    await entityPage(ed, `/${ed}/stories/${story.id}/`, [story.title[ed] ?? story.title.yi, story.title.en, story.title.yi]);
  }, 120_000);

  it("a series page shows its generated overview when the layer has one", async () => {
    const { series } = sample();
    const id = series?.seriesId ?? "tanya-yi";
    const path = `/${ed}/series/${id}/`;
    if (!existsSync(join(dist, ed, "series", id, "index.html"))) throw new Error(`no series page ${path}`);
    const page = await openNoJs(path);
    await basics(page, ed, path);
    if (series?.overview) {
      const intro = page.locator("main [data-series-intro]");
      expect(await intro.count(), path).toBe(1);
      const text = clean(await intro.textContent());
      const want = [series.overview.en, series.overview.yi].map((s) => clean(s).slice(0, 40)).filter((s) => s !== "");
      expect(want.some((w) => text.includes(w)), `${path}: overview shown`).toBe(true);
    }
    expect(await brokenLinks(page)).toEqual([]);
    await page.context().close();
  }, 120_000);

  it("an entity without a Quiet page has no address", () => {
    const { noPage } = sample();
    expect(noPage.length).toBeGreaterThan(0);
    for (const n of noPage) {
      const p = n.path(ed);
      expect(existsSync(join(dist, p, "index.html")), `${n.kind}: ${p} must not be built`).toBe(false);
    }
  });
});
