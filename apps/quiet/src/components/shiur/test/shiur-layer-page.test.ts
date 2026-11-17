/**
 * C2.4: the shiur page with the corpus layer, rendered with the Astro Container API, on the mini
 * corpus of @emunas/corpus and (when the repo's data is present) on the real data.
 *
 * - the ענינים line sits under the abstract, only on a page with notes, ≤ 5 topics at salience ≥ 0.6;
 * - every link into an index goes to an entry that has a Quiet page, or to the index anchor of an
 *   entry listed there, never to a page that is not built (and never by a legacy key);
 * - the topic line is the only corpus line on the page; the previous/next line stays catalog-only.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import type { CorpusKind } from "@emunas/links";
import type { PublicShiur } from "@emunas/corpus/public";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Ed } from "../../../lib/edition.ts";
import ShiurPage from "../ShiurPage.astro";
import { loadShiurCorpus, type ShiurCorpus } from "../corpus.ts";
import { topicLine, TOPIC_LINE_MAX, TOPIC_LINE_MIN_SALIENCE } from "../refs.ts";
import { prevNext } from "../view.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../../../../..");
const corpusPkg = join(repo, "packages/corpus");
const realData = join(repo, "data");
const hasRealData = existsSync(join(realData, "derived", "corpus", "index.json"));
const EDS: readonly Ed[] = ["en", "yi"];

let work = "";
let container: AstroContainer;

/** Runs `corpus:build` (the public way in for app code) into a temp folder and loads it. */
function buildCorpus(dataDir: string, policyDir: string, name: string): ShiurCorpus {
  const out = join(work, name);
  const tsx = join(repo, "node_modules", ".bin", "tsx");
  const r = spawnSync(tsx, [join(corpusPkg, "src", "cli.ts"), "--data-dir", dataDir, "--policy-dir", policyDir, "--out", out, "--media-origin", "https://media.example.org"], {
    cwd: repo,
    env: { ...process.env, INIT_CWD: repo, EMUNAS_DEPLOY: "" },
    encoding: "utf8",
  });
  if (r.status !== 0) throw new Error(`corpus:build failed:\n${r.stdout}\n${r.stderr}`);
  return loadShiurCorpus(out);
}

beforeAll(async () => {
  work = mkdtempSync(join(tmpdir(), "quiet-shiur-layer-"));
  container = await AstroContainer.create();
});

afterAll(() => {
  if (work) rmSync(work, { recursive: true, force: true });
});

async function render(corpus: ShiurCorpus, ed: Ed, shiur: PublicShiur): Promise<string> {
  const neighbours = prevNext(ed, shiur, corpus.neighbours[shiur.id], corpus.rows, (id) => corpus.seriesTitle(id, ed));
  return container.renderToString(ShiurPage, {
    props: { ed, shiur, prevNext: neighbours, layer: corpus.layer, refs: shiur.status === "full" ? corpus.refs(shiur.id) : null },
  });
}

const hrefs = (html: string) => [...html.matchAll(/\shref="([^"]+)"/g)].map((m) => m[1]!.replaceAll("&amp;", "&"));
const DIR_KIND: Readonly<Record<string, CorpusKind>> = { inyanim: "topic", erachim: "concept", people: "person", sources: "work", stories: "story" };

/** Every link into the corpus indexes points at a built page or at a listed entry's index anchor. */
function checkEntryLinks(corpus: ShiurCorpus, ed: Ed, html: string): number {
  let n = 0;
  for (const h of hrefs(html)) {
    const page = new RegExp(`^/${ed}/(inyanim|erachim|people|sources|stories)/([^/#]+)/$`).exec(h);
    const anchor = new RegExp(`^/${ed}/(inyanim|erachim|people|sources|stories)/#(.+)$`).exec(h);
    if (page) {
      const kind = DIR_KIND[page[1]!]!;
      expect(corpus.layer.hasPage(kind, decodeURIComponent(page[2]!)), h).toBe(true);
      n++;
    } else if (anchor) {
      const kind = DIR_KIND[anchor[1]!]!;
      const id = decodeURIComponent(anchor[2]!);
      expect(corpus.layer.hasPage(kind, id), h).toBe(false);
      const l = corpus.layer;
      const known = { topic: l.topic(id), concept: l.concept(id), person: l.person(id), work: l.work(id), story: l.story(id), thread: undefined }[kind];
      expect(known, h).toBeDefined();
      if (kind === "person") {
        expect(l.person(id)?.listed.quiet, h).toBe(true);
        expect(l.person(id)?.excluded ?? null, h).toBeNull();
      }
      if (kind === "work") expect(l.work(id)?.generic, h).toBe(false);
      n++;
    }
  }
  return n;
}

/** Checks one rendered page against its refs. */
function checkPage(corpus: ShiurCorpus, ed: Ed, shiur: PublicShiur, html: string): void {
  const refs = corpus.refs(shiur.id);
  if (shiur.status !== "full") {
    expect(html).not.toContain('class="topic-line"');
    expect(html).not.toContain("data-corpus=");
    return;
  }
  // The ענינים line: under the abstract, inside "about".
  const line = topicLine(ed, corpus.layer, refs);
  expect(line.length).toBeLessThanOrEqual(TOPIC_LINE_MAX);
  if (line.length > 0) {
    const about = /<section class="about-shiur"[\s\S]*?<\/section>/.exec(html)?.[0] ?? "";
    expect(about).toContain('class="topic-line"');
    for (const tp of line) expect(about).toContain(`href="${tp.href}"`);
    const tags = new Map((refs?.topics ?? []).map((t) => [t.id, t.salience]));
    for (const tp of line) expect(tags.get(tp.id)).toBeGreaterThanOrEqual(TOPIC_LINE_MIN_SALIENCE);
  } else {
    expect(html).not.toContain('class="topic-line"');
  }
  // The topic line is the only corpus line: no people, terms, sources or stories on the page.
  expect([...html.matchAll(/data-corpus="([a-z]+)"/g)].map((m) => m[1])).toEqual(line.length > 0 ? ["topics"] : []);
  expect(html).not.toMatch(/data-person=|data-story-person|href="\/(en|yi)\/(erachim|people|sources|stories)\//);
  // The previous/next line is catalog-only: no corpus entry link in it.
  const nav = /<nav class="prev-next"[\s\S]*?<\/nav>/.exec(html)?.[0] ?? "";
  expect(nav).not.toMatch(/href="\/(en|yi)\/(inyanim|erachim|people|sources|stories)\//);
}

describe("the shiur page on the mini corpus layer", () => {
  let corpus: ShiurCorpus;
  beforeAll(() => {
    corpus = buildCorpus(join(corpusPkg, "test/fixtures/mini/data"), join(corpusPkg, "test/fixtures/mini/site-policy"), "mini");
  }, 120_000);

  it("reads the layer refs only for shiurim in the visible set", () => {
    for (const row of corpus.index.shiurim) {
      const s = corpus.shiur(row.id);
      if (s.status !== "full") expect(corpus.refs(row.id), row.id).toBeNull();
    }
    expect(corpus.refs("yi-zmanim-svkvs-08")?.shiurId).toBe("yi-zmanim-svkvs-08");
    expect(corpus.refs("no-such-shiur")).toBeNull();
  });

  it.each(EDS)("every page (%s) prints only the topic line from the layer, linking built entries", async (ed) => {
    let links = 0;
    let topicLines = 0;
    for (const row of corpus.index.shiurim) {
      const shiur = corpus.shiur(row.id);
      const html = await render(corpus, ed, shiur);
      links += checkEntryLinks(corpus, ed, html);
      checkPage(corpus, ed, shiur, html);
      if (html.includes('class="topic-line"')) topicLines++;
    }
    expect(links).toBeGreaterThan(10);
    expect(topicLines).toBeGreaterThan(10);
  }, 120_000);
});

describe.runIf(hasRealData)("the shiur page on the real corpus layer", () => {
  let corpus: ShiurCorpus;
  beforeAll(() => {
    corpus = buildCorpus(realData, join(repo, "site-policy"), "real");
  }, 300_000);

  it("has no layer refs and no corpus line on a catalog-only shiur", () => {
    let catalogOnly = 0;
    for (const row of corpus.index.shiurim) {
      if (corpus.shiur(row.id).status === "full") continue;
      catalogOnly++;
      expect(corpus.refs(row.id), row.id).toBeNull();
    }
    expect(catalogOnly).toBeGreaterThan(0);
  });

  it("links only built topic pages on the topic line (every visible shiur, models)", () => {
    let topicLinks = 0;
    for (const row of corpus.index.shiurim) {
      const shiur = corpus.shiur(row.id);
      const refs = corpus.refs(row.id);
      if (shiur.status !== "full" || refs === null) continue;
      for (const ed of EDS) {
        const line = topicLine(ed, corpus.layer, refs);
        expect(line.length).toBeLessThanOrEqual(TOPIC_LINE_MAX);
        for (const tp of line) expect(corpus.layer.hasPage("topic", tp.id), tp.id).toBe(true);
        topicLinks += line.length;
      }
    }
    expect(topicLinks).toBeGreaterThan(1000);
  });

  it("renders a sample of pages in both editions with only built entry links", async () => {
    const rows = corpus.index.shiurim.filter((_, i) => i % 40 === 0);
    for (const row of rows) {
      const shiur = corpus.shiur(row.id);
      for (const ed of EDS) {
        const html = await render(corpus, ed, shiur);
        checkEntryLinks(corpus, ed, html);
        checkPage(corpus, ed, shiur, html);
      }
    }
  }, 300_000);
});
