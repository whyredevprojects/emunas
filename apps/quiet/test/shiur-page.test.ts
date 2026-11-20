/**
 * W3.2 acceptance on rendered HTML (Astro Container API):
 * - the 7 sample shiurim render in every edition (full and catalog-only pages);
 * - generated text is shown in the edition's language, else the fallback along `CONTENT_FALLBACK`,
 *   with the lang/dir of the language shown (a Hebrew overlay is planted for one shiur; the others
 *   fall back to Yiddish in the Hebrew edition);
 * - the page holds the header, Listen, "about this shiur" and one previous/next line, nothing else
 *   from the notes (items below confidence 0.6, planted in a copy of the mini corpus, are absent too);
 * - the last crumb is the shiur title; the meta line has no catalog number or guide page;
 * - unplayable recordings are shown as unavailable;
 * - no transcript UI or field in the output;
 * - each recording plays the original by default; downloads follow the version that plays;
 * - page ≤ 120 KB raw / ≤ 30 KB brotli.
 *
 * The corpus is built here from a copy of `packages/corpus/test/fixtures/mini` with the real
 * `corpus:build` CLI, so the pages are rendered from exactly what the site build reads.
 */
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync } from "node:zlib";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import type { PublicShiur } from "@emunas/corpus/public";
import { hashSlots, shiurSlots } from "@emunas/corpus/build";
import { UI_DIR, notice, pickText } from "@emunas/i18n";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import ShiurPage from "../src/components/shiur/ShiurPage.astro";
import { findCorpusDir, loadShiurCorpus, type ShiurCorpus } from "../src/components/shiur/corpus.ts";
import { shiurEn } from "../src/components/shiur/strings.ts";
import { prevNext } from "../src/components/shiur/view.ts";
import { runAttrs } from "../src/lib/bidi.ts";
import { EDS, type Ed } from "../src/lib/edition.ts";

const escapeRe = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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
/** The shiur given a current Hebrew translation overlay in the fixture copy. */
const TRANSLATED = "yi-zmanim-tv-bb-04";

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

  // A current Hebrew overlay for one shiur: every slot.
  const tdir = join(fixture, "data", "derived", "shiurim", TRANSLATED);
  const tx = JSON.parse(readFileSync(join(tdir, "extraction.json"), "utf8"));
  const tw = JSON.parse(readFileSync(join(tdir, "writeup.json"), "utf8"));
  const slots = shiurSlots(tx, tw);
  mkdirSync(join(tdir, "i18n"), { recursive: true });
  writeFileSync(
    join(tdir, "i18n", "he.json"),
    JSON.stringify({
      shiurId: TRANSLATED,
      lang: "he",
      model: "test",
      promptVersion: "test",
      sourceHash: hashSlots(slots),
      text: Object.fromEntries(slots.map((sl) => [sl.k, `בעברית ${sl.k}`])),
    }),
  );

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
  const neighbours = prevNext(ed, shiur, corpus.neighbours[shiur.id], corpus.rows, (id) => corpus.seriesTitle(id, ed));
  return container.renderToString(ShiurPage, {
    props: { ed, shiur, prevNext: neighbours, layer: corpus.layer, refs: shiur.status === "full" ? corpus.refs(shiur.id) : null, ...extra },
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
    expect(html).toContain(`<html lang="${ed}" dir="${UI_DIR[ed]}">`);
    expect(html.match(/<h1\b/g)?.length).toBe(1);
    expect(html).toContain('class="listen"');
    expect(html.match(/<nav class="prev-next"/g)?.length).toBe(1);
    expect(html).not.toMatch(/<blockquote|<q[\s>]/);

    // No transcript UI and no transcript-bearing field or path, in any form.
    expect(html).not.toMatch(/transcri|heardAs|asrNotes|audioKey|input\.txt|\/audio\//i);

    if (shiur.status === "full") {
      expect(html.match(/class="notes-label"/g)?.length).toBe(1);
      expect(html).toContain('id="about"');
      expect(html).not.toContain("notes-pending");
      // the summary the edition shows (its language, else the fallback), not another's
      const notes = shiur.notes!;
      const abstract = pickText(notes.summary.abstract, ed);
      expect(html).toContain(escape(abstract.text));
      for (const lang of ["en", "yi"] as const) {
        if (lang !== abstract.lang && notes.summary.abstract[lang] !== abstract.text) expect(html, lang).not.toContain(escape(notes.summary.abstract[lang]));
      }
      // A fallback text carries its own language: no Hebrew yet except in the planted overlay.
      const one = pickText(notes.summary.oneLiner, ed);
      if (ed === "he") {
        if (id === TRANSLATED) {
          expect(one.lang).toBe("he");
          expect(html).toContain(`<p class="one-liner">${escape(one.text)}</p>`);
        } else {
          expect(one.lang).toBe("yi");
          expect(html).toContain(`<p class="one-liner" lang="yi" dir="rtl">${escape(one.text)}</p>`);
        }
      }
      // the write-up and the apparatus are not on the page
      const firstPara = notes.writeup.yi[0]?.paragraphs[0]?.text;
      if (firstPara) expect(html).not.toContain(escape(firstPara));
      for (const k of notes.summary.keyPoints) expect(html).not.toContain(escape(k.text.yi));
    } else {
      expect(html).toContain(notice("notesPending", ed));
      expect(html).not.toMatch(/class="voice-notes"|id="about"|notes-label/);
    }
    // None of the removed parts, on any page.
    expect(html).not.toMatch(/id="(?:outline|writeup|sources|apparatus|mentioned|catalog)"|class="jump-list"|data-follow-text|data-marks|class="time"/);
    expect(html.match(/<audio\b/g)?.length).toBe(shiur.recordings.filter((r) => r.audioUrl).length);

    // Every in-page link has a target.
    const present = ids(html);
    for (const h of hrefs(html).filter((x) => x.startsWith("#"))) expect(present.has(h.slice(1)), h).toBe(true);

    // Breadcrumb: contents › section › the title (never "no. N").
    const crumbs = /<nav class="breadcrumb"[\s\S]*?<\/nav>/.exec(html)![0];
    const last = /<span aria-current="page"><bdi lang="(\w+)" dir="(rtl|ltr)">([^<]*)<\/bdi><\/span>/.exec(crumbs);
    expect(last?.[3]).toBe(escape(shiur.catalog.titleOriginal));
    // the same lang/dir as the title in the header (its dominant script)
    expect(last?.slice(1, 3)).toEqual(Object.values(runAttrs(shiur.catalog.titleOriginal, shiur.lang, ed)));
    // Each recording plays and downloads the original by default.
    const playable = shiur.recordings.filter((r) => r.audioUrl);
    expect([...html.matchAll(/<audio\b[^>]*\ssrc="([^"]+)"/g)].map((x) => x[1])).toEqual(playable.map((r) => r.audioUrl));
    expect([...html.matchAll(/<a class="download" href="([^"]+)"/g)].map((x) => x[1])).toEqual(playable.map((r) => r.audioUrl));

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

  it("keeps one meta line: no catalog number, no guide page, no section link, one length", async () => {
    const shiur = corpus.shiur("yi-parshas-hashavua-brshys-01");
    expect(shiur.catalog.n).not.toBeNull();
    const html = await renderPage("en", shiur);
    const meta = /<p class="citation">([\s\S]*?)<\/p>/.exec(html)![1]!;
    expect(meta).toContain('<span class="visually-hidden">Details: </span>');
    expect(meta).not.toMatch(/no\.|Pocket Guide|href=/);
    expect(meta).toContain(escape(shiur.parsha!.raw));
    expect(html).not.toMatch(/catalog-notice|Length /);
    const yi = await renderPage("yi", shiur);
    expect(/<p class="citation">[\s\S]*?<\/p>/.exec(yi)![0]).toContain('<span class="visually-hidden">פרטים: </span>');
    const he = await renderPage("he", shiur);
    expect(/<p class="citation">[\s\S]*?<\/p>/.exec(he)![0]).toContain('<span class="visually-hidden">פרטים: </span>');
  });

  it("labels a perek given as a number", async () => {
    const shiur = corpus.shiur("yi-tanya-1-01");
    const html = await renderPage("en", { ...shiur, perek: "ב" });
    expect(html).toMatch(/<span class="cite-item">Perek <bdi lang="yi" dir="rtl">ב<\/bdi><\/span>/);
    const yi = await renderPage("yi", { ...shiur, perek: "הקדמה" });
    expect(yi).toMatch(/<span class="cite-item"><bdi lang="yi" dir="rtl">הקדמה<\/bdi><\/span>/);
  });

  it("plays each recording of a multi-recording shiur", async () => {
    const shiur = corpus.shiur("yi-zmanim-tv-bb-04");
    expect(shiur.recordings.length).toBe(2);
    const html = await renderPage("yi", shiur);
    expect(html.match(/<audio\b/g)?.length).toBe(2);
  });

  it("shows unplayable recordings as unavailable and their times as text", async () => {
    const base = corpus.shiur("yi-zmanim-tv-bb-04");
    const shiur: PublicShiur = {
      ...base,
      recordings: base.recordings.map((r, i) => (i === 1 ? { ...r, audioUrl: null, cleanedUrl: null, playable: false } : r)),
    };
    const html = await renderPage("en", shiur);
    expect(html.match(/<audio\b/g)?.length).toBe(1);
    expect(html).toContain("Part 2: not yet available online.");
    expect(html).not.toContain(`href="${base.recordings[1]!.audioUrl}`);
    expect(html).not.toContain(`href="${base.recordings[1]!.cleanedUrl}`);
  });

  it("plays and downloads the original and offers the AI-improved copy under the player", async () => {
    const shiur = corpus.shiur("yi-zmanim-tv-bb-04");
    const [one, two] = shiur.recordings;
    const html = await renderPage("en", shiur);
    for (const r of [one!, two!]) {
      expect(r.cleanedUrl).toContain("/fixed/sidon/");
      expect(html).toContain(`src="${r.audioUrl}"`);
      expect(html).toContain(`data-original="${r.audioUrl}"`);
      expect(html).toContain(`data-cleaned="${r.cleanedUrl}"`);
      expect(html).toMatch(new RegExp(`<a class="download" href="${escapeRe(r.audioUrl!)}" download>`));
      expect(html).not.toMatch(new RegExp(`class="download" href="${escapeRe(r.cleanedUrl!)}"`));
    }
    // The line, its no-JS link to the improved file, and an empty polite status region.
    expect(html).toContain('<p class="listen-version"');
    expect(html).toMatch(new RegExp(`<a class="listen-version-switch" href="${escapeRe(one!.cleanedUrl!)}" aria-describedby="listen-version-text">Listen to it</a>`));
    expect(html).toContain('<span id="listen-version-text">A version with the sound improved by AI is also available</span>');
    expect(html).toContain('data-action-cleaned="Switch to the original"');
    expect(html).toMatch(/<span class="visually-hidden" role="status"><\/span>/);
    expect(html).not.toContain("original recording only");
    const yi = await renderPage("yi", shiur);
    expect(yi).toContain("הערט זי");
    expect(yi).toContain("קלאנג אויסגעבעסערט דורך AI");
    const he = await renderPage("he", shiur);
    expect(he).toContain("שמעו אותה");
    expect(he).toContain("הקול בה שופר על ידי AI");
  });

  it("marks a part without an improved copy and drops the line when no part has one", async () => {
    const base = corpus.shiur("yi-zmanim-tv-bb-04");
    const partly: PublicShiur = { ...base, recordings: base.recordings.map((r, i) => (i === 1 ? { ...r, cleanedUrl: null } : r)) };
    const html = await renderPage("en", partly);
    expect(html).toContain("Part 2: original recording only");
    expect(html).toContain(`src="${base.recordings[1]!.audioUrl}"`);
    expect(html).toContain('<p class="listen-version"');
    const none: PublicShiur = { ...base, recordings: base.recordings.map((r) => ({ ...r, cleanedUrl: null })) };
    const plain = await renderPage("en", none);
    expect(plain).not.toContain("listen-version");
    expect(plain).not.toContain("original recording only");
    expect(plain).not.toContain("/fixed/sidon/");
  });

  it("adds the listening-app and report links only when configured", async () => {
    const shiur = corpus.shiur("en-parsha-en-nch-01");
    const bare = await renderPage("en", shiur);
    expect(bare).not.toContain("open-live");
    expect(bare).not.toContain("mailto:");
    const html = await renderPage("en", shiur, {
      liveHref: "https://analyze.example.org/en/s/en-parsha-en-nch-01",
      reportHref: "mailto:e@example.org?subject=x",
    });
    expect(html).toContain(`<a href="https://analyze.example.org/en/s/en-parsha-en-nch-01" hreflang="en">${shiurEn["live.open"]}</a>`);
    expect(html).toContain('href="mailto:e@example.org?subject=x"');
  });

  it("has one previous/next line, in the series order on a catalog-only page", async () => {
    const shiur = corpus.shiur("yi-tanya-1-01");
    expect(shiur.status).not.toBe("full");
    const html = await renderPage("en", shiur);
    const nav = /<nav class="prev-next"[\s\S]*?<\/nav>/.exec(html)![0];
    expect(nav).toContain('data-of="series"');
    expect(nav).toContain('href="/en/series/tanya-yi/"');
    const n = corpus.neighbours[shiur.id]!.series!;
    if (n.next) expect(nav).toContain(`href="/en/shiur/${n.next}/" rel="next"`);
    if (n.prev) expect(nav).toContain(`href="/en/shiur/${n.prev}/" rel="prev"`);
    else expect(nav).not.toContain('rel="prev"');
    expect(nav).not.toMatch(/ of \d|no\. /);
  });

  it("follows the section order when the shiur is in no series", async () => {
    const shiur = corpus.shiur("yi-parshas-hashavua-brshys-01");
    expect(shiur.series).toBeNull();
    const html = await renderPage("yi", shiur);
    const nav = /<nav class="prev-next"[\s\S]*?<\/nav>/.exec(html)![0];
    expect(nav).toContain('data-of="section"');
    const n = corpus.neighbours[shiur.id]!.section;
    expect(nav).toContain(`href="/yi/section/${shiur.catalog.sectionId}/"`);
    if (n.next) expect(nav).toContain(`href="/yi/shiur/${n.next}/" rel="next"`);
  });

  it("shows the Hebrew edition its translation, and the Yiddish (marked as Yiddish) where there is none", async () => {
    const translated = corpus.shiur(TRANSLATED);
    const he = await renderPage("he", translated);
    expect(translated.notes!.summary.abstract.he).toBeTruthy();
    expect(he).toContain(`<p class="abstract">${escape(translated.notes!.summary.abstract.he!)}</p>`);

    const other = corpus.shiur("yi-parshas-hashavua-brshys-01");
    expect(other.notes!.summary.abstract.he).toBeUndefined();
    const fallback = await renderPage("he", other);
    expect(fallback).toContain(`<p class="abstract" lang="yi" dir="rtl">${escape(other.notes!.summary.abstract.yi)}</p>`);
    // the Hebrew edition's own UI around it
    expect(fallback).toContain('<html lang="he" dir="rtl">');
    expect(fallback).toContain("על השיעור");
  });
});
