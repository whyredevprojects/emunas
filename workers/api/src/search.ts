/**
 * GET /api/search: hybrid moment search over D1 FTS5 (word + trigram tables) and Vectorize,
 * fused with reciprocal-rank fusion and grouped by shiur.
 *
 * What can reach a response: moment ids, shiur ids, kind, times, the generated display
 * titles (moments.title_en/title_yi), a snippet cut from moment_text (generated text), and
 * scores. Nothing else is selected from D1, and nothing from Vectorize metadata is passed on.
 */
import { BadRequest, error, json } from "./http.ts";
import type { Env } from "./env.ts";
import { parseSearchParams, canonicalSearchKey, type SearchFilters, type SearchParams } from "./params.ts";
import { normalizeQuery, type NormalizedQuery } from "./query.ts";
import { trigramMatch, wordsMatch } from "./fts.ts";
import { filterClause, vectorFilter } from "./filters.ts";
import { adjust, groupByShiur, roundScore, rrf, type Scored } from "./rank.ts";
import { decodeCursor, encodeCursor } from "./cursor.ts";
import { makeSnippet, findMarks, queryTokenSet } from "./snippet.ts";
import { fnv1a32Hex, isKind, isLang, parseVectorId, type Kind, type Lang, type Matched, type SearchResponse, type SearchResult, type Snippet } from "./contract.ts";

export const LEXICAL_TOP_K = 100;
export const VECTOR_TOP_K = 50;
export const MAX_CANDIDATES = 200;
export const DEFAULT_EMBED_MODEL = "@cf/baai/bge-m3";
export const CACHE_TTL_SECONDS = 600;

export class SemanticUnavailable extends Error {}

export interface MomentFacts {
  id: string;
  shiurId: string;
  kind: Kind;
  t: number;
  end: number | null;
  titleEn: string | null;
  titleYi: string | null;
  catalogued: boolean;
  confidence: number | null;
  audioLang: Lang;
}

interface MomentDbRow {
  id: string;
  shiur_id: string;
  kind: string;
  t: number;
  end_t: number | null;
  title_en: string | null;
  title_yi: string | null;
  catalogued: number;
  confidence: number | null;
  audio_lang: string;
}

/** The only column list ever selected from `moments` for a response. */
export const MOMENT_COLUMNS = "m.id, m.shiur_id, m.kind, m.t, m.end_t, m.title_en, m.title_yi, m.catalogued, m.confidence, m.audio_lang";

export function toFacts(r: MomentDbRow): MomentFacts | null {
  if (!isKind(r.kind) || !isLang(r.audio_lang)) return null;
  return {
    id: r.id,
    shiurId: r.shiur_id,
    kind: r.kind,
    t: r.t,
    end: r.end_t,
    titleEn: r.title_en,
    titleYi: r.title_yi,
    catalogued: r.catalogued === 1,
    confidence: r.confidence,
    audioLang: r.audio_lang,
  };
}

export async function corpusRev(db: D1Database): Promise<string> {
  const row = await db.prepare("SELECT v FROM meta WHERE k = 'corpus_rev'").first<{ v: string }>();
  return row?.v ?? "empty";
}

interface LexicalHit {
  id: string;
  lang: string;
}

async function lexical(
  db: D1Database,
  table: "fts_words" | "fts_tri",
  match: string | null,
  filters: SearchFilters,
): Promise<LexicalHit[]> {
  if (match === null) return [];
  const where = filterClause(filters);
  const sql =
    `SELECT ${table}.id AS id, ${table}.lang AS lang FROM ${table} JOIN moments m ON m.id = ${table}.id ` +
    `WHERE ${table} MATCH ? AND ${where.sql} ORDER BY bm25(${table}, 0.0, 0.0, 4.0, 1.0) LIMIT ?`;
  const { results } = await db.prepare(sql).bind(match, ...where.params, LEXICAL_TOP_K).all<LexicalHit>();
  return results;
}

function embeddingOf(result: unknown): number[] | null {
  if (typeof result !== "object" || result === null) return null;
  const data = (result as { data?: unknown }).data;
  if (!Array.isArray(data)) return null;
  const first: unknown = data[0];
  if (!Array.isArray(first) || first.length === 0 || !first.every((x) => typeof x === "number")) return null;
  return first as number[];
}

async function semantic(env: Env, q: string, filters: SearchFilters): Promise<string[]> {
  let vector: number[] | null;
  try {
    vector = embeddingOf(await env.AI.run(env.EMBED_MODEL ?? DEFAULT_EMBED_MODEL, { text: [q] }));
  } catch {
    throw new SemanticUnavailable("embedding failed");
  }
  if (vector === null) throw new SemanticUnavailable("embedding malformed");
  const filter = vectorFilter(filters);
  let matches: VectorizeMatches;
  try {
    matches = await env.VEC.query(vector, {
      topK: VECTOR_TOP_K,
      returnMetadata: "none",
      ...(Object.keys(filter).length > 0 ? { filter } : {}),
    });
  } catch {
    throw new SemanticUnavailable("vectorize failed");
  }
  const ids = await momentIdsOfVectors(env.DB_SEARCH, matches.matches.map((m) => m.id));
  return [...new Set(ids.filter((id): id is string => id !== null))];
}

const globLiteral = (s: string): string => s.replace(/[*?[]/g, (c) => `[${c}]`);

/**
 * The moment id of each Vectorize id (same order and length). A plain id names its moment; an
 * alias (an over-long moment id, see `vectorIdFor`) is resolved against the shiur ids in D1. An id
 * that does not parse or resolve maps to null.
 */
export async function momentIdsOfVectors(db: D1Database, vectorIds: readonly string[]): Promise<(string | null)[]> {
  const parsed = vectorIds.map(parseVectorId);
  const heads = [...new Set(parsed.flatMap((p) => (p?.alias ? [p.alias.shiurHead] : [])))];
  const shiurIds: string[] = [];
  if (heads.length > 0) {
    const sql = `SELECT DISTINCT shiur_id FROM moments WHERE ${heads.map(() => "shiur_id GLOB ?").join(" OR ")}`;
    const { results } = await db
      .prepare(sql)
      .bind(...heads.map((h) => `${globLiteral(h)}*`))
      .all<{ shiur_id: string }>();
    for (const r of results) shiurIds.push(r.shiur_id);
  }
  return parsed.map((p) => {
    if (!p) return null;
    if (!p.alias) return p.momentId;
    const { shiurHead, shiurHash, local } = p.alias;
    const shiurId = shiurIds.find((id) => id.startsWith(shiurHead) && fnv1a32Hex(id) === shiurHash);
    return shiurId === undefined ? null : `${shiurId}${local}`;
  });
}

/** Moment rows for candidate ids that pass every filter (vector hits are filtered here). */
export async function hydrate(db: D1Database, ids: readonly string[], filters: SearchFilters | null): Promise<Map<string, MomentFacts>> {
  const out = new Map<string, MomentFacts>();
  if (ids.length === 0) return out;
  const where = filters ? filterClause(filters) : { sql: "1", params: [] };
  const sql = `SELECT ${MOMENT_COLUMNS} FROM moments m WHERE m.id IN (SELECT value FROM json_each(?)) AND ${where.sql}`;
  const { results } = await db.prepare(sql).bind(JSON.stringify(ids), ...where.params).all<MomentDbRow>();
  for (const r of results) {
    const f = toFacts(r);
    if (f) out.set(f.id, f);
  }
  return out;
}

interface TextRow {
  id: string;
  lang: string;
  title: string | null;
  body: string;
}

async function displayTexts(db: D1Database, ids: readonly string[]): Promise<Map<string, Map<Lang, TextRow>>> {
  const out = new Map<string, Map<Lang, TextRow>>();
  if (ids.length === 0) return out;
  const { results } = await db
    .prepare("SELECT id, lang, title, body FROM moment_text WHERE id IN (SELECT value FROM json_each(?))")
    .bind(JSON.stringify(ids))
    .all<TextRow>();
  for (const r of results) {
    if (!isLang(r.lang)) continue;
    const byLang = out.get(r.id) ?? new Map<Lang, TextRow>();
    byLang.set(r.lang, r);
    out.set(r.id, byLang);
  }
  return out;
}

function pickSnippet(texts: Map<Lang, TextRow> | undefined, ui: Lang, lexLang: Lang | undefined, tokens: readonly string[]): Snippet | null {
  if (!texts || texts.size === 0) return null;
  const order: Lang[] = [ui, ...(lexLang && lexLang !== ui ? [lexLang] : []), ui === "en" ? "yi" : "en"];
  const candidates = [...new Set(order)].map((l) => texts.get(l)).filter((t): t is TextRow => t !== undefined);
  let fallback: Snippet | null = null;
  for (const row of candidates) {
    const lang = row.lang as Lang;
    const s = makeSnippet(row.body, lang, tokens);
    if (s.marks.length > 0) return s;
    fallback ??= s;
  }
  return fallback;
}

function titleMatches(f: MomentFacts, texts: Map<Lang, TextRow> | undefined, tokens: readonly string[]): boolean {
  const titles = [f.titleEn, f.titleYi, texts?.get("en")?.title ?? null, texts?.get("yi")?.title ?? null];
  return titles.some((t) => t !== null && findMarks(t, tokens).length > 0);
}

export interface SearchOutcome {
  body: SearchResponse;
  /** False when hybrid search fell back to lexical only (not cached). */
  complete: boolean;
}

export async function runSearch(env: Env, p: SearchParams, rev: string, started: number): Promise<SearchOutcome | Response> {
  let offset = 0;
  if (p.cursor !== null) {
    const c = decodeCursor(p.cursor);
    if (c === null) return error("bad_request", "cursor");
    if (c.rev !== rev) return error("stale_cursor", "cursor");
    offset = c.offset;
  }

  const nq: NormalizedQuery = normalizeQuery(p.q);
  if (nq.tokens.length === 0 && p.mode !== "semantic") return error("bad_request", "q");

  const wantLexical = p.mode !== "semantic";
  const wantSemantic = p.mode !== "lexical";
  const db = env.DB_SEARCH;

  const [words, tri, vec] = await Promise.all([
    wantLexical ? lexical(db, "fts_words", wordsMatch(nq), p.filters) : Promise.resolve([]),
    wantLexical ? lexical(db, "fts_tri", trigramMatch(nq), p.filters) : Promise.resolve([]),
    wantSemantic
      ? semantic(env, p.q, p.filters).catch((e: unknown) => {
          if (e instanceof SemanticUnavailable && p.mode === "hybrid") return null;
          throw e;
        })
      : Promise.resolve([] as string[]),
  ]);

  const lexLang = new Map<string, Lang>();
  for (const h of [...words, ...tri]) if (!lexLang.has(h.id) && isLang(h.lang)) lexLang.set(h.id, h.lang);
  const wordIds = words.map((h) => h.id);
  const triIds = tri.map((h) => h.id);
  const vecIds = vec ?? [];

  const candidates = [...new Set([...wordIds, ...triIds, ...vecIds])].slice(0, MAX_CANDIDATES);
  const facts = await hydrate(db, candidates, p.filters);
  const fused = rrf([wordIds, triIds, vecIds].map((l) => l.filter((id) => facts.has(id))));

  const scored: Scored[] = [];
  for (const [id, score] of fused) {
    const f = facts.get(id);
    if (f) scored.push({ id, shiurId: f.shiurId, score: adjust(score, f) });
  }
  const { ordered, groups } = groupByShiur(scored);
  const page = ordered.slice(offset, offset + p.limit);
  const texts = await displayTexts(db, page.map((s) => s.id));
  const tokens = queryTokenSet(nq);

  const results: SearchResult[] = [];
  for (const s of page) {
    const f = facts.get(s.id);
    if (!f) continue;
    const t = texts.get(s.id);
    const lexical = lexLang.has(s.id);
    const matched: Matched = lexical ? (titleMatches(f, t, tokens) ? "title" : "text") : "semantic";
    results.push({
      momentId: f.id,
      shiurId: f.shiurId,
      kind: f.kind,
      t: f.t,
      end: f.end,
      title: { en: f.titleEn, yi: f.titleYi },
      matched,
      snippet: pickSnippet(t, p.ui, lexLang.get(s.id), tokens),
      score: roundScore(s.score),
    });
  }

  const nextOffset = offset + p.limit;
  return {
    body: {
      rev,
      tookMs: Date.now() - started,
      results,
      groups,
      next: nextOffset < ordered.length ? encodeCursor({ offset: nextOffset, rev }) : null,
    },
    complete: !(wantSemantic && vec === null),
  };
}

function cacheKey(p: SearchParams, rev: string): Request {
  return new Request(`https://emunas-api.cache/api/search?${canonicalSearchKey(p)}&rev=${encodeURIComponent(rev)}`);
}

export async function handleSearch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const started = Date.now();
  let p: SearchParams;
  try {
    p = parseSearchParams(new URL(request.url).searchParams);
  } catch (e) {
    if (e instanceof BadRequest) return error("bad_request", e.param);
    throw e;
  }

  const rev = await corpusRev(env.DB_SEARCH);
  const key = cacheKey(p, rev);
  const cache = caches.default;
  const hit = await cache.match(key);
  if (hit) {
    return new Response(hit.body, {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "x-emunas-cache": "hit",
      },
    });
  }

  let outcome: SearchOutcome | Response;
  try {
    outcome = await runSearch(env, p, rev, started);
  } catch (e) {
    if (e instanceof SemanticUnavailable) return error("unavailable");
    throw e;
  }
  if (outcome instanceof Response) return outcome;

  const text = JSON.stringify(outcome.body);
  if (outcome.complete) {
    const stored = new Response(text, {
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": `public, max-age=${CACHE_TTL_SECONDS}` },
    });
    ctx.waitUntil(cache.put(key, stored));
  }
  return json(outcome.body, 200, { "x-emunas-cache": "miss" });
}
