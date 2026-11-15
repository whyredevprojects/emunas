/**
 * Incremental D1 sync (tech-live §5.3, integration-plan W3.10):
 *
 *   select id, hash from moments → diff against moments.ndjson → batched writes → meta.corpus_rev last.
 *
 * Writes go in set-based chunks (`chunkStatements`): delete the old entity/text/FTS rows of
 * every touched moment, insert the new ones, then `INSERT OR REPLACE` the `moments` rows (which
 * carry the hash) last. If a run dies part-way, a moment whose chunk did not finish keeps its
 * old hash and is redone next time. Removed moments: dependants first, `moments` row last.
 * `meta.corpus_rev` is written after everything else, and only when it changes.
 */
import type { MomentRow } from "@emunas/search-core";
import { corpusRevOf, ftsRowid, LANGS, toMomentRecord, type MomentRecord } from "./rows.ts";
import { stmt, type SqlTarget, type Stmt } from "./sql.ts";

/** The search schema version this sync writes (migrations/search/0001_init.sql). */
export const EXPECTED_SCHEMA_VERSION = "1";
const PAGE = 5000;

export interface D1Plan {
  rev: string;
  previousRev: string | null;
  inserts: MomentRecord[];
  updates: MomentRecord[];
  deletes: string[];
  unchanged: number;
}

export interface D1Report {
  target: string;
  rev: string;
  previousRev: string | null;
  inserted: number;
  updated: number;
  deleted: number;
  unchanged: number;
  /** Statements sent (0 when nothing changed). */
  statements: number;
  /** Rows inserted or replaced across all tables, plus the meta row when written. */
  rowsWritten: number;
  /** Shiurim touched by inserts, updates or deletes. */
  shiurim: string[];
  revWritten: boolean;
  dryRun: boolean;
}

export class SchemaError extends Error {}

export async function readSchemaVersion(target: SqlTarget): Promise<string | null> {
  try {
    const rows = await target.all<{ v: string }>("SELECT v FROM meta WHERE k = 'schema_version'");
    return rows[0]?.v ?? null;
  } catch {
    return null;
  }
}

export async function readCorpusRev(target: SqlTarget): Promise<string | null> {
  const rows = await target.all<{ v: string }>("SELECT v FROM meta WHERE k = 'corpus_rev'");
  return rows[0]?.v ?? null;
}

/** Every `(id, hash)` in `moments`, paged by id. */
export async function readExisting(target: SqlTarget): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  let after = "";
  for (;;) {
    const page = await target.all<{ id: string; hash: string }>(
      "SELECT id, hash FROM moments WHERE id > ? ORDER BY id LIMIT ?",
      [after, PAGE],
    );
    for (const r of page) out.set(r.id, r.hash);
    if (page.length < PAGE) break;
    after = (page[page.length - 1] as { id: string }).id;
  }
  return out;
}

export function planD1(rows: readonly MomentRow[], existing: ReadonlyMap<string, string>, previousRev: string | null): D1Plan {
  const inserts: MomentRecord[] = [];
  const updates: MomentRecord[] = [];
  let unchanged = 0;
  const wanted = new Set<string>();
  for (const row of rows) {
    wanted.add(row.id);
    const old = existing.get(row.id);
    if (old === undefined) inserts.push(toMomentRecord(row));
    else if (old !== row.hash) updates.push(toMomentRecord(row));
    else unchanged++;
  }
  const deletes = [...existing.keys()].filter((id) => !wanted.has(id)).sort();
  return { rev: corpusRevOf(rows), previousRev, inserts, updates, deletes, unchanged };
}


const IDS = "SELECT value FROM json_each(?)";
const col = (i: number) => `json_extract(value, '$[${i}]')`;
const cols = (n: number) => Array.from({ length: n }, (_, i) => col(i)).join(", ");

/**
 * Statements for one chunk of moments, set-based: each statement carries the whole chunk as one
 * JSON parameter read with `json_each`, so a chunk costs ~10 statements whatever its size (D1
 * charges per statement and caps bound parameters at 100). Order: delete the dependants of
 * every touched moment, delete removed moments, insert the new dependants, and write the
 * `moments` rows (which carry the hash) last. A chunk that dies part-way leaves its moments
 * with their old hash, so the next run redoes them; every statement is idempotent.
 */
export function chunkStatements(records: readonly MomentRecord[], deletedIds: readonly string[]): Stmt[] {
  const touched = [...deletedIds, ...records.map((r) => r.id)];
  if (touched.length === 0) return [];
  const ids = JSON.stringify(touched);
  const rowids = JSON.stringify(touched.flatMap((id) => LANGS.map((l) => ftsRowid(id, l))));
  const out: Stmt[] = [
    stmt(`DELETE FROM moment_entities WHERE moment_id IN (${IDS})`, ids),
    stmt(`DELETE FROM moment_text WHERE id IN (${IDS})`, ids),
    stmt(`DELETE FROM fts_words WHERE rowid IN (${IDS})`, rowids),
    stmt(`DELETE FROM fts_tri WHERE rowid IN (${IDS})`, rowids),
  ];
  if (deletedIds.length > 0) out.push(stmt(`DELETE FROM moments WHERE id IN (${IDS})`, JSON.stringify(deletedIds)));
  if (records.length === 0) return out;
  const entities = records.flatMap((r) => r.entities.map((e) => [r.id, e.type, e.entityId]));
  if (entities.length > 0) {
    out.push(stmt(`INSERT OR REPLACE INTO moment_entities (moment_id, type, entity_id) SELECT ${cols(3)} FROM json_each(?)`, JSON.stringify(entities)));
  }
  const texts = records.flatMap((r) => r.texts.map((t) => [r.id, t.lang, t.title, t.body]));
  if (texts.length > 0) {
    out.push(stmt(`INSERT OR REPLACE INTO moment_text (id, lang, title, body) SELECT ${cols(4)} FROM json_each(?)`, JSON.stringify(texts)));
  }
  const fts = records.flatMap((r) => r.fts.map((f) => [ftsRowid(r.id, f.lang), r.id, f.lang, f.title, f.body]));
  if (fts.length > 0) {
    const payload = JSON.stringify(fts);
    for (const table of ["fts_words", "fts_tri"] as const) {
      out.push(stmt(`INSERT INTO ${table} (rowid, id, lang, title, body) SELECT ${cols(5)} FROM json_each(?)`, payload));
    }
  }
  const moments = records.map(({ moment: m }) => [
    m.id, m.shiur_id, m.kind, m.t, m.end_t, m.audio_lang, m.category, m.occasion, m.series, m.year, m.catalogued,
    m.confidence, m.title_en, m.title_yi, m.hash,
  ]);
  out.push(
    stmt(
      "INSERT OR REPLACE INTO moments (id, shiur_id, kind, t, end_t, audio_lang, category, occasion, series, year, catalogued, confidence, title_en, title_yi, hash) " +
        `SELECT ${cols(15)} FROM json_each(?)`,
      JSON.stringify(moments),
    ),
  );
  return out;
}

function rowsOf(r: MomentRecord): number {
  return 1 + r.entities.length + r.texts.length + 2 * r.fts.length;
}

/** Rough JSON bytes a record adds to its largest statement parameter (the FTS payload). */
function weightOf(r: MomentRecord): number {
  let n = 100;
  for (const f of r.fts) n += Buffer.byteLength(`${f.title}${f.body}`, "utf8");
  return n;
}

export interface SyncD1Options {
  dryRun?: boolean;
  /** Upper bound of one statement's JSON parameter (bytes); D1 caps a value at 2 MB. */
  chunkBytes?: number;
  /** Upper bound of moments per chunk. */
  chunkMoments?: number;
  log?: (msg: string) => void;
}

/** Split the plan into chunks of statements (deletions first, then updates and inserts). */
export function planChunks(plan: D1Plan, opts: Pick<SyncD1Options, "chunkBytes" | "chunkMoments"> = {}): Stmt[][] {
  const maxBytes = opts.chunkBytes ?? 500_000;
  const maxMoments = opts.chunkMoments ?? 1000;
  const chunks: Stmt[][] = [];
  for (let i = 0; i < plan.deletes.length; i += maxMoments) chunks.push(chunkStatements([], plan.deletes.slice(i, i + maxMoments)));
  let cur: MomentRecord[] = [];
  let bytes = 0;
  for (const r of [...plan.updates, ...plan.inserts]) {
    const w = weightOf(r);
    if (cur.length > 0 && (bytes + w > maxBytes || cur.length >= maxMoments)) {
      chunks.push(chunkStatements(cur, []));
      cur = [];
      bytes = 0;
    }
    cur.push(r);
    bytes += w;
  }
  if (cur.length > 0) chunks.push(chunkStatements(cur, []));
  return chunks;
}

export async function syncD1(target: SqlTarget, rows: readonly MomentRow[], opts: SyncD1Options = {}): Promise<D1Report> {
  const log = opts.log ?? (() => {});
  const version = await readSchemaVersion(target);
  if (version !== EXPECTED_SCHEMA_VERSION) {
    throw new SchemaError(
      `${target.name}: search schema version is ${version ?? "missing"}, expected ${EXPECTED_SCHEMA_VERSION}; apply the D1 migrations (migrations/search) first`,
    );
  }
  const previousRev = await readCorpusRev(target);
  const existing = await readExisting(target);
  const plan = planD1(rows, existing, previousRev);
  const chunks = planChunks(plan, opts);
  const shiurim = new Set<string>([...plan.inserts, ...plan.updates].map((r) => r.shiurId));
  for (const id of plan.deletes) shiurim.add(id.slice(0, id.indexOf("~")));
  let rowsWritten = [...plan.inserts, ...plan.updates].reduce((n, r) => n + rowsOf(r), 0);
  const revWritten = plan.rev !== previousRev;
  const statements = chunks.reduce((n, g) => n + g.length, 0) + (revWritten ? 1 : 0);
  log(
    `d1 ${target.name}: ${plan.inserts.length} new, ${plan.updates.length} changed, ${plan.deletes.length} removed, ` +
      `${plan.unchanged} unchanged; rev ${previousRev ?? "none"} → ${plan.rev}${opts.dryRun ? " (dry run)" : ""}`,
  );
  if (!opts.dryRun) {
    let done = 0;
    for (const chunk of chunks) {
      await target.write([chunk]);
      done++;
      log(`d1 ${target.name}: chunk ${done}/${chunks.length} written`);
    }
    if (revWritten) {
      await target.write([[stmt("INSERT OR REPLACE INTO meta (k, v) VALUES ('corpus_rev', ?)", plan.rev)]]);
    }
  }
  if (revWritten) rowsWritten += 1;
  return {
    target: target.name,
    rev: plan.rev,
    previousRev,
    inserted: plan.inserts.length,
    updated: plan.updates.length,
    deleted: plan.deletes.length,
    unchanged: plan.unchanged,
    statements,
    rowsWritten,
    shiurim: [...shiurim].sort(),
    revWritten,
    dryRun: opts.dryRun === true,
  };
}
