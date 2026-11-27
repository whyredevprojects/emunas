/**
 * Live budgets (tech-live §3.3, integration-plan §4 step 6):
 *
 * - at most 18,000 files in the deployed client (`build/client`: data + prerendered HTML + assets);
 *   before the app build, the data tree plus a projected prerender count must fit;
 * - at most 25 MiB for any file;
 * - per-file size targets (brotli) for the data files, and at most 1,000 work files;
 * - the corpus layer's files (corpus-wave-plan §4, C1.7): topic tree ≤ 8 KiB, topic file and topic
 *   moment page ≤ 24 KiB, thread and story file ≤ 6 KiB, stories index ≤ 120 KiB, glossary shard
 *   ≤ 8 KiB, each Today file (`today.<lang>.json`, one per reading language) ≤ 30 KiB (all
 *   brotli). The median growth of a shiur file (≤ 2 KiB) is checked by `real-data.test.ts`, since it
 *   needs the file without its additions.
 *
 * Sizes are measured with brotli at quality 5, close to on-the-fly edge compression and below what
 * a precompressing deploy would get, so the targets are checked conservatively.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { brotliCompressSync, constants } from "node:zlib";
import { UI_LANGS } from "@emunas/i18n";
import { readSeoCorpus } from "../app/seo/corpus.server.ts";
import { MAX_FILES, MAX_FILE_BYTES, checkBudgets, walkFiles } from "@emunas/corpus-guard/budgets";
import type { DataKind } from "../app/data/types.ts";
import { kindOfFile } from "./schemas.ts";
import { isTranscriptDataFile } from "../app/features/transcript/emit.server.ts";

const KB = 1024;

/** Brotli size targets per file kind (bytes), tech-live §3.3. Kinds without a target are "small"/lazy. */
export const BR_TARGETS: Partial<Record<DataKind, number>> = {
  corpus: 150 * KB,
  // tech-live §3.3 says 60 KiB. facets.json labels every work, person and browse concept in the
  // corpus, so it grows with the number of summarized shiurim: about 73 KiB br (74,854 B) at 993 of
  // 997 full on 2026-11-15, concepts alone about 37 KiB. 90 KiB leaves ~20% headroom.
  facets: 90 * KB,
  // Per file: one Today file per reading language, each holding only its reader's texts.
  today: 30 * KB,
  shiur: 40 * KB,
  // A write-up is sized from its shiur's length (scripts/lib/budget.ts: 800-1,000 words per hour), so
  // its file grows with the longest shiur. 8 KiB held while the longest was 1.9 h; the Purim seudos
  // (up to 4.2 h, in scope since 2026-11-18) reach 11,162 B br (yi-purim-seudos-5769.yi). The file is
  // loaded on demand. 13 KiB leaves ~19% headroom.
  writeup: 13 * KB,
  // tech-live §3.3 says 600 KiB. The quick index (titles, one-liners, section titles, entity names)
  // grows by about 340 B br per summarized shiur: he 615,685 B br at 1045 of 1050 full on 2026-11-27
  // (main at 1030: 596.3 KiB), yi 608,738, en 591,349. Loaded on command-bar focus, not on first load.
  // 720 KiB leaves ~20% headroom.
  quickIndex: 720 * KB,
  build: 4 * KB,
  // Corpus layer (plan §4).
  topics: 8 * KB,
  topic: 24 * KB,
  topicMoments: 24 * KB,
  topicShiurim: 24 * KB,
  thread: 6 * KB,
  story: 6 * KB,
  // tech-live §3.3 says 120 KiB. stories.json lists every story that has a visible telling, so it
  // grows with the corpus: 122,581 B br (99.8%) at 1045 full on 2026-11-27, 118.3 KiB at 1030.
  // 144 KiB leaves ~20% headroom.
  storiesIndex: 144 * KB,
  glossary: 8 * KB,
};

/**
 * Targets that are reported as warnings up to a hard limit instead of failing. corpus.json: the
 * W2.4 contract puts both one-liners (en + yi) of every shiur in it, which alone is about 90 KiB br at
 * 518 summarized shiurim and about 170 KiB br at 997, so tech-live's 150 KiB target cannot hold with
 * this contract. It is reported on every build; the build fails above the hard limit.
 */
export const SOFT_TARGETS: Partial<Record<DataKind, { hardLimit: number }>> = {
  corpus: { hardLimit: 400 * KB },
};

export const MAX_WORK_FILES = 1000;
export const BROTLI_QUALITY = 5;

export function brotliSize(buf: Buffer | string): number {
  return brotliCompressSync(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY } }).length;
}

export type LiveBudgetFinding =
  | { kind: "file-count"; root: string; files: number; limit: number; projected?: true }
  | { kind: "file-size"; root: string; file: string; bytes: number; limit: number }
  | { kind: "br-size"; file: string; fileKind: DataKind; brBytes: number; limit: number; hard?: true }
  | { kind: "work-files"; files: number; limit: number }
  | { kind: "unknown-file"; file: string };

export interface KindStats {
  files: number;
  bytes: number;
  brBytes: number;
  maxBr: { file: string; brBytes: number } | null;
}

export interface LiveBudgetResult {
  dataFiles: number;
  dataBytes: number;
  byKind: Partial<Record<DataKind, KindStats>>;
  /** Files under build/client when it was checked, else null. */
  clientFiles: number | null;
  /** Data files + projected prerendered pages (+ other public files), when build/client was not checked. */
  projectedFiles: number | null;
  findings: LiveBudgetFinding[];
  /** Over a soft target (`SOFT_TARGETS`) but within its hard limit: reported, not failing. */
  warnings: LiveBudgetFinding[];
}

export interface LiveBudgetOptions {
  /** The emitted data tree (`public/data`). */
  dataDir: string;
  /** Other static files that ship with the client (`public/`, without `data/`); counted in the projection. */
  publicDir?: string | null;
  /** The built client (`build/client`); when it exists it is the authority for the file count. */
  clientDir?: string | null;
  /**
   * Which entity routes are prerendered (`prerenderSetsFromCorpus` over `.corpus/`). Without it every
   * work, person and concept file is counted as a page (an upper bound).
   */
  prerender?: PrerenderSets | null;
  maxFiles?: number;
  maxFileBytes?: number;
}

/**
 * Files the app build adds besides the prerendered pages and `public/`: hashed JS/CSS chunks under
 * `assets/`, the SPA fallback `index.html`, `robots.txt` and `__spa-fallback.html`
 * (87 on 2026-11-15; rounded up for growth).
 */
export const APP_BUILD_FILES = 120;

/**
 * Keys whose entity routes the build prerenders (W4.5 `prerenderPaths`): the Live page flags of
 * `.corpus/layer/` (C1.7) and the occasions with enough shiurim.
 */
export interface PrerenderSets {
  /** Works with a Live page (≥3 shiurim, not a genre label). */
  works: ReadonlySet<string>;
  people: ReadonlySet<string>;
  concepts: ReadonlySet<string>;
  /** Occasions with at least `OCCASION_PRERENDER_MIN` (2) shiurim. */
  occasions: ReadonlySet<string>;
  /** Corpus layer: every topic, threads of ≥3 shiurim, stories told at least twice. */
  topics?: ReadonlySet<string>;
  threads?: ReadonlySet<string>;
  stories?: ReadonlySet<string>;
}

/** W4.5 `OCCASION_PRERENDER_MIN` (app/seo/model.ts). */
const OCCASION_PRERENDER_MIN = 2;

/**
 * The prerender sets of `<corpusDir>`, read as the prerender list reads them (`readSeoCorpus`):
 * occasions from the catalog aggregates, entity routes from the corpus layer's Live page flags. Null
 * without a corpus.
 */
export function prerenderSetsFromCorpus(corpusDir: string | null | undefined): PrerenderSets | null {
  if (!corpusDir || !existsSync(join(corpusDir, "occasions.json"))) return null;
  const c = readSeoCorpus(corpusDir);
  const live = (xs: readonly { key: string; prerender: boolean }[]) => new Set(xs.filter((x) => x.prerender).map((x) => x.key));
  return {
    works: live(c.works),
    people: live(c.people),
    concepts: live(c.concepts),
    occasions: new Set(c.occasions.filter((o) => o.count >= OCCASION_PRERENDER_MIN).map((o) => o.key)),
    topics: live(c.topics),
    threads: live(c.threads),
    stories: live(c.stories),
  };
}

/**
 * Pages `react-router build` prerenders over this data tree, by the rules of W4.5's
 * `prerenderPaths` (app/seo/model.ts): per UI language, Today, every shiur, series and occasion
 * (≥2 shiurim) with a data file, and the works, people, concepts, topics, threads and stories with a
 * Live page that have one (topic moment pages are data, not routes). One HTML file per page.
 * Without `sets`, every work, entity, topic, thread and story file counts (an upper bound).
 */
export function projectedPrerender(dataFiles: Iterable<string>, sets: PrerenderSets | null = null): number {
  let perUi = 1; // Today
  for (const file of dataFiles) {
    const m = /^(shiur|series|work|entity\/[pco]|topic|thread|story)\/([^/]+)\.json$/u.exec(file);
    if (!m) continue;
    const key = m[2] ?? "";
    switch (m[1]) {
      case "shiur":
      case "series":
        perUi++;
        break;
      case "work":
        if (!sets || sets.works.has(key)) perUi++;
        break;
      case "entity/p":
        if (!sets || sets.people.has(key)) perUi++;
        break;
      case "entity/c":
        if (!sets || sets.concepts.has(key)) perUi++;
        break;
      case "entity/o":
        if (!sets || sets.occasions.has(key)) perUi++;
        break;
      case "topic":
        // `topic/<id>.moments-<n>.json` pages are data, not routes.
        if (/\.moments-\d+$/u.test(key)) break;
        if (!sets?.topics || sets.topics.has(key)) perUi++;
        break;
      case "thread":
        if (!sets?.threads || sets.threads.has(key)) perUi++;
        break;
      case "story":
        if (!sets?.stories || sets.stories.has(key)) perUi++;
        break;
    }
  }
  return UI_LANGS.length * perUi;
}

export function checkLiveBudgets(opts: LiveBudgetOptions): LiveBudgetResult {
  const maxFiles = opts.maxFiles ?? MAX_FILES;
  const maxFileBytes = opts.maxFileBytes ?? MAX_FILE_BYTES;
  const findings: LiveBudgetFinding[] = [];
  const warnings: LiveBudgetFinding[] = [];
  const byKind: Partial<Record<DataKind, KindStats>> = {};
  let dataFiles = 0;
  let dataBytes = 0;
  const names: string[] = [];
  for (const path of walkFiles(opts.dataDir)) {
    const file = relative(opts.dataDir, path).split(sep).join("/");
    dataFiles++;
    names.push(file);
    const buf = readFileSync(path);
    dataBytes += buf.length;
    if (buf.length > maxFileBytes)
      findings.push({ kind: "file-size", root: opts.dataDir, file, bytes: buf.length, limit: maxFileBytes });
    const kind = kindOfFile(file);
    if (kind === null) {
      // W5.2: approved public transcript files (flag on only) count toward files and size, no br target.
      if (isTranscriptDataFile(file)) continue;
      findings.push({ kind: "unknown-file", file });
      continue;
    }
    const br = brotliSize(buf);
    const st = (byKind[kind] ??= { files: 0, bytes: 0, brBytes: 0, maxBr: null });
    st.files++;
    st.bytes += buf.length;
    st.brBytes += br;
    if (!st.maxBr || br > st.maxBr.brBytes) st.maxBr = { file, brBytes: br };
    const limit = BR_TARGETS[kind];
    const soft = SOFT_TARGETS[kind];
    if (soft && br > soft.hardLimit) {
      findings.push({ kind: "br-size", file, fileKind: kind, brBytes: br, limit: soft.hardLimit, hard: true });
    } else if (limit !== undefined && br > limit) {
      (soft ? warnings : findings).push({ kind: "br-size", file, fileKind: kind, brBytes: br, limit });
    }
  }
  const works = byKind.work?.files ?? 0;
  if (works > MAX_WORK_FILES) findings.push({ kind: "work-files", files: works, limit: MAX_WORK_FILES });

  let clientFiles: number | null = null;
  let projectedFiles: number | null = null;
  if (opts.clientDir && existsSync(opts.clientDir) && statSync(opts.clientDir).isDirectory()) {
    const r = checkBudgets(opts.clientDir, { maxFiles, maxFileBytes });
    clientFiles = r.files;
    for (const f of r.findings) findings.push(f);
  } else {
    let otherPublic = 0;
    if (opts.publicDir && existsSync(opts.publicDir)) {
      for (const p of walkFiles(opts.publicDir)) {
        const rel = relative(opts.publicDir, p).split(sep);
        if (rel[0] !== "data") otherPublic++;
      }
    }
    projectedFiles = dataFiles + otherPublic + projectedPrerender(names, opts.prerender ?? null) + APP_BUILD_FILES;
    if (projectedFiles > maxFiles) {
      findings.push({
        kind: "file-count",
        root: opts.dataDir,
        files: projectedFiles,
        limit: maxFiles,
        projected: true,
      });
    }
  }
  return { dataFiles, dataBytes, byKind, clientFiles, projectedFiles, findings, warnings };
}

/** One line per finding (paths, kinds and numbers only). */
export function describeFinding(f: LiveBudgetFinding): string {
  switch (f.kind) {
    case "file-count":
      return `${f.projected ? "projected " : ""}file count ${f.files} > ${f.limit} (${f.root})`;
    case "file-size":
      return `${f.file}: ${f.bytes} bytes > ${f.limit}`;
    case "br-size":
      return `${f.file}: ${f.brBytes} bytes br > ${f.limit} (${f.fileKind} ${f.hard ? "hard limit" : "target"})`;
    case "work-files":
      return `work files ${f.files} > ${f.limit}`;
    case "unknown-file":
      return `${f.file}: not a data contract path`;
  }
}
