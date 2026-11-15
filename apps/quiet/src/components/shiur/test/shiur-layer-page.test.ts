/**
 * C2.4: the shiur page with the corpus layer, rendered with the Astro Container API, on the mini
 * corpus of @emunas/corpus and (when the repo's data is present) on the real data.
 *
 * - the ענינים line sits under the abstract, only on a page with notes, ≤ 5 topics at salience ≥ 0.6;
 * - every link into an index goes to an entry that has a Quiet page, or to the index anchor of an
 *   entry listed there, never to a page that is not built (and never by a legacy key);
 * - "told in N other shiurim" appears exactly for the stories with other visible tellings, with
 *   the layer's count;
 * - the order of the page is unchanged; the place in the catalog stays catalog-only.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { corpusLabel } from "@emunas/i18n";
import type { CorpusKind } from "@emunas/links";
import type { PublicShiur } from "@emunas/corpus/public";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Ed } from "../../../lib/edition.ts";
import ShiurPage from "../ShiurPage.astro";
import { loadShiurCorpus, type ShiurCorpus } from "../corpus.ts";
import { mentionedView, sourceLinks, storyLines, topicLine, TOPIC_LINE_MAX, TOPIC_LINE_MIN_SALIENCE } from "../refs.ts";
import { catalogPlace } from "../view.ts";

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
  const place = catalogPlace(ed, shiur, corpus.neighbours[shiur.id], corpus.rows, (id) => corpus.seriesTitle(id, ed));
  return container.renderToString(ShiurPage, {
    props: { ed, shiur, place, layer: corpus.layer, refs: shiur.status === "full" ? corpus.refs(shiur.id) : null },
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

/** The ids of the page's parts in document order. */
const PART_IDS = ["about", "outline", "writeup", "sources", "apparatus", "mentioned", "catalog"];
function partOrder(html: string): string[] {
  return [...html.matchAll(/\sid="([a-z-]+)"/g)].map((m) => m[1]!).filter((id) => PART_IDS.includes(id));
}

/** Checks one rendered page against its refs; returns the number of "told in" lines. */
function checkPage(corpus: ShiurCorpus, ed: Ed, shiur: PublicShiur, html: string): number {
  const refs = corpus.refs(shiur.id);
  if (shiur.status !== "full") {
    expect(html).not.toContain('class="topic-line"');
    expect(html).not.toContain("data-corpus=");
    expect(html).not.toContain('id="mentioned"');
    return 0;
  }
  // The ענינים line: under the abstract, inside "about", before the outline.
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
  // The page order is unchanged.
  const order = partOrder(html);
  expect(order).toEqual(PART_IDS.filter((id) => order.includes(id)));
  // The place in the catalog is catalog-only: no corpus entry link in it.
  const place = /<section class="catalog-place"[\s\S]*?<\/section>/.exec(html)?.[0] ?? html.slice(html.indexOf('id="catalog"'));
  expect(place).not.toMatch(/href="\/(en|yi)\/(inyanim|erachim|people|sources|stories)\//);
  // "Told in N other shiurim": exactly the stories with other visible tellings, with the layer's count.
  const lines = storyLines(ed, corpus.layer, shiur.id, refs);
  const shown = [...html.matchAll(/<p class="story-elsewhere"[^>]*>([\s\S]*?)<\/p>/g)].map((m) => m[1]!);
  const expected = (shiur.notes?.stories ?? []).map((s) => lines.get(s.id)).filter((l) => l !== undefined && l.otherShiurim > 0);
  expect(shown).toHaveLength(expected.length);
  expected.forEach((l, i) => {
    const story = corpus.layer.story(l!.storyId)!;
    const others = new Set(story.tellings.map((t) => t.shiurId).filter((id) => id !== shiur.id));
    expect(l!.otherShiurim).toBe(others.size);
    expect(shown[i]).toContain(corpusLabel("count.toldInOther", ed, { count: others.size }));
  });
  // Mentioned: exactly the layer's people and terms that are printed.
  const m = mentionedView(ed, corpus.layer, refs);
  if (m.people.length + m.concepts.length === 0) expect(html).not.toContain('id="mentioned"');
  else expect(html).toContain('id="mentioned"');
  return expected.length;
}

describe("the shiur page on the mini corpus layer", () => {
  let corpus: ShiurCorpus;
  beforeAll(() => {
    corpus = buildCorpus(join(corpusPkg, "test/fixtures/mini/data"), join(corpusPkg, "test/fixtures/mini/site-policy"), "mini");
  }, 120_000);

  it("reads the layer refs only for shiurim in the visible set", () => {
    expect(corpus.layer.enabled).toBe(true);
    for (const row of corpus.index.shiurim) {
      const s = corpus.shiur(row.id);
      if (s.status !== "full") expect(corpus.refs(row.id), row.id).toBeNull();
    }
    expect(corpus.refs("yi-zmanim-svkvs-08")?.shiurId).toBe("yi-zmanim-svkvs-08");
    expect(corpus.refs("no-such-shiur")).toBeNull();
  });

  it.each(EDS)("every page (%s) keeps its order, links only built entries, and counts stories as the layer does", async (ed) => {
    let links = 0;
    let told = 0;
    let topicLines = 0;
    for (const row of corpus.index.shiurim) {
      const shiur = corpus.shiur(row.id);
      const html = await render(corpus, ed, shiur);
      links += checkEntryLinks(corpus, ed, html);
      told += checkPage(corpus, ed, shiur, html);
      if (html.includes('class="topic-line"')) topicLines++;
    }
    expect(links).toBeGreaterThan(50);
    expect(topicLines).toBeGreaterThan(10);
    // The fixture's two stories told twice: four story pages print the line.
    expect(told).toBe(4);
  }, 120_000);

  it("prints 'told in 1 other shiur' linking the story page", async () => {
    const shiur = corpus.shiur("yi-zmanim-svkvs-08");
    const en = await render(corpus, "en", shiur);
    expect(en).toContain('<a href="/en/stories/chizkiyahu-sleeps-during-sanherivs-siege/">told in 1 other shiur →</a>');
    const yi = await render(corpus, "yi", shiur);
    expect(yi).toContain('<a href="/yi/stories/chizkiyahu-sleeps-during-sanherivs-siege/">דערציילט אין נאך 1 שיעור ←</a>');
  });

  it("links sources to the work entry by corpus work id", async () => {
    const shiur = corpus.shiur("yi-zmanim-lvl-01");
    const refs = corpus.refs(shiur.id)!;
    const works = sourceLinks("en", corpus.layer, refs);
    expect(works.size).toBeGreaterThan(0);
    const html = await render(corpus, "en", shiur);
    for (const s of shiur.notes!.sources) {
      const w = works.get(s.id);
      const item = new RegExp(`<li id="src${s.idx}">([\\s\\S]*?)</li>`).exec(html)?.[1] ?? "";
      if (w?.href) expect(item, s.id).toContain(`href="${w.href}"`);
      else expect(item, s.id).not.toMatch(/href="\/en\/sources\//);
    }
  });

  it("names the Rav's family nowhere and links a type-other person below the line threshold nowhere", async () => {
    const family = corpus.layer.person("eliyahu-shalom-wolfson")!;
    expect(family.excluded).toBe("family");
    const shiur = corpus.shiur("en-miscellaneous-en-01");
    expect(family.shiurIds).toContain(shiur.id);
    const html = await render(corpus, "en", shiur);
    const mentioned = /<section class="mentioned"[\s\S]*?<\/section>/.exec(html)?.[0] ?? "";
    expect(mentioned).not.toContain(family.nameEn);
    expect(html).not.toContain("eliyahu-shalom-wolfson");
    const other = await render(corpus, "en", corpus.shiur("en-miscellaneous-en-02"));
    expect(other).not.toContain("people/#syn-other-one-shiur");
    expect(other).not.toContain("people/syn-other-one-shiur/");
  });

  it("links a glossary term merged into a topic to the topic", async () => {
    const shiur = corpus.shiur("yi-zmanim-tv-bb-04");
    expect(corpus.refs(shiur.id)?.conceptIds).toContain("yiras-shamayim");
    const html = await render(corpus, "en", shiur);
    const mentioned = /<section class="mentioned"[\s\S]*?<\/section>/.exec(html)?.[0] ?? "";
    expect(mentioned).toContain('href="/en/inyanim/yiras-shamayim/"');
    expect(mentioned).not.toContain("/erachim/yiras-shamayim");
  });
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

  it("links only built entries or listed index lines, and story counts match the layer (every visible shiur, models)", () => {
    let topicLinks = 0;
    let told = 0;
    for (const row of corpus.index.shiurim) {
      const shiur = corpus.shiur(row.id);
      const refs = corpus.refs(row.id);
      if (shiur.status !== "full" || refs === null) continue;
      for (const ed of EDS) {
        const line = topicLine(ed, corpus.layer, refs);
        expect(line.length).toBeLessThanOrEqual(TOPIC_LINE_MAX);
        for (const tp of line) expect(corpus.layer.hasPage("topic", tp.id), tp.id).toBe(true);
        topicLinks += line.length;
        const m = mentionedView(ed, corpus.layer, refs);
        for (const p of m.people) {
          const rec = corpus.layer.person(p.id)!;
          expect(rec.excluded ?? null).toBeNull();
          if (p.href?.endsWith(`/${p.id}/`)) expect(rec.pages.quiet, p.id).toBe(true);
          if (p.href?.includes("#")) expect(rec.listed.quiet, p.id).toBe(true);
          if (p.href === null) expect(rec.pages.quiet || rec.listed.quiet, p.id).toBe(false);
        }
        for (const [, w] of sourceLinks(ed, corpus.layer, refs)) {
          if (w.href?.endsWith(`/${w.workId}/`)) expect(corpus.layer.hasPage("work", w.workId), w.workId).toBe(true);
        }
        for (const r of refs.stories) {
          const l = storyLines(ed, corpus.layer, row.id, refs).get(r.momentId);
          if (!l) continue;
          const story = corpus.layer.story(r.storyId)!;
          // the per-shiur ref and the story agree on the number of tellings
          expect(r.tellings, r.storyId).toBe(story.tellings.length);
          expect(l.otherShiurim).toBe(story.tellings.length >= 2 ? new Set(story.tellings.map((t) => t.shiurId).filter((id) => id !== row.id)).size : 0);
          if (ed === "en" && l.otherShiurim > 0) told++;
        }
      }
    }
    expect(topicLinks).toBeGreaterThan(1000);
    expect(told).toBeGreaterThan(100);
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
