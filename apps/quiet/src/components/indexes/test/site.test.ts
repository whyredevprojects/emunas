/**
 * W3.4 acceptance on the real corpus, end to end:
 *   corpus:build (repo data, into a temp dir) → astro build (EMUNAS_CORPUS_DIR) → checks on dist.
 *
 * - the entity page set equals the threshold rule (works and people ≥2 shiurim, concepts ≥3 and
 *   listed, never a generic work), recomputed here from the aggregate files;
 * - link crawler: every link inside <main> of every index page resolves: index and entity pages
 *   exist, in-page and cross-page anchors exist, shiur links name a shiur of the corpus with a time
 *   inside it or a section it has, and the only external links are Sefaria links next to a
 *   reference some mention resolved;
 * - every entry line carries a link; coverage line and "partial and unreviewed" notice on every page;
 * - file count and page weight within budget;
 * - nothing from transcripts or the story retellings reaches these pages.
 *
 * Slow-ish (two builds, about 15 s); it reads the repository's data folder only through the
 * corpus CLI, like CI does.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import type { ConceptsFile, PeopleFile, StoriesFile, WorksFile } from "@emunas/corpus/aggregate";
import { ENTITY_THRESHOLDS, type CorpusIndex, type PublicShiur } from "@emunas/corpus/public";
import { coverageNotice } from "@emunas/i18n";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { astroBuild } from "../../../../test/astro-build.ts";
import { indexesEn, indexesYi } from "../strings.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, "..", "..", "..", "..");
const repo = join(app, "..", "..");

/**
 * tech-quiet §3.5 estimated ~4,000 index pages at full corpus inside an 18,000-file site. Measured
 * 4,144 at 993 of 997 shiurim full (2026-11-15: 360 sources, 617 people, 1,094 inyanim, 1 stories per
 * edition; 7,772 files in the whole site), so the budget is 5,000 (~20% headroom). The site-wide
 * 18,000-file cap is enforced by the build's budget check.
 */
const INDEX_PAGE_BUDGET = 5_000;
/** No index page heavier than this, gzip (the largest, /yi/stories/, is about 90 KB at 993 of 997 full). */
const PAGE_GZIP_BUDGET = 120 * 1024;

let tmp = "";
let corpus = "";
let dist = "";

const readJson = <T,>(p: string): T => JSON.parse(readFileSync(p, "utf8")) as T;

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "quiet-indexes-"));
  corpus = join(tmp, "corpus");
  dist = join(tmp, "dist");
  const tsx = join(repo, "node_modules", ".bin", "tsx");
  const c = spawnSync(tsx, [join(repo, "packages", "corpus", "src", "cli.ts"), "--out", corpus], {
    cwd: repo,
    env: { ...process.env, INIT_CWD: repo },
    encoding: "utf8",
  });
  if (c.status !== 0) throw new Error(`corpus:build failed:\n${c.stdout}\n${c.stderr}`);
  const b = astroBuild(app, dist, { EMUNAS_CORPUS_DIR: corpus });
  if (b.status !== 0) throw new Error(`astro build failed:\n${b.stdout.slice(-4000)}\n${b.stderr.slice(-4000)}`);
}, 300_000);

afterAll(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

const EDS = ["yi", "en"] as const;
// The stories index and story pages are on the corpus layer now (C2.3; tested in
// components/stories/test/site.build.test.ts), so they are not crawled here.
const DIRS = ["sources", "people", "inyanim"] as const;

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/** Index pages as `/{ed}/{dir}/…/` paths → file. */
function indexPages(): Map<string, string> {
  const out = new Map<string, string>();
  for (const ed of EDS) {
    for (const d of DIRS) {
      for (const f of walk(join(dist, ed, d))) {
        if (!f.endsWith("index.html")) continue;
        const rel = relative(dist, dirname(f)).split(sep).join("/");
        out.set(`/${rel}/`, f);
      }
    }
  }
  return out;
}

/** Entity keys that have a page under `/{ed}/{dir}/{key}/`. */
function entityDirs(ed: string, dir: string): string[] {
  const root = join(dist, ed, dir);
  return readdirSync(root).filter((n) => statSync(join(root, n)).isDirectory()).sort();
}

const mainOf = (html: string): string => {
  const a = html.indexOf("<main");
  const b = html.indexOf("</main>");
  if (a < 0 || b < a) throw new Error("no <main>");
  return html.slice(a, b);
};
const idsOf = (html: string): Set<string> => new Set([...html.matchAll(/\sid="([^"]*)"/g)].map((m) => m[1]!));
const VOID = new Set(["br", "hr", "img", "input", "meta", "link", "source", "wbr"]);

/** Items directly under each `<ul class="entries">`, and whether each holds an `<a href>`. */
function entryItems(html: string): { hasLink: boolean }[] {
  const out: { hasLink: boolean }[] = [];
  const stack: { tag: string; entries: boolean; item: { hasLink: boolean } | null }[] = [];
  for (const m of html.matchAll(/<(\/?)([a-z][a-z0-9]*)\b([^>]*)>/g)) {
    const [, close, tag, attrs] = m as unknown as [string, string, string, string];
    if (VOID.has(tag)) continue;
    if (close) {
      while (stack.length > 0 && stack.pop()!.tag !== tag);
      continue;
    }
    const parent = stack[stack.length - 1];
    const inItem = [...stack].reverse().find((e) => e.item !== null)?.item ?? null;
    let item: { hasLink: boolean } | null = null;
    if (tag === "li" && parent?.entries) {
      item = { hasLink: false };
      out.push(item);
    }
    if (tag === "a" && /\shref="/.test(attrs) && inItem) inItem.hasLink = true;
    stack.push({ tag, entries: tag === "ul" && /class="entries"/.test(attrs), item });
  }
  return out;
}

const hrefsOf = (html: string): string[] => [...html.matchAll(/\shref="([^"]*)"/g)].map((m) => m[1]!.replace(/&amp;/g, "&"));

describe("W3.4 on the real corpus", () => {
  it("builds the four indexes in both editions", () => {
    const pages = indexPages();
    for (const ed of EDS) for (const d of DIRS) expect(pages.has(`/${ed}/${d}/`), `/${ed}/${d}/`).toBe(true);
  });

  it("entity page set equals the threshold rule", () => {
    const works = readJson<WorksFile>(join(corpus, "works.json")).works;
    const people = readJson<PeopleFile>(join(corpus, "people.json")).people;
    const concepts = readJson<ConceptsFile>(join(corpus, "concepts.json")).concepts;
    const q = ENTITY_THRESHOLDS.quiet;
    const want = {
      sources: works.filter((w) => !w.genre && w.shiurCount >= q.work).map((w) => w.key).sort(),
      people: people.filter((p) => p.shiurCount >= q.person).map((p) => p.key).sort(),
      inyanim: concepts.filter((c) => c.shiurCount >= q.concept).map((c) => c.key).sort(),
    };
    expect(want.sources.length).toBeGreaterThan(100);
    expect(want.people.length).toBeGreaterThan(100);
    expect(want.inyanim.length).toBeGreaterThan(100);
    for (const ed of EDS) {
      expect(entityDirs(ed, "sources")).toEqual(want.sources);
      expect(entityDirs(ed, "people")).toEqual(want.people);
      expect(entityDirs(ed, "inyanim")).toEqual(want.inyanim);
    }
    // keys are URL-safe as they are, so ids, paths and @emunas/links anchors agree
    for (const k of [...want.sources, ...want.people, ...want.inyanim]) expect(k).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it("every link in every index page resolves (link crawler)", () => {
    const pages = indexPages();
    const index = readJson<CorpusIndex>(join(corpus, "index.json"));
    const rows = new Map(index.shiurim.map((r) => [r.id, r]));
    const chapters = new Map<string, Set<number>>();
    const chaptersOf = (id: string): Set<number> => {
      let s = chapters.get(id);
      if (!s) {
        const shiur = readJson<PublicShiur>(join(corpus, "shiurim", `${id}.json`));
        s = new Set((shiur.notes?.chapters ?? []).map((c) => c.idx));
        chapters.set(id, s);
      }
      return s;
    };
    const idCache = new Map<string, Set<string>>();
    const idsOfPage = (path: string): Set<string> => {
      let s = idCache.get(path);
      if (!s) idCache.set(path, (s = idsOf(readFileSync(pages.get(path)!, "utf8"))));
      return s;
    };

    const broken: string[] = [];
    let checked = 0;
    let shiurLinks = 0;
    for (const [path, file] of pages) {
      const main = mainOf(readFileSync(file, "utf8"));
      for (const href of hrefsOf(main)) {
        checked++;
        const bad = (why: string) => broken.push(`${path} → ${href}: ${why}`);
        if (href.startsWith("https://www.sefaria.org/")) continue; // checked below
        if (href.startsWith("#")) {
          if (!idsOfPage(path).has(href.slice(1))) bad("no such anchor");
          continue;
        }
        if (/^[a-z]+:/i.test(href)) {
          bad("unexpected external link");
          continue;
        }
        const [p, frag] = href.split("#") as [string, string | undefined];
        const shiur = /^\/(yi|en)\/shiur\/([^/]+)\/$/.exec(p);
        if (shiur) {
          shiurLinks++;
          if (shiur[1] !== path.split("/")[1]) bad("crosses editions");
          const row = rows.get(decodeURIComponent(shiur[2]!));
          if (!row) {
            bad("unknown shiur");
            continue;
          }
          if (frag === undefined) continue;
          const t = /^t=(\d+)$/.exec(frag);
          const s = /^s(\d+)$/.exec(frag);
          if (t) {
            if (Number(t[1]) > Math.ceil(row.duration)) bad(`time beyond the shiur (${row.duration}s)`);
          } else if (s) {
            if (!chaptersOf(row.id).has(Number(s[1]))) bad("no such section");
          } else bad("unknown fragment");
          continue;
        }
        if (/^\/(yi|en)\/about\/$/.test(p)) continue; // the notes label links to About (W4.x page)
        if (!pages.has(p)) {
          bad("no such page");
          continue;
        }
        if (frag !== undefined && !idsOfPage(p).has(decodeURIComponent(frag))) bad("no such anchor");
      }
    }
    expect(broken.slice(0, 20)).toEqual([]);
    expect(checked).toBeGreaterThan(20_000);
    expect(shiurLinks).toBeGreaterThan(10_000);
  });

  it("links to Sefaria only next to a reference some mention resolved", () => {
    const works = readJson<WorksFile>(join(corpus, "works.json")).works;
    const resolved = new Set<string>();
    const any = new Set<string>();
    for (const w of works) {
      for (const r of w.refs) {
        const url = `https://www.sefaria.org/${encodeURIComponent(r.ref.trim())}`;
        any.add(`${w.key} ${url}`);
        if (r.mentions.some((m) => m.resolution === "resolved")) resolved.add(`${w.key} ${url}`);
      }
    }
    for (const ed of EDS) {
      const seen = new Set<string>();
      for (const key of entityDirs(ed, "sources")) {
        const main = mainOf(readFileSync(join(dist, ed, "sources", key, "index.html"), "utf8"));
        for (const href of hrefsOf(main).filter((h) => h.startsWith("https://"))) {
          expect(href.startsWith("https://www.sefaria.org/"), href).toBe(true);
          seen.add(`${key} ${href}`);
        }
        expect(/rel="noopener external"/.test(main) || !main.includes("sefaria.org"), key).toBe(true);
      }
      for (const s of seen) expect(resolved.has(s), s).toBe(true);
      const expected = [...resolved].filter((s) => entityDirs(ed, "sources").includes(s.split(" ")[0]!));
      expect([...seen].sort()).toEqual(expected.sort());
      expect(seen.size).toBeLessThan(any.size);
    }
    // the index pages themselves link out nowhere
    for (const ed of EDS) {
      for (const d of DIRS) {
        const main = mainOf(readFileSync(join(dist, ed, d, "index.html"), "utf8"));
        expect(hrefsOf(main).filter((h) => /^https?:/.test(h)), `${ed}/${d}`).toEqual([]);
      }
    }
  });

  it("every entry line links somewhere, and every page carries the coverage line and the notice", () => {
    const build = readJson<{ counts: { full: number; total: number } }>(join(corpus, "build.json"));
    for (const [path, file] of indexPages()) {
      const ed = path.split("/")[1] as "yi" | "en";
      const html = readFileSync(file, "utf8");
      const main = mainOf(html);
      expect(main.includes(coverageNotice(build.counts.full, build.counts.total, ed)), `${path} coverage`).toBe(true);
      expect(main.includes(String((ed === "en" ? indexesEn : indexesYi)["index.partial"])), `${path} notice`).toBe(true);
      expect(html).toContain(`<html lang="${ed}" dir="${ed === "yi" ? "rtl" : "ltr"}"`);
      expect((main.match(/<h1\b/g) ?? []).length, `${path} h1`).toBe(1);
      // each item directly under a <ul class="entries"> must contain a link
      for (const [i, item] of entryItems(main).entries()) {
        expect(item.hasLink, `${path}: entry ${i} without a link`).toBe(true);
      }
      // and every page lists something: entries, or (on a work page) citations
      expect(entryItems(main).length + (main.match(/<a class="cite"/g) ?? []).length, `${path}: empty`).toBeGreaterThan(0);
    }
  });

  it("stays within the file-count and page-weight budget", () => {
    const pages = indexPages();
    expect(pages.size).toBeLessThanOrEqual(INDEX_PAGE_BUDGET);
    let heaviest = ["", 0] as [string, number];
    for (const [path, file] of pages) {
      const gz = gzipSync(readFileSync(file)).length;
      if (gz > heaviest[1]) heaviest = [path, gz];
    }
    expect(heaviest[1], heaviest[0]).toBeLessThanOrEqual(PAGE_GZIP_BUDGET);
  });

  it("ships nothing from transcripts and no story retellings", () => {
    const pages = indexPages();
    // Field names and paths (the full list, ASR input files included, is the corpus-guard post-pass in CI).
    const forbidden = ["heardAs", "asrNotes", "transcriptKey", "audioKey", "transcripts/", '"segs"', "startSeg", '"retelling"'];
    const retellings: string[] = [];
    const stories = readJson<StoriesFile>(join(corpus, "stories.json"));
    for (const id of new Set(stories.stories.map((s) => s.shiurId))) {
      const shiur = readJson<PublicShiur>(join(corpus, "shiurim", `${id}.json`));
      for (const s of shiur.notes?.stories ?? []) {
        for (const text of [s.retelling.en, s.retelling.yi]) if (text.length >= 40) retellings.push(text.slice(0, 40));
      }
    }
    expect(retellings.length).toBeGreaterThan(500);
    const storyPages = [...pages].filter(([p]) => /\/people\//.test(p));
    for (const [path, file] of pages) {
      const html = readFileSync(file, "utf8");
      for (const f of forbidden) expect(html.includes(f), `${path} contains ${f}`).toBe(false);
    }
    const all = storyPages.map(([, f]) => readFileSync(f, "utf8")).join("\n");
    const leaked = retellings.filter((r) => all.includes(r));
    expect(leaked).toEqual([]);
  });
});
