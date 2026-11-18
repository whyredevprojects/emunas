/**
 * Quiet search index (integration-plan W3.5, tech-quiet §5, corpus-wave-plan C3.7): Pagefind custom
 * records built from `.corpus/search/docs.ndjson` and `.corpus/search/entities.ndjson` (the
 * @emunas/search-core allow-list) and nothing else.
 *
 *   tsx scripts/build-search.ts [--corpus <dir>] [--out <dir>] [--transcripts <dir> | --no-verbatim]
 *                               [--site-policy <dir>] [--corpus-data <dir>]
 *
 * Defaults: `--corpus <repo>/.corpus`, `--out apps/quiet/dist/pagefind`, transcripts from
 * @emunas/corpus-guard's default folder, `--site-policy <repo>/site-policy`, `--corpus-data`
 * corpus-guard's default corpus data folder (display fields for the alias checks; read by the guard
 * only). Relative paths resolve against INIT_CWD (the directory npm was run from).
 *
 * Steps:
 *  1. Make sure `docs.ndjson` and `entities.ndjson` are current (runs search-core's `search:build`
 *     step when docs.ndjson is missing or older than `.corpus/index.json`).
 *  2. One **shiur record** per SearchDoc: `url` is the edition-less `shiur/<id>/` (the page prefixes
 *     `/<ed>/`); `content` is search-core's folded `docSearchText`: the text fields, then the topic
 *     keywords (`SearchDoc.keywords`: the shiur's topic labels and topic aliases); `meta` is
 *     titleOriginal, citation, n, oneLinerEn, oneLinerYi, lang, status; `filters` are type (`shiur`),
 *     lang, category, status.
 *  3. One **entity record** (headword result, concept-quiet-corpus C5 "Search") per Quiet address of
 *     the EntityDocs listed on Quiet: `url` is the entity's Quiet page, or its index anchor when it
 *     has none (`@emunas/links`). Pagefind keeps one record per URL, so a concept merged into a topic
 *     shares the topic's record, which shows the topic. `content` is the members' folded labels and
 *     clean synonyms, one per line (display fields only, from the layer's synonyms.json: never ASR
 *     variants or alias-map keys); `meta` is entity (the members' `kind:id`, space-separated), kind,
 *     labelHe, labelEn, labelYi, count; `filters` are type (`entry`) and kind. No synonym is in meta: they are searched,
 *     never shown. All entities are AI-generated and unreviewed: the search page says so above them.
 *  4. Every record goes through the corpus-guard Pagefind checker (forbidden keys and substrings,
 *     verbatim runs against the shiur's transcripts). Entity records also go through the alias
 *     checks (raw ban and alias-key assertion against the corpus data's display fields), line by
 *     line, which need the corpus data folder. The synonym table (step 5) is checked the same way.
 *     Any finding: exit 1, nothing is written.
 *  5. `writeFiles`, delete Pagefind's prebuilt UI bundles (the page uses its own glue), and write
 *     `synonyms.json` beside them: the client's synonym table for `normalizeQuery` (kind, id, labels,
 *     synonyms and count of every entity record).
 *
 * Language `unknown`: no stemming, Hebrew and Latin tokens in one index.
 *
 * Exit codes: 0 ok, 1 error or guard finding, 2 usage.
 */
import { existsSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import type { CorpusIndex, IndexRow } from "@emunas/corpus/public";
import { REPO_ROOT, defaultDataDir } from "@emunas/corpus/build";
import {
  DEFAULT_CORPUS_DATA_DIR,
  DEFAULT_TRANSCRIPTS_DIR,
  checkPagefindRecord,
  createLeakScanner,
  type EntityKind,
  type Finding,
  type LeakScanner,
} from "@emunas/corpus-guard";
import { formatQuiet, type LinkData } from "@emunas/links";
import { fold } from "@emunas/normalize";
import { ENTITY_DOC_KINDS, docSearchText, type EntityDoc, type EntityDocKind, type SearchDoc } from "@emunas/search-core";
import { writeSearchOutputs } from "@emunas/search-core/build";

// ---------------------------------------------------------------- record shape

/** The record's language: one index, no stemming (tech-quiet §5). */
export const RECORD_LANGUAGE = "unknown";

/** Exactly these meta keys may appear on a shiur record (results render from them, no excerpts). */
export const RECORD_META_FIELDS = ["titleOriginal", "citation", "n", "oneLinerEn", "oneLinerYi", "lang", "status"] as const;
export type RecordMetaField = (typeof RECORD_META_FIELDS)[number];

/** Exactly these filter keys may appear on a shiur record. */
export const RECORD_FILTER_FIELDS = ["type", "lang", "category", "status"] as const;
export type RecordFilterField = (typeof RECORD_FILTER_FIELDS)[number];

/** Exactly these meta keys may appear on an entity record. No synonyms: they are searched, never shown. */
export const ENTITY_META_FIELDS = ["entity", "kind", "labelHe", "labelEn", "labelYi", "count"] as const;
export type EntityMetaField = (typeof ENTITY_META_FIELDS)[number];

/** Exactly these filter keys may appear on an entity record. */
export const ENTITY_FILTER_FIELDS = ["type", "kind"] as const;
export type EntityFilterField = (typeof ENTITY_FILTER_FIELDS)[number];

/** `filters.type` of each record kind; the search page queries them apart. */
export const RECORD_TYPE = { shiur: "shiur", entry: "entry" } as const;

/** The client's synonym table, written next to the Pagefind bundle. */
export const SYNONYMS_FILE = "synonyms.json";

export interface QuietSearchRecord {
  /** Edition-less: `shiur/<id>/`. */
  url: string;
  content: string;
  language: typeof RECORD_LANGUAGE;
  meta: Partial<Record<RecordMetaField, string>>;
  filters: Record<RecordFilterField, string[]>;
}

export interface QuietEntityRecord {
  /** Edition-less: `inyanim/<id>/`, or an index anchor such as `people/#<id>`. */
  url: string;
  content: string;
  language: typeof RECORD_LANGUAGE;
  meta: Partial<Record<EntityMetaField, string>>;
  filters: Record<EntityFilterField, string[]>;
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
    // Custom records have no per-field weights; the topic keywords come last.
    content: text.keywords === "" ? text.content : `${text.content}\n${text.keywords}`,
    language: RECORD_LANGUAGE,
    meta,
    filters: { type: [RECORD_TYPE.shiur], lang: [doc.lang], category: [doc.category], status: [doc.status] },
  };
}

// ---------------------------------------------------------------- entity records

/** `kind:id`: how the client matches a record against `normalizeQuery(...).entities`. */
export function entityKey(kind: string, id: string): string {
  return `${kind}:${id}`;
}

/** Entity docs by kind and id, with the Quiet page lookups `@emunas/links` reads. */
export interface EntityLookup {
  get(kind: EntityDocKind, id: string): EntityDoc | undefined;
  links: LinkData;
}

export function entityLookup(entities: readonly EntityDoc[]): EntityLookup {
  const byKey = new Map(entities.map((e) => [entityKey(e.kind, e.id), e]));
  const get = (kind: EntityDocKind, id: string) => byKey.get(entityKey(kind, id));
  return {
    get,
    links: {
      hasPage: (site, kind, id) => {
        if (kind === "story" || kind === "thread") return undefined;
        return get(kind, id)?.pages[site] === true;
      },
      // Only a topic that has a record of its own can be the entry.
      conceptTopic: (id) => {
        const t = get("concept", id)?.mergedInto ?? null;
        return t !== null && get("topic", t) !== undefined ? t : undefined;
      },
    },
  };
}

/** Whether an EntityDoc gets a Quiet record: it is listed in a Quiet index. */
export function onQuiet(e: EntityDoc): boolean {
  return e.listed.quiet;
}

/** Edition-less Quiet address of an entity: its page, else its index anchor (`@emunas/links`). */
export function entityUrl(e: Pick<EntityDoc, "kind" | "id">, lookup: EntityLookup): string {
  return formatQuiet({ kind: "entry", ed: "en", entry: e.kind, id: e.id }, lookup.links).replace(/^\/en\//, "");
}

/** Folded, deduplicated searchable terms of an entity: its labels, then its clean synonyms. */
export function entityTerms(e: Pick<EntityDoc, "labels" | "synonyms">): string[] {
  const out: string[] = [];
  for (const t of [e.labels.he, e.labels.en, e.labels.yi, ...e.synonyms]) {
    const f = t === null ? "" : fold(t);
    if (f !== "" && !out.includes(f)) out.push(f);
  }
  return out;
}

/** The entity an entry shows: the topic a concept is merged into, else the entity itself. */
export function shownEntity(e: EntityDoc, lookup: EntityLookup): EntityDoc {
  const topic = e.kind === "concept" ? lookup.links.conceptTopic?.(e.id) : undefined;
  return (topic === undefined ? undefined : lookup.get("topic", topic)) ?? e;
}

/**
 * One Pagefind record for one address (module doc, step 3). Pagefind keeps one record per URL, so
 * the entities that share an address (a topic and the concepts merged into it) share a record: it
 * shows the topic and is found by every member's own terms. `members` must share `entityUrl`; the
 * shown entity is listed first.
 */
export function buildEntityRecord(members: readonly EntityDoc[], lookup: EntityLookup): QuietEntityRecord {
  const first = members[0];
  if (first === undefined) throw new Error("buildEntityRecord: no entity");
  const shown = shownEntity(first, lookup);
  const meta: Partial<Record<EntityMetaField, string>> = {
    entity: members.map((m) => entityKey(m.kind, m.id)).join(" "),
    kind: shown.kind,
    count: String(shown.count),
  };
  const he = shown.labels.he?.trim() ?? "";
  const en = shown.labels.en?.trim() ?? "";
  const yi = shown.labels.yi?.trim() ?? "";
  if (he !== "") meta.labelHe = he;
  if (en !== "") meta.labelEn = en;
  if (yi !== "") meta.labelYi = yi;
  const terms: string[] = [];
  for (const m of members) for (const t of entityTerms(m)) if (!terms.includes(t)) terms.push(t);
  return {
    url: entityUrl(first, lookup),
    content: terms.join("\n"),
    language: RECORD_LANGUAGE,
    meta,
    filters: { type: [RECORD_TYPE.entry], kind: [shown.kind] },
  };
}

/**
 * The entity records of a set of EntityDocs: one group per Quiet address, its members in input
 * order with the shown entity first.
 */
export function entityGroups(entities: readonly EntityDoc[], lookup: EntityLookup): EntityDoc[][] {
  const groups = new Map<string, EntityDoc[]>();
  for (const e of entities) {
    if (!onQuiet(e)) continue;
    const url = entityUrl(e, lookup);
    const g = groups.get(url);
    if (g === undefined) groups.set(url, [e]);
    else if (shownEntity(e, lookup) === e) g.unshift(e);
    else g.push(e);
  }
  return [...groups.values()];
}

/** One entry of the client's synonym table (`synonyms.json`): what `buildSynonymTable` reads. */
export interface SynonymTableRow {
  kind: EntityDocKind;
  id: string;
  labels: { he: string | null; en: string | null; yi: string | null };
  /** Folded synonyms, minus the folded labels (the table folds those itself). */
  synonyms: string[];
  count: number;
}

export function synonymRow(e: EntityDoc): SynonymTableRow {
  const labels = { he: e.labels.he, en: e.labels.en, yi: e.labels.yi };
  const own = new Set([labels.he, labels.en, labels.yi].map((l) => (l === null ? "" : fold(l))));
  const synonyms: string[] = [];
  for (const s of e.synonyms) {
    const f = fold(s);
    if (f !== "" && !own.has(f) && !synonyms.includes(f)) synonyms.push(f);
  }
  return { kind: e.kind, id: e.id, labels, synonyms, count: e.count };
}

// ---------------------------------------------------------------- inputs

function readNdjson(file: string): unknown[] {
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => JSON.parse(l) as unknown);
}

/** Parse `docs.ndjson`. */
export function readDocs(file: string): SearchDoc[] {
  return readNdjson(file) as SearchDoc[];
}

const str = (x: unknown): string | null => (typeof x === "string" && x.trim() !== "" ? x : null);
const flags = (f: unknown): { quiet: boolean; live: boolean } => {
  const o = (f !== null && typeof f === "object" ? f : {}) as { quiet?: unknown; live?: unknown };
  return { quiet: o.quiet === true, live: o.live === true };
};

/**
 * Parse `entities.ndjson`, read defensively (the shape may grow): a row of an unknown kind or
 * without an id is skipped; missing fields read as empty. A missing file fails: the corpus layer is
 * required.
 */
export function readEntities(file: string): EntityDoc[] {
  if (!existsSync(file)) throw new Error(`${file} is missing: the corpus layer is required (run npm run corpus:build and search:build)`);
  const kinds: readonly string[] = ENTITY_DOC_KINDS;
  return readNdjson(file).flatMap((row): EntityDoc[] => {
    if (row === null || typeof row !== "object") return [];
    const e = row as Record<string, unknown>;
    const id = str(e["id"]);
    const kind = str(e["kind"]);
    if (id === null || kind === null || !kinds.includes(kind)) return [];
    const l = (e["labels"] !== null && typeof e["labels"] === "object" ? e["labels"] : {}) as Record<string, unknown>;
    const syn = e["synonyms"];
    const count = e["count"];
    return [
      {
        kind: kind as EntityDocKind,
        id,
        labels: { he: str(l["he"]), en: str(l["en"]), yi: str(l["yi"]) },
        synonyms: Array.isArray(syn) ? syn.filter((s): s is string => typeof s === "string") : [],
        count: typeof count === "number" && Number.isFinite(count) ? count : 0,
        listed: flags(e["listed"]),
        pages: flags(e["pages"]),
        mergedInto: str(e["mergedInto"]),
        hash: str(e["hash"]) ?? "",
      },
    ];
  });
}

/** id → catalog citation fields, from `.corpus/index.json`. */
export function readCitations(corpusDir: string): Map<string, CitationRow> {
  const index = JSON.parse(readFileSync(join(corpusDir, "index.json"), "utf8")) as CorpusIndex;
  return new Map(index.shiurim.map((r) => [r.id, r]));
}

/**
 * Paths of a current `docs.ndjson` and its sibling `entities.ndjson`: rebuilt through search-core
 * when docs.ndjson is missing or older than `index.json` (a corpus:build ran after the last
 * search:build).
 */
export function ensureDocs(corpusDir: string, dataDir: string | null): { file: string; entitiesFile: string; rebuilt: boolean } {
  const file = join(corpusDir, "search", "docs.ndjson");
  const entitiesFile = join(corpusDir, "search", "entities.ndjson");
  const indexFile = join(corpusDir, "index.json");
  if (!existsSync(indexFile)) throw new Error(`${indexFile} not found: run corpus:build first`);
  const stale = !existsSync(file) || statSync(file).mtimeMs < statSync(indexFile).mtimeMs;
  if (stale) {
    writeSearchOutputs({ corpusDir, dataDir });
    // search-core leaves a file alone when its content is unchanged: mark it current anyway.
    const now = new Date();
    utimesSync(file, now, now);
  }
  return { file, entitiesFile, rebuilt: stale };
}

// ---------------------------------------------------------------- guard

export interface GuardSummary {
  records: number;
  findings: { kind: string; source: string; detail: string }[];
}

/** A record to check: a shiur record with its shiur id, or an entity record with its entity. */
export type GuardItem =
  | { record: QuietSearchRecord; shiurId: string; entities?: undefined }
  | { record: QuietEntityRecord; entities: EntityMember[]; shiurId?: undefined };

/** An entity of an entity record and the terms it brings to the record's content. */
export interface EntityMember {
  entity: { kind: EntityKind; id: string };
  terms: string[];
}

function describeFinding(f: Finding): string {
  switch (f.kind) {
    case "key":
      return `key ${f.key} ×${f.count}`;
    case "substring":
      return `substring ${f.substring} ×${f.count}`;
    case "verbatim":
      return `verbatim run ${f.runLength}${f.field ? ` in ${f.field}` : ""}${f.itemId ? ` (${f.itemId})` : ""}`;
    case "transcript-file":
      return `transcript file ${f.recordingId}`;
    case "alias":
      return `alias ${f.rule} ×${f.count}${f.entity ? ` of ${f.entity}` : ""} at ${f.field}`;
    case "meta-comment":
      return `remark on the audio or transcript "${f.term}" ×${f.count}${f.field ? ` at ${f.field}` : ""}: ${f.context}`;
    case "unreadable":
      return `unreadable: ${f.reason}`;
  }
}

const summarize = (fs: readonly Finding[]): GuardSummary["findings"] =>
  fs.map((f) => ({ kind: f.kind, source: f.source, detail: describeFinding(f) }));

/**
 * Run the corpus-guard Pagefind checker over every record (findings carry no shipped text). Entity
 * records are checked with their shown entity, and every line of their content (labels and
 * synonyms) goes through the alias checks with the entity it came from: the raw ban and the
 * alias-key assertion. A content line no member accounts for is a finding. The alias checks need a
 * scanner with the corpus data; without it every entity record is a finding.
 */
export function guardRecords(items: readonly GuardItem[], scanner: LeakScanner): GuardSummary {
  const findings: GuardSummary["findings"] = [];
  const aliasesOn = scanner.result().aliasesChecked;
  for (const item of items) {
    if (item.entities === undefined) {
      findings.push(...summarize(checkPagefindRecord(item.record, scanner, item.shiurId)));
      continue;
    }
    const source = `pagefind:${item.record.url}`;
    if (!aliasesOn) {
      findings.push({ kind: "alias", source, detail: "alias checks off (no corpus data folder): entity records refused" });
      continue;
    }
    findings.push(...summarize(checkPagefindRecord(item.record, scanner, undefined, item.entities[0]?.entity)));
    const before = scanner.findings.length;
    for (const m of item.entities) scanner.checkEntityAliases(m.entity, m.terms, `${source}#content`);
    findings.push(...summarize(scanner.findings.slice(before)));
    const accounted = new Set(item.entities.flatMap((m) => m.terms));
    const stray = item.record.content.split("\n").filter((t) => t !== "" && !accounted.has(t)).length;
    if (stray > 0) findings.push({ kind: "alias", source, detail: `alias unaccounted ×${stray} at content` });
  }
  return { records: items.length, findings };
}

/** Guard the client's synonym table as the post-pass reads it (alias keys, each with its entity). */
export function guardSynonymTable(rows: readonly SynonymTableRow[], scanner: LeakScanner): GuardSummary {
  if (rows.length > 0 && !scanner.result().aliasesChecked) {
    return { records: rows.length, findings: [{ kind: "alias", source: SYNONYMS_FILE, detail: "alias checks off (no corpus data folder)" }] };
  }
  const before = scanner.findings.length;
  scanner.scanValue(rows, `pagefind:${SYNONYMS_FILE}`);
  return { records: rows.length, findings: summarize(scanner.findings.slice(before)) };
}

// ---------------------------------------------------------------- Pagefind

/** Prebuilt Pagefind UIs we do not use (the search page has its own small glue). */
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
  /** For the synonym check when docs.ndjson must be rebuilt; null skips it there (the guard still runs). */
  dataDir: string | null;
  /**
   * Corpus data folder for the guard's alias checks (display fields, ASR variant dump; read by
   * corpus-guard only). Default: corpus-guard's default folder when it exists. Entity records need
   * it: null (or no folder) refuses them.
   */
  corpusDataDir?: string | null;
  env?: Record<string, string | undefined>;
  log?: (msg: string) => void;
}

export interface BuildSearchResult {
  /** Shiur records + entity records. */
  records: number;
  entityRecords: number;
  rebuiltDocs: boolean;
  guard: GuardSummary;
  written: boolean;
}

/** Shiur and entity records, the synonym table rows (one per Quiet entity), and the items to guard. */
export function buildRecords(
  docs: readonly SearchDoc[],
  entities: readonly EntityDoc[],
  citations: ReadonlyMap<string, CitationRow>,
): { items: GuardItem[]; synonyms: SynonymTableRow[] } {
  const items: GuardItem[] = docs.map((doc) => ({ record: buildRecord(doc, citations.get(doc.id)), shiurId: doc.id }));
  const lookup = entityLookup(entities);
  for (const members of entityGroups(entities, lookup)) {
    items.push({ record: buildEntityRecord(members, lookup), entities: members.map(entityMember) });
  }
  return { items, synonyms: entities.filter(onQuiet).map(synonymRow) };
}

/** corpus-guard's default corpus data folder, or null when this checkout has none. */
export function defaultCorpusDataDir(): string | null {
  const d = resolve(REPO_ROOT, DEFAULT_CORPUS_DATA_DIR);
  return existsSync(d) ? d : null;
}

/** The guard's view of one entity record member. */
export function entityMember(e: EntityDoc): EntityMember {
  return { entity: { kind: e.kind, id: e.id }, terms: entityTerms(e) };
}

export async function buildSearch(opts: BuildSearchOptions): Promise<BuildSearchResult> {
  const log = opts.log ?? (() => {});
  const { file, entitiesFile, rebuilt } = ensureDocs(opts.corpusDir, opts.dataDir);
  if (rebuilt) log(`search: rebuilt ${file} through @emunas/search-core`);
  const { items, synonyms } = buildRecords(readDocs(file), readEntities(entitiesFile), readCitations(opts.corpusDir));
  const entityRecords = items.filter((i) => i.entities !== undefined).length;

  const scanner = createLeakScanner({
    corpusDir: opts.corpusDir,
    transcriptsDir: opts.transcriptsDir,
    corpusDataDir: opts.corpusDataDir === undefined ? defaultCorpusDataDir() : opts.corpusDataDir,
    siteDir: opts.siteDir,
    env: opts.env ?? process.env,
  });
  const guard = guardRecords(items, scanner);
  guard.findings.push(...guardSynonymTable(synonyms, scanner).findings);
  const result = { records: items.length, entityRecords, rebuiltDocs: rebuilt, guard };
  if (guard.findings.length > 0) return { ...result, written: false };

  const pagefind = await import("pagefind");
  try {
    const created = await pagefind.createIndex({ forceLanguage: RECORD_LANGUAGE, writePlayground: false });
    if (!created.index) throw new Error(`pagefind createIndex: ${created.errors.join("; ")}`);
    const index = created.index;
    for (const { record } of items) {
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
  writeFileSync(join(opts.outDir, SYNONYMS_FILE), JSON.stringify(synonyms));
  return { ...result, written: true };
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
        "corpus-data": { type: "string" },
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
    console.log(
      "build-search [--corpus <dir>] [--out <dir>] [--transcripts <dir> | --no-verbatim] [--site-policy <dir>] [--corpus-data <dir>]",
    );
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
    corpusDataDir: v["corpus-data"] === undefined ? defaultCorpusDataDir() : resolve(base, v["corpus-data"]),
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
      `search: ${r.records - r.entityRecords} shiur and ${r.entityRecords} entity Pagefind records, guard clean` +
        `${opts.transcriptsDir === null ? " (verbatim check skipped)" : ""}, → ${opts.outDir} in ${Math.round(performance.now() - t0)} ms`,
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
