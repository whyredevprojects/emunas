/**
 * W3.2 acceptance on rendered HTML (Astro Container API):
 * - the 7 sample shiurim render in both editions (full and catalog-only pages);
 * - items below confidence 0.6 are absent (one planted in a copy of the mini corpus);
 * - source letters link both ways; every time link works without script (`audioUrl#t=`);
 * - unplayable recordings are shown as unavailable, their times as plain text;
 * - no transcript UI or field in the output; the reserved slot renders nothing;
 * - page ≤ 120 KB raw / ≤ 30 KB brotli.
 *
 * The corpus is built here from a copy of `packages/corpus/test/fixtures/mini` with the real
 * `corpus:build` CLI, so the pages are rendered from exactly what the site build reads.
 */
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync } from "node:zlib";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { round3, type PublicShiur } from "@emunas/corpus/public";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import ShiurPage from "../src/components/shiur/ShiurPage.astro";
import TranscriptSlot from "../src/components/shiur/TranscriptSlot.astro";
import { findCorpusDir, loadShiurCorpus, type ShiurCorpus } from "../src/components/shiur/corpus.ts";
import { catalogPlace } from "../src/components/shiur/view.ts";
import type { Ed } from "../src/lib/edition.ts";

const app = fileURLToPath(new URL("..", import.meta.url));
const repo = join(app, "..", "..");
const mini = join(repo, "packages", "corpus", "test", "fixtures", "mini");
const require = createRequire(import.meta.url);
const MEDIA = "https://media.example.org";

const SAMPLES = [
  "yi-parshas-hashavua-brshys-01",
  "en-parsha-en-nch-01",
  "yi-zmanim-tv-bb-04",
  "yi-tanya-1-01",
  "yi-zmanim-lvl-01",
  "yi-zmanim-msybs-lchyym-bkmp-01-c",
  "en-miscellaneous-en-01",
] as const;
const EDS: readonly Ed[] = ["yi", "en"];

/** The planted low-confidence items (raw text that must not reach the page). */
const planted: string[] = [];
let work = "";
let corpus: ShiurCorpus;
let container: AstroContainer;

beforeAll(async () => {
  work = mkdtempSync(join(tmpdir(), "quiet-shiur-"));
  const fixture = join(work, "mini");
  cpSync(mini, fixture, { recursive: true });
  // Plant items below the 0.6 confidence cut in one done shiur.
  const extractionPath = join(fixture, "data", "derived", "shiurim", "yi-parshas-hashavua-brshys-01", "extraction.json");
  const ex = JSON.parse(readFileSync(extractionPath, "utf8"));
  ex.insights[0].evidence.confidence = 0.5;
  planted.push(ex.insights[0].text.en, ex.insights[0].text.yi);
  ex.questions[0].confidence = 0.4;
  planted.push(ex.questions[0].question.en, ex.questions[0].question.yi);
  ex.takeaways[0].evidence.confidence = 0.59;
  planted.push(ex.takeaways[0].text.en, ex.takeaways[0].text.yi);
  writeFileSync(extractionPath, JSON.stringify(ex));

  const out = join(work, "corpus");
  const cli = join(repo, "packages", "corpus", "src", "cli.ts");
  const tsx = require.resolve("tsx");
  const r = spawnSync(
    process.execPath,
    ["--import", tsx, cli, "--data-dir", join(fixture, "data"), "--policy-dir", join(fixture, "site-policy"), "--out", out, "--media-origin", MEDIA],
    { encoding: "utf8", cwd: repo },
  );
  if (r.status !== 0) throw new Error(`corpus:build failed\n${r.stdout}\n${r.stderr}`);
  corpus = loadShiurCorpus(out);
  container = await AstroContainer.create();
}, 120_000);

afterAll(() => {
  if (work) rmSync(work, { recursive: true, force: true });
});

async function renderPage(ed: Ed, shiur: PublicShiur, extra: Record<string, unknown> = {}): Promise<string> {
  const place = catalogPlace(ed, shiur, corpus.neighbours[shiur.id], corpus.rows, (id) => corpus.seriesTitle(id, ed));
  return container.renderToString(ShiurPage, {
    props: { ed, shiur, place, layer: corpus.layer, refs: shiur.status === "full" ? corpus.refs(shiur.id) : null, ...extra },
  });
}

const ids = (html: string) => new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
const hrefs = (html: string) => [...html.matchAll(/\shref="([^"]+)"/g)].map((m) => m[1]!.replaceAll("&amp;", "&"));

describe("corpus loader", () => {
  it("finds .corpus by env or by walking up, and loads rows and shiurim", () => {
    expect(findCorpusDir({ EMUNAS_CORPUS_DIR: corpus.dir })).toBe(corpus.dir);
    expect(findCorpusDir({ EMUNAS_CORPUS_DIR: join(work, "nowhere") })).toBeNull();
    expect(findCorpusDir({}, join(work, "corpus", "shiurim"))).toBeNull(); // `.corpus` is the dir name it looks for
    expect(corpus.index.shiurim.length).toBe(60);
    for (const id of SAMPLES) expect(corpus.shiur(id).id).toBe(id);
    expect(() => corpus.shiur("no-such-shiur")).toThrow(/not in/);
  });
});

describe.each(EDS)("the 7 sample shiurim, %s edition", (ed) => {
  it.each(SAMPLES)("%s renders", async (id) => {
    const shiur = corpus.shiur(id);
    const html = await renderPage(ed, shiur);
    expect(html).toContain(`<html lang="${ed}" dir="${ed === "yi" ? "rtl" : "ltr"}">`);
    expect(html.match(/<h1\b/g)?.length).toBe(1);
    expect(html).toContain('class="listen"');
    expect(html).toContain('id="catalog"');
    expect(html).not.toMatch(/<blockquote|<q[\s>]/);

    // No transcript UI and no transcript-bearing field or path, in any form.
    expect(html).not.toMatch(/transcri|heardAs|asrNotes|audioKey|input\.txt|\/audio\//i);

    if (shiur.status === "full") {
      expect(html.match(/class="notes-label"/g)?.length).toBe(1);
      expect(html).toContain('id="outline"');
      expect(html).not.toContain("notes-pending");
      // the edition's write-up and summary, not the other language's
      const notes = shiur.notes!;
      expect(html).toContain(escape(notes.summary.oneLiner[ed]));
      const firstPara = notes.writeup[ed][0]?.paragraphs[0]?.text;
      if (firstPara) expect(html).toContain(escape(firstPara));
      const otherPara = notes.writeup[ed === "yi" ? "en" : "yi"][0]?.paragraphs[0]?.text;
      if (otherPara) expect(html).not.toContain(escape(otherPara));
    } else {
      expect(html).toContain(ed === "en" ? "Notes for this shiur have not been prepared yet." : "נאטיצן פאר דעם שיעור זענען נאך נישט צוגעגרייט.");
      expect(html).not.toMatch(/class="voice-notes"|id="outline"|id="writeup"|id="sources"|notes-label|class="jump-list"/);
    }

    // Every in-page link has a target.
    const present = ids(html);
    for (const h of hrefs(html).filter((x) => x.startsWith("#"))) expect(present.has(h.slice(1)), h).toBe(true);

    // Every time link works without script: the recording's media URL at a whole second.
    const times = [...html.matchAll(/<a class="time" dir="ltr" href="([^"]+)" data-g="([\d.]+)"/g)];
    if (shiur.status === "full") expect(times.length).toBeGreaterThan(5);
    for (const [, href, g] of times) {
      const global = Number(g);
      // the recording the global time falls in, and the whole second inside it
      const recording = [...shiur.recordings].reverse().find((r) => r.offset <= global)!;
      expect(recording.audioUrl).toBeTruthy();
      expect(href).toBe(`${recording.audioUrl}#t=${Math.floor(round3(global - recording.offset))}`);
      expect(href!.startsWith(`${MEDIA}/`)).toBe(true);
    }

    // Size budget (tech-quiet §3.5): ≤ 120 KB raw, ≤ 30 KB brotli.
    const bytes = Buffer.byteLength(html);
    expect(bytes).toBeLessThanOrEqual(120 * 1024);
    expect(brotliCompressSync(html).length).toBeLessThanOrEqual(30 * 1024);
  });
});

/** Astro escapes text content like this. */
function escape(s: string): string {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

describe("full page details", () => {
  it("drops items below confidence 0.6 (planted in the fixture copy)", async () => {
    const shiur = corpus.shiur("yi-parshas-hashavua-brshys-01");
    for (const ed of EDS) {
      const html = await renderPage(ed, shiur);
      for (const text of planted) expect(html.includes(escape(text)), text.slice(0, 40)).toBe(false);
    }
    expect(planted.length).toBe(6);
  });

  it("links source letters both ways (write-up ↔ list) with outline anchors #s{idx}", async () => {
    const shiur = corpus.shiur("yi-zmanim-tv-bb-04");
    const html = await renderPage("en", shiur);
    const notes = shiur.notes!;
    for (const c of notes.chapters) expect(html).toContain(`id="s${c.idx}"`);
    const cites = [...html.matchAll(/<a href="#(src\d+)" aria-label="Source ([a-z]+)">([a-z]+)<\/a>/g)];
    expect(cites.length).toBeGreaterThan(3);
    for (const [, anchor, label, letter] of cites) {
      expect(label).toBe(letter);
      const item = new RegExp(`<li id="${anchor}">\\s*<span>${letter}</span>`);
      expect(html, anchor).toMatch(item);
    }
    // Each source's back links go to paragraphs that cite that source, and every citing
    // paragraph is linked back.
    const items = [...html.matchAll(/<li id="(src\d+)">([\s\S]*?)<\/li>/g)];
    expect(items.length).toBe(notes.sources.length);
    const paragraphs = new Map(
      [...html.matchAll(/<div class="para" id="(p\d+-\d+)" data-mark>([\s\S]*?)<\/div>/g)].map((m) => [m[1]!, m[2]!]),
    );
    let backLinks = 0;
    for (const [, src, body] of items) {
      const back = [...body!.matchAll(/<a href="#(p\d+-\d+)" dir="ltr">/g)].map((m) => m[1]!);
      const citing = [...paragraphs].filter(([, text]) => text.includes(`href="#${src}"`)).map(([id]) => id);
      expect(back, src).toEqual(citing);
      backLinks += back.length;
    }
    expect(backLinks).toBeGreaterThan(3);
    // resolved sources link out to Sefaria; nothing else does
    const out = hrefs(html).filter((h) => h.startsWith("https://www.sefaria.org/"));
    expect(out.length).toBe(notes.sources.filter((s) => s.resolution === "resolved" && s.sefariaRef).length);
  });

  it("puts multi-recording times on the right file", async () => {
    const shiur = corpus.shiur("yi-zmanim-tv-bb-04");
    expect(shiur.recordings.length).toBe(2);
    const html = await renderPage("yi", shiur);
    const second = shiur.recordings[1]!;
    const late = shiur.notes!.chapters.find((c) => c.t >= second.offset)!;
    const local = Math.floor(round3(late.t - second.offset));
    expect(html).toContain(`href="${second.audioUrl}#t=${local}" data-g="${late.t}"`);
    expect(html).toContain("שפילן פון");
    expect(html.match(/<audio\b/g)?.length).toBe(2);
  });

  it("shows unplayable recordings as unavailable and their times as text", async () => {
    const base = corpus.shiur("yi-zmanim-tv-bb-04");
    const shiur: PublicShiur = {
      ...base,
      recordings: base.recordings.map((r, i) => (i === 1 ? { ...r, audioUrl: null, playable: false } : r)),
    };
    const html = await renderPage("en", shiur);
    expect(html.match(/<audio\b/g)?.length).toBe(1);
    expect(html).toContain("Part 2: not yet available online.");
    expect(html).toContain("time-unavailable");
    expect(html).not.toContain(`href="${base.recordings[1]!.audioUrl}`);
  });

  it("adds the listening-app and report links only when configured", async () => {
    const shiur = corpus.shiur("en-parsha-en-nch-01");
    const bare = await renderPage("en", shiur);
    expect(bare).not.toContain("open-live");
    expect(bare).not.toContain("mailto:");
    const html = await renderPage("en", shiur, {
      liveHref: "https://listen.example.org/en/s/en-parsha-en-nch-01",
      reportHref: "mailto:e@example.org?subject=x",
    });
    expect(html).toContain('<a href="https://listen.example.org/en/s/en-parsha-en-nch-01" hreflang="en">Open in the listening app</a>');
    expect(html).toContain('href="mailto:e@example.org?subject=x"');
  });

  it("lists previous/next in the section and series on a catalog-only page", async () => {
    const shiur = corpus.shiur("yi-tanya-1-01");
    const html = await renderPage("en", shiur);
    expect(html).toContain('data-place="section"');
    expect(html).toContain('data-place="series"');
    expect(html).toContain('href="/en/series/tanya-yi/"');
    expect(html).toMatch(/rel="next"/);
  });

  it("renders nothing in the reserved transcript slot", async () => {
    const shiur = corpus.shiur("yi-zmanim-tv-bb-04");
    const html = await container.renderToString(TranscriptSlot, { props: { recordings: shiur.recordings } });
    expect(html.trim()).toBe("");
  });
});
