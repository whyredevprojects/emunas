/**
 * From `.corpus/search/moments.ndjson` (search-core MomentRows) to what the index holds:
 *
 * - one D1 record per moment (`moments` row, `moment_entities`, per-language `moment_text`
 *   display text and per-language FTS text from search-core `momentSearchText`);
 * - one embedding unit per (moment, language) for every kind except `writeup` (write-up
 *   paragraphs are lexical only, tech-live §5.3).
 *
 * Input rows are checked field by field against search-core's allow-list: a row with an
 * unknown or forbidden key is rejected, so nothing outside the allow-list can be copied into
 * D1 or Vectorize even if the NDJSON were tampered with.
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  FORBIDDEN_SEARCH_KEYS,
  MOMENT_ENTITY_FIELDS,
  MOMENT_FACET_FIELDS,
  MOMENT_ROW_FIELDS,
  MOMENT_ROW_KINDS,
  momentSearchText,
  type MomentRow,
} from "@emunas/search-core";
import { normalizeHe } from "@emunas/normalize/fold";

export type Lang = "en" | "yi";
export const LANGS: readonly Lang[] = ["en", "yi"];

/** `moment_entities.type`; mirrors `ENTITY_TYPES` in src/contract.ts (sync/test/rows.test.ts checks). */
export const ENTITY_TYPES = ["work", "person", "concept", "topic"] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

/** MomentRow.entities field (corpus ids) → `moment_entities.type`. */
export const ENTITY_FIELD_TYPES = {
  works: "work",
  people: "person",
  concepts: "concept",
  topics: "topic",
} as const satisfies Record<(typeof MOMENT_ENTITY_FIELDS)[number], EntityType>;

/** Vectorize id limit (bytes); mirrors `VECTOR_ID_MAX_BYTES` in src/contract.ts. */
export const VECTOR_ID_MAX_BYTES = 64;

/** FNV-1a (32-bit) of the UTF-16 code units, 8 lowercase hex digits; mirrors src/contract.ts. */
export function fnv1a32Hex(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * `<momentId>@<lang>`, the id the Worker's `parseVectorId` reads back. A moment id too long for
 * that gets the alias `<shiurId head>~h<fnv1a32(shiurId)>~<local>@<lang>`, which the Worker
 * resolves against D1 (mirrors `vectorIdFor` in src/contract.ts; sync/test/rows.test.ts checks
 * that both agree).
 */
export function vectorIdFor(momentId: string, lang: Lang): string {
  const plain = `${momentId}@${lang}`;
  const cut = momentId.indexOf("~");
  if (utf8Bytes(plain) <= VECTOR_ID_MAX_BYTES || cut <= 0) return plain;
  const shiurId = momentId.slice(0, cut);
  const tail = `~h${fnv1a32Hex(shiurId)}${momentId.slice(cut)}@${lang}`;
  // Shiur ids are ASCII; an id that still does not fit stays long and is skipped (wantedUnits).
  return `${shiurId.slice(0, Math.max(1, VECTOR_ID_MAX_BYTES - utf8Bytes(tail)))}${tail}`;
}

/** Confidence written for `soft` items (C7: 0.6–0.75; the lower bound, the exact value is not published). */
export const SOFT_CONFIDENCE = 0.6;

export interface MomentRecord {
  id: string;
  shiurId: string;
  hash: string;
  /** `moments` columns, in insert order. */
  moment: {
    id: string;
    shiur_id: string;
    kind: string;
    t: number;
    end_t: number | null;
    audio_lang: Lang;
    category: string;
    occasion: string | null;
    series: string | null;
    year: number | null;
    catalogued: 0 | 1;
    confidence: number | null;
    title_en: string | null;
    title_yi: string | null;
    hash: string;
  };
  /** `moment_entities` rows: corpus ids per type. */
  entities: { type: EntityType; entityId: string }[];
  /** Display text per language (moment_text). */
  texts: { lang: Lang; title: string | null; body: string }[];
  /** Search-form text per language (fts_words, fts_tri). */
  fts: { lang: Lang; title: string; body: string }[];
}

export interface VectorUnit {
  /** `vectorIdFor(momentId, lang)`: `<momentId>@<lang>`, or its alias when that is over 64 bytes. */
  vectorId: string;
  momentId: string;
  lang: Lang;
  /** Display text that is embedded (title and body, normalizeHe). */
  text: string;
  /** Sync diff key: the moment's content hash. */
  hash: string;
  metadata: VectorMetadata;
}

/** Exactly the metadata the Worker's contract names (src/contract.ts). Never sent to clients. */
export interface VectorMetadata {
  shiurId: string;
  t: number;
  hash: string;
  audio_lang: Lang;
  kind: string;
  category: string;
  year?: number;
}

export const VECTOR_METADATA_KEYS = ["audio_lang", "category", "hash", "kind", "shiurId", "t", "year"] as const;

// ------------------------------------------------------------------------------- validation

const ROW_KEYS = new Set<string>(MOMENT_ROW_FIELDS);
const ENTITY_KEYS = new Set<string>(MOMENT_ENTITY_FIELDS);
const FACET_KEYS = new Set<string>(MOMENT_FACET_FIELDS);
const FORBIDDEN = new Set<string>(FORBIDDEN_SEARCH_KEYS);
const KINDS = new Set<string>(MOMENT_ROW_KINDS);

export class RowError extends Error {}

function exactKeys(o: Record<string, unknown>, allowed: ReadonlySet<string>, where: string): void {
  for (const k of Object.keys(o)) {
    if (FORBIDDEN.has(k)) throw new RowError(`${where}: forbidden key "${k}"`);
    if (!allowed.has(k)) throw new RowError(`${where}: unknown key "${k}"`);
  }
  for (const k of allowed) if (!(k in o)) throw new RowError(`${where}: missing key "${k}"`);
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const isStrOrNull = (x: unknown): x is string | null => x === null || typeof x === "string";
const isStrArr = (x: unknown): x is string[] => Array.isArray(x) && x.every((v) => typeof v === "string");

/** Checks one parsed NDJSON value against the MomentRow allow-list and types. */
export function parseMomentRow(x: unknown, where = "row"): MomentRow {
  if (!isObj(x)) throw new RowError(`${where}: not an object`);
  exactKeys(x, ROW_KEYS, where);
  const id = x["id"];
  if (typeof id !== "string" || id.length === 0) throw new RowError(`${where}: bad id`);
  const w = `${where} ${id}`;
  if (typeof x["shiurId"] !== "string" || !id.startsWith(`${x["shiurId"]}~`)) throw new RowError(`${w}: bad shiurId`);
  if (typeof x["kind"] !== "string" || !KINDS.has(x["kind"])) throw new RowError(`${w}: bad kind`);
  if (typeof x["t"] !== "number" || !Number.isFinite(x["t"])) throw new RowError(`${w}: bad t`);
  if (x["end"] !== null && (typeof x["end"] !== "number" || !Number.isFinite(x["end"]))) throw new RowError(`${w}: bad end`);
  if (x["lang"] !== "en" && x["lang"] !== "yi") throw new RowError(`${w}: bad lang`);
  for (const k of ["title_en", "title_yi", "body_en", "body_yi"]) if (!isStrOrNull(x[k])) throw new RowError(`${w}: bad ${k}`);
  if (typeof x["hash"] !== "string" || !/^[0-9a-f]{16,128}$/.test(x["hash"])) throw new RowError(`${w}: bad hash`);
  const e = x["entities"];
  if (!isObj(e)) throw new RowError(`${w}: bad entities`);
  exactKeys(e, ENTITY_KEYS, `${w} entities`);
  for (const k of ENTITY_KEYS) if (!isStrArr(e[k])) throw new RowError(`${w}: bad entities.${k}`);
  const f = x["facets"];
  if (!isObj(f)) throw new RowError(`${w}: bad facets`);
  exactKeys(f, FACET_KEYS, `${w} facets`);
  if (typeof f["category"] !== "string") throw new RowError(`${w}: bad facets.category`);
  for (const k of ["occasion", "series"]) if (!isStrOrNull(f[k])) throw new RowError(`${w}: bad facets.${k}`);
  if (f["year"] !== null && !Number.isInteger(f["year"])) throw new RowError(`${w}: bad facets.year`);
  for (const k of ["catalogued", "soft"]) if (typeof f[k] !== "boolean") throw new RowError(`${w}: bad facets.${k}`);
  return x as unknown as MomentRow;
}

/** Reads and validates `moments.ndjson`. Duplicate ids are an error. */
export function readMomentsNdjson(path: string): MomentRow[] {
  return parseMomentsNdjson(readFileSync(path, "utf8"), path);
}

export function parseMomentsNdjson(text: string, where = "moments.ndjson"): MomentRow[] {
  const rows: MomentRow[] = [];
  const seen = new Set<string>();
  text.split("\n").forEach((line, i) => {
    if (line.trim().length === 0) return;
    let v: unknown;
    try {
      v = JSON.parse(line);
    } catch {
      throw new RowError(`${where}:${i + 1}: invalid JSON`);
    }
    const row = parseMomentRow(v, `${where}:${i + 1}`);
    if (seen.has(row.id)) throw new RowError(`${where}:${i + 1}: duplicate id ${row.id}`);
    seen.add(row.id);
    rows.push(row);
  });
  return rows;
}

// ------------------------------------------------------------------------------- mapping

const display = (s: string | null): string | null => (s === null ? null : normalizeHe(s));

/**
 * Languages a row has text in. A write-up paragraph carries its section title in both
 * languages but a body only in its own, so a title without a body counts only when the row
 * has no body at all (insights, key points, takeaways: the title is the text).
 */
export function rowLangs(row: MomentRow): Lang[] {
  const noBody = row.body_en === null && row.body_yi === null;
  return LANGS.filter((l) => {
    const title = l === "en" ? row.title_en : row.title_yi;
    const body = l === "en" ? row.body_en : row.body_yi;
    return body !== null || (noBody && title !== null);
  });
}

export function toMomentRecord(row: MomentRow): MomentRecord {
  const langs = rowLangs(row);
  const texts: MomentRecord["texts"] = [];
  const fts: MomentRecord["fts"] = [];
  for (const lang of langs) {
    const title = display(lang === "en" ? row.title_en : row.title_yi);
    const body = display(lang === "en" ? row.body_en : row.body_yi);
    texts.push(body === null ? { lang, title: null, body: title ?? "" } : { lang, title, body });
    const s = momentSearchText(row, lang);
    if (s !== null) fts.push({ lang, title: s.title, body: s.body });
  }
  const entities: MomentRecord["entities"] = MOMENT_ENTITY_FIELDS.flatMap((field) =>
    row.entities[field].map((entityId) => ({ type: ENTITY_FIELD_TYPES[field], entityId })),
  );
  // PRIMARY KEY (moment_id, type, entity_id): drop duplicates.
  const seen = new Set<string>();
  const uniqueEntities = entities.filter((e) => {
    const k = `${e.type}\u0000${e.entityId}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return {
    id: row.id,
    shiurId: row.shiurId,
    hash: row.hash,
    moment: {
      id: row.id,
      shiur_id: row.shiurId,
      kind: row.kind,
      t: row.t,
      end_t: row.end,
      audio_lang: row.lang,
      category: row.facets.category,
      occasion: row.facets.occasion,
      series: row.facets.series,
      year: row.facets.year,
      catalogued: row.facets.catalogued ? 1 : 0,
      confidence: row.facets.soft ? SOFT_CONFIDENCE : null,
      title_en: display(row.title_en),
      title_yi: display(row.title_yi),
      hash: row.hash,
    },
    entities: uniqueEntities,
    texts,
    fts,
  };
}

/** Kinds that get vectors (tech-live §5.3: write-up paragraphs are lexical only). */
export function hasVectors(row: MomentRow): boolean {
  return row.kind !== "writeup";
}

export function toVectorUnits(row: MomentRow): VectorUnit[] {
  if (!hasVectors(row)) return [];
  return rowLangs(row).map((lang) => {
    const title = display(lang === "en" ? row.title_en : row.title_yi);
    const body = display(lang === "en" ? row.body_en : row.body_yi);
    const metadata: VectorMetadata = {
      shiurId: row.shiurId,
      t: row.t,
      hash: row.hash,
      audio_lang: row.lang,
      kind: row.kind,
      category: row.facets.category,
      ...(row.facets.year !== null ? { year: row.facets.year } : {}),
    };
    return {
      vectorId: vectorIdFor(row.id, lang),
      momentId: row.id,
      lang,
      text: [title, body].filter((s): s is string => s !== null && s.length > 0).join("\n"),
      hash: row.hash,
      metadata,
    };
  });
}

export function utf8Bytes(s: string): number {
  return Buffer.byteLength(s, "utf8");
}

/**
 * The index revision: sha256 over the sorted `id hash` pairs. It depends only on content, so
 * an unchanged corpus keeps its revision (no write, no Worker cache churn).
 */
export function corpusRevOf(rows: readonly { id: string; hash: string }[]): string {
  const h = createHash("sha256");
  for (const r of [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) h.update(`${r.id} ${r.hash}\n`);
  return `m1-${h.digest("hex").slice(0, 16)}`;
}

/**
 * A stable FTS5 rowid per (moment, language), so a changed or removed moment's FTS rows are
 * deleted by rowid (an index lookup) instead of a scan of the UNINDEXED id column.
 * 48 bits of sha256: a collision among ~70k keys is about 1e-5 likely, and one would fail
 * the insert loudly (rowid constraint) rather than corrupt the index.
 */
export function ftsRowid(momentId: string, lang: Lang): number {
  const d = createHash("sha256").update(`${momentId}@${lang}`).digest();
  // +1 so 0 is never used.
  return d.readUIntBE(0, 6) + 1;
}
