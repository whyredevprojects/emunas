/**
 * Live budgets (tech-live §3.3, integration-plan §4 step 6):
 *
 * - at most 18,000 files in the deployed client (`build/client`: data + prerendered HTML + assets);
 *   before the app build, the data tree plus a projected prerender count must fit;
 * - at most 25 MiB for any file;
 * - per-file size targets (brotli) for the data files, and at most 1,000 work files.
 *
 * Sizes are measured with brotli at quality 5, close to on-the-fly edge compression and below what
 * a precompressing deploy would get, so the targets are checked conservatively.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { brotliCompressSync, constants } from "node:zlib";
import type { EntitiesFile } from "@emunas/corpus/aggregate";
import { MAX_FILES, MAX_FILE_BYTES, checkBudgets, walkFiles } from "@emunas/corpus-guard/budgets";
import type { DataKind } from "../app/data/types.ts";
import { kindOfFile } from "./schemas.ts";

const KB = 1024;

/** Brotli size targets per file kind (bytes), tech-live §3.3. Kinds without a target are "small"/lazy. */
export const BR_TARGETS: Partial<Record<DataKind, number>> = {
  corpus: 150 * KB,
  facets: 60 * KB,
  today: 30 * KB,
  shiur: 40 * KB,
  writeup: 8 * KB,
  stories: 120 * KB,
  quickIndex: 600 * KB,
  build: 4 * KB,
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
 * `assets/`, the SPA fallback `index.html`, `robots.txt`, `sw.js` and `__spa-fallback.html`
 * (87 on 2026-11-15; rounded up for growth).
 */
export const APP_BUILD_FILES = 120;

/** Keys whose entity routes the build prerenders (`.corpus/entities.json`, W4.5 `prerenderPaths`). */
export interface PrerenderSets {
  /** Works with `livePrerender` (≥3 shiurim, not a genre label). */
  works: ReadonlySet<string>;
  people: ReadonlySet<string>;
  concepts: ReadonlySet<string>;
  /** Occasions with at least `OCCASION_PRERENDER_MIN` (2) shiurim. */
  occasions: ReadonlySet<string>;
}

/** W4.5 `OCCASION_PRERENDER_MIN` (app/seo/model.ts). */
const OCCASION_PRERENDER_MIN = 2;

export function prerenderSetsFromEntities(entities: EntitiesFile): PrerenderSets {
  const live = (xs: readonly { key: string; livePrerender: boolean }[]) => new Set(xs.filter((x) => x.livePrerender).map((x) => x.key));
  return {
    works: live(entities.works),
    people: live(entities.people),
    concepts: live(entities.concepts),
    occasions: new Set(entities.occasions.filter((o) => o.shiurim >= OCCASION_PRERENDER_MIN).map((o) => o.key)),
  };
}

/** `prerenderSetsFromEntities` of `<corpusDir>/entities.json`, or null when there is none. */
export function prerenderSetsFromCorpus(corpusDir: string | null | undefined): PrerenderSets | null {
  const file = corpusDir ? join(corpusDir, "entities.json") : null;
  if (!file || !existsSync(file)) return null;
  return prerenderSetsFromEntities(JSON.parse(readFileSync(file, "utf8")) as EntitiesFile);
}

/**
 * Pages `react-router build` prerenders over this data tree, by the rules of W4.5's
 * `prerenderPaths` (app/seo/model.ts): per UI language, Today, every shiur, series and occasion
 * (≥2 shiurim) with a data file, and the works, people and concepts with `livePrerender` that have
 * one. One HTML file per page. Without `sets`, every work and entity file counts (an upper bound).
 */
export function projectedPrerender(dataFiles: Iterable<string>, sets: PrerenderSets | null = null): number {
  let perUi = 1; // Today
  for (const file of dataFiles) {
    const m = /^(shiur|series|work|entity\/[pco])\/([^/]+)\.json$/u.exec(file);
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
    }
  }
  return 2 * perUi;
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
