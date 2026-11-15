/**
 * Quiet search index (integration-plan W3.5, tech-quiet §5): Pagefind custom records, one per shiur,
 * built from `.corpus/search/docs.ndjson` (the @emunas/search-core allow-list) and nothing else.
 *
 *   tsx scripts/build-search.ts [--corpus <dir>] [--out <dir>] [--transcripts <dir> | --no-verbatim]
 *                               [--site-policy <dir>]
 *
 * Defaults: `--corpus <repo>/.corpus`, `--out apps/quiet/dist/pagefind`, transcripts from
 * @emunas/corpus-guard's default folder, `--site-policy <repo>/site-policy`. Relative paths resolve
 * against INIT_CWD (the directory npm was run from).
 *
 * Steps:
 *  1. Make sure `docs.ndjson` is current (runs search-core's `search:build` step when it is missing or
 *     older than `.corpus/index.json`).
 *  2. One record per SearchDoc: `url` is the edition-less `shiur/<id>/` (the page prefixes `/<ed>/`);
 *     `content` is search-core's folded `docSearchText` (content, then candidateTopics keywords);
 *     `meta` is titleOriginal, citation, n, oneLinerEn, oneLinerYi, lang, status; `filters` are lang,
 *     category, status. Language `unknown`: no stemming, Hebrew and Latin tokens in one index.
 *  3. Every record goes through the corpus-guard Pagefind checker (forbidden keys and substrings,
 *     verbatim runs against the shiur's transcripts). Any finding: exit 1, nothing is written.
 *  4. `writeFiles`, then delete Pagefind's prebuilt UI bundles (the page uses its own glue).
 *
 * Exit codes: 0 ok, 1 error or guard finding, 2 usage.
 */
import { existsSync, readFileSync, rmSync, statSync, utimesSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import type { CorpusIndex, IndexRow } from "@emunas/corpus/public";
import { REPO_ROOT, defaultDataDir } from "@emunas/corpus/build";
import { DEFAULT_TRANSCRIPTS_DIR, checkPagefindRecord, createLeakScanner, type LeakScanner } from "@emunas/corpus-guard";
import { docSearchText, type SearchDoc } from "@emunas/search-core";
import { writeSearchOutputs } from "@emunas/search-core/build";

// ---------------------------------------------------------------- record shape

/** The record's language: one index, no stemming (tech-quiet §5). */
export const RECORD_LANGUAGE = "unknown";

/** Exactly these meta keys may appear on a record (results render from them, no excerpts). */
export const RECORD_META_FIELDS = ["titleOriginal", "citation", "n", "oneLinerEn", "oneLinerYi", "lang", "status"] as const;
export type RecordMetaField = (typeof RECORD_META_FIELDS)[number];

/** Exactly these filter keys may appear on a record. */
export const RECORD_FILTER_FIELDS = ["lang", "category", "status"] as const;
export type RecordFilterField = (typeof RECORD_FILTER_FIELDS)[number];

export interface QuietSearchRecord {
  /** Edition-less: `shiur/<id>/`. */
  url: string;
  content: string;
  language: typeof RECORD_LANGUAGE;
  meta: Partial<Record<RecordMetaField, string>>;
  filters: Record<RecordFilterField, string[]>;
}

/** Catalog citation fields for the meta line (from `.corpus/index.json`, public catalog data). */
export type CitationRow = Pick<IndexRow, "id"> & { catalog: Pick<IndexRow["catalog"], "sectionTitle" | "n"> };

/** Edition-less record URL of a shiur; the search page prefixes `/<ed>/`. */
export function recordUrl(id: string): string {
  return `shiur/${encodeURIComponent(id)}/`;
}

/**
 * One Pagefind record from one SearchDoc. Text comes only from search-core's `docSearchText`
 * (allow-listed SearchDoc fields, folded); the display meta copies the doc's title and one-liner and
 * the catalog section title/number.
 */
export function buildRecord(doc: SearchDoc, citation: CitationRow | undefined): QuietSearchRecord {
  const text = docSearchText(doc);
  const meta: Partial<Record<RecordMetaField, string>> = {
    titleOriginal: doc.titleOriginal,
    lang: doc.lang,
    status: doc.status,
  };
  const sectionTitle = citation?.catalog.sectionTitle.trim() ?? "";
  if (sectionTitle !== "") meta.citation = sectionTitle;
  const n = citation?.catalog.n?.trim() ?? "";
  if (n !== "") meta.n = n;
  if (doc.oneLiner !== null) {
    if (doc.oneLiner.en.trim() !== "") meta.oneLinerEn = doc.oneLiner.en;
    if (doc.oneLiner.yi.trim() !== "") meta.oneLinerYi = doc.oneLiner.yi;
  }
  return {
    url: recordUrl(doc.id),
    // Custom records have no per-field weights; the keywords (candidateTopics) come last.
    content: text.keywords === "" ? text.content : `${text.content}\n${text.keywords}`,
    language: RECORD_LANGUAGE,
    meta,
    filters: { lang: [doc.lang], category: [doc.category], status: [doc.status] },
  };
}

// ---------------------------------------------------------------- inputs

/** Parse `docs.ndjson`. */
export function readDocs(file: string): SearchDoc[] {
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => JSON.parse(l) as SearchDoc);
}

/** id → catalog citation fields, from `.corpus/index.json`. */
export function readCitations(corpusDir: string): Map<string, CitationRow> {
  const index = JSON.parse(readFileSync(join(corpusDir, "index.json"), "utf8")) as CorpusIndex;
  return new Map(index.shiurim.map((r) => [r.id, r]));
}

/**
 * Path of a current `docs.ndjson`: rebuilt through search-core when it is missing or older than
 * `index.json` (a corpus:build ran after the last search:build).
 */
export function ensureDocs(corpusDir: string, dataDir: string | null): { file: string; rebuilt: boolean } {
  const file = join(corpusDir, "search", "docs.ndjson");
  const indexFile = join(corpusDir, "index.json");
  if (!existsSync(indexFile)) throw new Error(`${indexFile} not found: run corpus:build first`);
  const stale = !existsSync(file) || statSync(file).mtimeMs < statSync(indexFile).mtimeMs;
  if (stale) {
    writeSearchOutputs({ corpusDir, dataDir });
    // search-core leaves a file alone when its content is unchanged: mark it current anyway.
    const now = new Date();
    utimesSync(file, now, now);
  }
  return { file, rebuilt: stale };
}

// ---------------------------------------------------------------- guard

export interface GuardSummary {
  records: number;
  findings: { kind: string; source: string; detail: string }[];
}

/** Run the corpus-guard Pagefind checker over every record (findings carry no shipped text). */
export function guardRecords(records: readonly { record: QuietSearchRecord; shiurId: string }[], scanner: LeakScanner): GuardSummary {
  const findings: GuardSummary["findings"] = [];
  for (const { record, shiurId } of records) {
    for (const f of checkPagefindRecord(record, scanner, shiurId)) {
      const detail =
        f.kind === "key"
          ? `key ${f.key} ×${f.count}`
          : f.kind === "substring"
            ? `substring ${f.substring} ×${f.count}`
            : f.kind === "verbatim"
              ? `verbatim run ${f.runLength}${f.field ? ` in ${f.field}` : ""}${f.itemId ? ` (${f.itemId})` : ""}`
              : f.kind === "transcript-file"
                ? `transcript file ${f.recordingId}`
                : f.kind === "alias"
                  ? `alias ${f.rule} ×${f.count}${f.entity ? ` of ${f.entity}` : ""} at ${f.field}`
                  : `unreadable: ${f.reason}`;
      findings.push({ kind: f.kind, source: f.source, detail });
    }
  }
  return { records: records.length, findings };
}

// ---------------------------------------------------------------- Pagefind

/** Prebuilt Pagefind UIs we do not use (the search page has its own ≤3 KB glue). */
export const UNUSED_PAGEFIND_FILES = [
  "pagefind-ui.js",
  "pagefind-ui.css",
  "pagefind-modular-ui.js",
  "pagefind-modular-ui.css",
  "pagefind-component-ui.js",
  "pagefind-component-ui.css",
  "pagefind-highlight.js",
] as const;

export interface BuildSearchOptions {
  corpusDir: string;
  outDir: string;
  /** Transcript folder for the verbatim check; null skips the verbatim check (keys/substrings still run). */
  transcriptsDir: string | null;
  siteDir: string;
  /** For candidateTopics when docs.ndjson must be rebuilt; null leaves keywords out. */
  dataDir: string | null;
  env?: Record<string, string | undefined>;
  log?: (msg: string) => void;
}

export interface BuildSearchResult {
  records: number;
  rebuiltDocs: boolean;
  guard: GuardSummary;
  written: boolean;
}

export async function buildSearch(opts: BuildSearchOptions): Promise<BuildSearchResult> {
  const log = opts.log ?? (() => {});
  const { file, rebuilt } = ensureDocs(opts.corpusDir, opts.dataDir);
  if (rebuilt) log(`search: rebuilt ${file} through @emunas/search-core`);
  const docs = readDocs(file);
  const citations = readCitations(opts.corpusDir);
  const records = docs.map((doc) => ({ record: buildRecord(doc, citations.get(doc.id)), shiurId: doc.id }));

  const scanner = createLeakScanner({
    corpusDir: opts.corpusDir,
    transcriptsDir: opts.transcriptsDir,
    siteDir: opts.siteDir,
    env: opts.env ?? process.env,
  });
  const guard = guardRecords(records, scanner);
  if (guard.findings.length > 0) return { records: records.length, rebuiltDocs: rebuilt, guard, written: false };

  const pagefind = await import("pagefind");
  try {
    const created = await pagefind.createIndex({ forceLanguage: RECORD_LANGUAGE, writePlayground: false });
    if (!created.index) throw new Error(`pagefind createIndex: ${created.errors.join("; ")}`);
    const index = created.index;
    for (const { record } of records) {
      const r = await index.addCustomRecord(record);
      if (r.errors.length > 0) throw new Error(`pagefind addCustomRecord ${record.url}: ${r.errors.join("; ")}`);
    }
    rmSync(opts.outDir, { recursive: true, force: true });
    const w = await index.writeFiles({ outputPath: opts.outDir });
    if (w.errors.length > 0) throw new Error(`pagefind writeFiles: ${w.errors.join("; ")}`);
  } finally {
    await pagefind.close();
  }
  for (const f of UNUSED_PAGEFIND_FILES) rmSync(join(opts.outDir, f), { force: true });
  return { records: records.length, rebuiltDocs: rebuilt, guard, written: true };
}

// ---------------------------------------------------------------- CLI

const APP_DIR = resolve(REPO_ROOT, "apps/quiet");

async function main(argv: string[]): Promise<number> {
  let args;
  try {
    args = parseArgs({
      args: argv,
      options: {
        corpus: { type: "string" },
        out: { type: "string" },
        transcripts: { type: "string" },
        "no-verbatim": { type: "boolean", default: false },
        "site-policy": { type: "string" },
        help: { type: "boolean", short: "h", default: false },
      },
      strict: true,
      allowPositionals: false,
    });
  } catch (e) {
    console.error((e as Error).message);
    return 2;
  }
  const v = args.values;
  if (v.help) {
    console.log("build-search [--corpus <dir>] [--out <dir>] [--transcripts <dir> | --no-verbatim] [--site-policy <dir>]");
    return 0;
  }
  if (v["no-verbatim"] && v.transcripts !== undefined) {
    console.error("--transcripts and --no-verbatim exclude each other");
    return 2;
  }
  const base = process.env["INIT_CWD"] ?? process.cwd();
  const at = (p: string | undefined, dflt: string) => (p === undefined ? dflt : resolve(base, p));
  const opts: BuildSearchOptions = {
    corpusDir: at(v.corpus, resolve(REPO_ROOT, ".corpus")),
    outDir: at(v.out, join(APP_DIR, "dist", "pagefind")),
    transcriptsDir: v["no-verbatim"] ? null : at(v.transcripts, resolve(REPO_ROOT, DEFAULT_TRANSCRIPTS_DIR)),
    siteDir: at(v["site-policy"], resolve(REPO_ROOT, "site-policy")),
    dataDir: defaultDataDir(),
    log: (m) => console.log(m),
  };
  try {
    const t0 = performance.now();
    const r = await buildSearch(opts);
    if (!r.written) {
      console.error(`search: corpus-guard rejected the Pagefind records (${r.guard.findings.length} findings); nothing written`);
      for (const f of r.guard.findings.slice(0, 50)) console.error(`  ${f.kind} ${f.source}: ${f.detail}`);
      return 1;
    }
    console.log(
      `search: ${r.records} Pagefind records, guard clean${opts.transcriptsDir === null ? " (verbatim check skipped)" : ""}, ` +
        `→ ${opts.outDir} in ${Math.round(performance.now() - t0)} ms`,
    );
    return 0;
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    return 1;
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await main(process.argv.slice(2));
}
