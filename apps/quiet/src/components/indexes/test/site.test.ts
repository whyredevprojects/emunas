/**
 * C2.1 acceptance on the real corpus, end to end:
 *   corpus:build (repo data, into a temp dir) → astro build (EMUNAS_CORPUS_DIR) → checks on dist,
 * for the three corpus-entry indexes this package owns: שמות (`people/`), מראי מקומות
 * (`sources/`) and ערכים (`erachim/`).
 *
 * - page counts equal the layer's Quiet page flags (people, works, concepts; `all/` for passim
 *   people), so no page for an other-type person, a generic work or a concept below five;
 * - a concept merged into a topic has no glossary page and its line links to the topic;
 * - no link to a shiur outside the visible set (needs_review, catalog-only);
 * - every index page carries the AI label once; every entry page carries the label once and one
 *   report link;
 * - links inside these pages resolve (pages of these three indexes, their anchors, shiur
 *   moments); the only external links go to Sefaria;
 * - file count and page weight within budget; nothing from transcripts reaches these pages.
 *
 * Slow-ish (one full corpus build and one site build, about 30 s); it reads the repository's data
 * folder only through the corpus CLI, like CI does.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import type { CorpusIndex, LayerConceptsFile, LayerPeopleFile, LayerWorksFile, PublicShiur } from "@emunas/corpus/public";
import { corpusLabel } from "@emunas/i18n";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { astroBuild } from "../../../../test/astro-build.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, "..", "..", "..", "..");
const repo = join(app, "..", "..");

/**
 * Measured 2026-11-15 on the real corpus: 444 person pages (with `all/`), 384 work pages and 533
 * glossary pages per edition, about 2,750 pages in all. The budget leaves room for growth; the
 * site-wide 18,000-file cap is enforced by the build's budget check.
 */
const PAGE_BUDGET = 5_000;
/** No page heavier than this, gzip (the largest, /en/erachim/, is about 92 KB). */
const PAGE_GZIP_BUDGET = 150 * 1024;

let tmp = "";
let corpus = "";
let dist = "";

const readJson = <T,>(p: string): T => JSON.parse(readFileSync(p, "utf8")) as T;

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "quiet-entries-site-"));
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
const DIRS = ["people", "sources", "erachim"] as const;

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/** Pages of the three indexes as `/{ed}/{dir}/…/` paths → file. */
function entryPages(): Map<string, string> {
  const out = new Map<string, string>();
  for (const ed of EDS) {
    for (const d of DIRS) {
      for (const f of walk(join(dist, ed, d))) {
        if (!f.endsWith("index.html")) continue;
        out.set(`/${relative(dist, dirname(f)).split(sep).join("/")}/`, f);
      }
    }
  }
  return out;
}

/** Ids that have a page under `/{ed}/{dir}/{id}/`. */
function entryDirs(ed: string, dir: string): string[] {
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
const hrefsOf = (html: string): string[] => [...html.matchAll(/\shref="([^"]*)"/g)].map((m) => m[1]!.replace(/&amp;/g, "&"));
const count = (s: string, needle: string): number => s.split(needle).length - 1;

describe("C2.1 names, works and glossary on the real corpus", () => {
  it("builds the three indexes in both editions", () => {
    const pages = entryPages();
    for (const ed of EDS) for (const d of DIRS) expect(pages.has(`/${ed}/${d}/`), `/${ed}/${d}/`).toBe(true);
  });

  it("page counts equal the layer's Quiet page flags", () => {
    const people = readJson<LayerPeopleFile>(join(corpus, "layer", "people.json")).people;
    const works = readJson<LayerWorksFile>(join(corpus, "layer", "works.json")).works;
    const concepts = readJson<LayerConceptsFile>(join(corpus, "layer", "concepts.json")).concepts;
    const want = {
      people: people.filter((p) => p.pages.quiet).map((p) => p.id).sort(),
      sources: works.filter((w) => w.pages.quiet).map((w) => w.id).sort(),
      erachim: concepts.filter((c) => c.pages.quiet).map((c) => c.id).sort(),
    };
    expect(want.people.length).toBeGreaterThan(100);
    expect(want.sources.length).toBeGreaterThan(100);
    expect(want.erachim.length).toBeGreaterThan(100);
    for (const ed of EDS) {
      expect(entryDirs(ed, "people")).toEqual(want.people);
      expect(entryDirs(ed, "sources")).toEqual(want.sources);
      expect(entryDirs(ed, "erachim")).toEqual(want.erachim);
      const all = people.filter((p) => p.quietAllList).map((p) => p.id).sort();
      expect(all.length).toBeGreaterThan(0);
      expect(want.people.filter((id) => existsSync(join(dist, ed, "people", id, "all", "index.html")))).toEqual(all);
    }
    // never a page for an other-type person, a generic work, a concept below five or merged into a topic
    for (const p of people.filter((x) => x.group === "other")) expect(want.people.includes(p.id), p.id).toBe(false);
    for (const w of works.filter((x) => x.generic)) expect(want.sources.includes(w.id), w.id).toBe(false);
    for (const c of concepts.filter((x) => x.count < 5 || x.mergedIntoTopic !== null)) expect(want.erachim.includes(c.id), c.id).toBe(false);
    // family hubs (genre works with children) do have pages
    expect(want.sources).toEqual(expect.arrayContaining(["rashi", "ramban", "tosafos", "chasam-sofer"]));
  });

  it("a concept merged into a topic links to the topic from its glossary line", () => {
    const concepts = readJson<LayerConceptsFile>(join(corpus, "layer", "concepts.json")).concepts;
    const merged = concepts.filter((c) => c.mergedIntoTopic !== null);
    expect(merged.length).toBeGreaterThan(0);
    for (const ed of EDS) {
      const html = readFileSync(join(dist, ed, "erachim", "index.html"), "utf8");
      for (const c of merged) {
        const at = html.indexOf(`<li id="${c.id}"`);
        expect(at, c.id).toBeGreaterThan(0);
        const li = html.slice(at, html.indexOf("</li>", at));
        const hrefs = hrefsOf(li);
        expect(hrefs.length, c.id).toBeGreaterThan(0);
        for (const h of hrefs) expect(h.startsWith(`/${ed}/inyanim/`), `${c.id} → ${h}`).toBe(true);
        expect(hrefs.some((h) => h.includes(c.mergedIntoTopic!)), c.id).toBe(true);
      }
    }
  });

  it("every link resolves, and no link goes to a shiur outside the visible set", () => {
    const pages = entryPages();
    const index = readJson<CorpusIndex>(join(corpus, "index.json"));
    const rows = new Map(index.shiurim.map((r) => [r.id, r]));
    const visible = new Set(readdirSync(join(corpus, "layer", "shiur")).map((f) => f.replace(/\.json$/, "")));
    expect(index.shiurim.some((r) => r.status !== "full")).toBe(true);
    const chapters = new Map<string, Set<number>>();
    const chaptersOf = (id: string): Set<number> => {
      let s = chapters.get(id);
      if (!s) {
        const shiur = readJson<PublicShiur>(join(corpus, "shiurim", `${id}.json`));
        chapters.set(id, (s = new Set((shiur.notes?.chapters ?? []).map((c) => c.idx))));
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
        if (href.startsWith("https://www.sefaria.org/")) continue;
        if (href.startsWith("mailto:")) continue; // the report link
        if (href.startsWith("#")) {
          if (!idsOfPage(path).has(decodeURIComponent(href.slice(1)))) bad("no such anchor");
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
          const id = decodeURIComponent(shiur[2]!);
          const row = rows.get(id);
          if (!row) {
            bad("unknown shiur");
            continue;
          }
          if (!visible.has(id) || row.status !== "full") bad(`shiur not in the visible set (${row.status})`);
          if (frag === undefined) continue;
          const t = /^t=(\d+)$/.exec(frag);
          const s = /^s(\d+)$/.exec(frag);
          if (t) {
            if (Number(t[1]) > Math.ceil(row.duration)) bad(`time beyond the shiur (${row.duration}s)`);
          } else if (s) {
            if (!chaptersOf(id).has(Number(s[1]))) bad("no such section");
          } else bad("unknown fragment");
          continue;
        }
        // Topic and story entries belong to other indexes (C2.2, C2.3): well-formed addresses only.
        if (/^\/(yi|en)\/(inyanim|stories)\/(?:[a-z0-9-]+\/)?$/.test(p)) continue;
        if (/^\/(yi|en)\/(about|)\/?$/.test(p)) continue; // edition home (#indexes) and About
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

  it("carries the AI label once on every page and one report link on every entry page", () => {
    for (const [path, file] of entryPages()) {
      const ed = path.split("/")[1] as "yi" | "en";
      const html = readFileSync(file, "utf8");
      const main = mainOf(html);
      const isIndex = /^\/(yi|en)\/[a-z]+\/$/.test(path);
      expect(count(main, 'class="corpus-label'), `${path} label`).toBe(1 + (isIndex ? 0 : 1)); // entry: the footer wraps the label
      expect(count(main, '<p class="corpus-label'), `${path} label text`).toBe(1);
      expect(count(main, 'class="report-entry"'), `${path} report`).toBe(isIndex ? 0 : 1);
      if (!isIndex) {
        const label = main.includes(corpusLabel("label.entry", ed)) || main.includes(corpusLabel("label.entry.reviewed", ed));
        expect(label, `${path} entry label`).toBe(true);
        expect(/href="mailto:[^"]*subject=/.test(main), `${path} mailto`).toBe(true);
      }
      expect((main.match(/<h1\b/g) ?? []).length, `${path} h1`).toBe(1);
      expect(html).toContain(`<html lang="${ed}" dir="${ed === "yi" ? "rtl" : "ltr"}"`);
    }
  });

  it("stays within the file-count and page-weight budget", () => {
    const pages = entryPages();
    expect(pages.size).toBeLessThanOrEqual(PAGE_BUDGET);
    let heaviest = ["", 0] as [string, number];
    for (const [path, file] of pages) {
      const gz = gzipSync(readFileSync(file)).length;
      if (gz > heaviest[1]) heaviest = [path, gz];
    }
    expect(heaviest[1], heaviest[0]).toBeLessThanOrEqual(PAGE_GZIP_BUDGET);
  });

  it("ships nothing from transcripts", () => {
    const forbidden = ["heardAs", "asrNotes", "asrVariants", "transcriptKey", "audioKey", "transcripts/", '"segs"', "startSeg", '"retelling"'];
    for (const [path, file] of entryPages()) {
      const html = readFileSync(file, "utf8");
      for (const f of forbidden) expect(html.includes(f), `${path} contains ${f}`).toBe(false);
    }
  });
});
