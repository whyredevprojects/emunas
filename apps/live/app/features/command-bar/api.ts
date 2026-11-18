/**
 * Client for `GET /api/search` (emunas-api, W2.6; tech-live §5.4).
 *
 * The response is **copied field by field** from an allow-list (never spread or stripped), so a key
 * the API might add later, or a planted field such as `heardAs`, can never reach the page: the UI only
 * ever sees what `parseSearchResponse` returns. Text the UI can show from a response is limited to
 * `title.{en,yi}` and `snippet.text`, both generated text from D1 (integration-plan §0.1). Highlights
 * come as `[start, end)` offsets and are rendered client-side (`highlight.ts`); no HTML is accepted.
 *
 * `API_RESPONSE_KEYS` must equal the Worker's `ALLOWED_KEYS` (`workers/api/src/contract.ts`); a test
 * holds them together.
 */
import type { Ed } from "@emunas/corpus/public";

export const API_KINDS = ["shiur", "section", "insight", "question", "takeaway", "story", "keypoint", "writeup"] as const;
export type ApiKind = (typeof API_KINDS)[number];
export type ApiMatched = "title" | "text" | "semantic";

export interface ApiSnippet {
  text: string;
  lang: Ed;
  marks: [number, number][];
}

export interface ApiResult {
  momentId: string;
  shiurId: string;
  kind: ApiKind;
  t: number;
  end: number | null;
  title: { en: string | null; yi: string | null };
  matched: ApiMatched;
  snippet: ApiSnippet | null;
  score: number;
}

export interface ApiResponse {
  rev: string;
  tookMs: number;
  results: ApiResult[];
  groups: { shiurId: string; count: number }[];
  next: string | null;
}

/** The keys this client reads, per object (sorted). Must equal the Worker's `ALLOWED_KEYS` entries. */
export const API_RESPONSE_KEYS = {
  search: ["groups", "next", "results", "rev", "tookMs"],
  searchResult: ["end", "kind", "matched", "momentId", "score", "shiurId", "snippet", "t", "title"],
  title: ["en", "yi"],
  snippet: ["lang", "marks", "text"],
  group: ["count", "shiurId"],
} as const;

/** Entity filter kinds the Worker accepts (`ENTITY_TYPES` in workers/api/src/contract.ts), in URL order. */
export const ENTITY_FILTER_KINDS = ["topic", "concept", "person", "work"] as const;
export type EntityFilterKind = (typeof ENTITY_FILTER_KINDS)[number];

/** Corpus ids per entity kind; a shiur must carry every listed entity. */
export type EntityFilters = Partial<Record<EntityFilterKind, readonly string[]>>;

/** Most ids per kind the Worker accepts (`MAX_LIST_VALUES`). */
export const API_MAX_FILTER_IDS = 10;
/** Corpus ids are ASCII slugs (the Worker rejects anything else with 400). */
const ID_RE = /^[a-z0-9][a-z0-9-]{0,119}$/;

export function isCorpusId(v: string): boolean {
  return ID_RE.test(v);
}

export interface SearchRequest {
  q: string;
  ui: Ed;
  /** Audio-language filter; omitted when both languages are allowed. */
  audio?: Ed[];
  /** Corpus-id entity filters (C3.6). Invalid ids are dropped, not sent. */
  filters?: EntityFilters;
  limit?: number;
  cursor?: string | null;
}

export type ApiFetch = (
  input: string,
  init?: { signal?: AbortSignal | null; headers?: Record<string, string> },
) => Promise<Response>;

export interface ApiConfig {
  /** Origin prepended to `/api/search` (empty = same origin, through the Live Worker's service binding). */
  base: string;
  fetch: ApiFetch;
  /** Abort a request that takes longer than this (ms) and fall back. */
  timeoutMs: number;
}

const envBase = (import.meta.env["VITE_LIVE_API_ORIGIN"] as string | undefined) ?? "";
const defaultFetch: ApiFetch = (input, init) => globalThis.fetch(input, init ?? undefined);
const DEFAULTS: ApiConfig = { base: envBase, fetch: defaultFetch, timeoutMs: 6000 };
let config: ApiConfig = { ...DEFAULTS };

export function configureSearchApi(next: Partial<ApiConfig>): void {
  config = { ...config, ...next };
}

export function resetSearchApi(): void {
  config = { ...DEFAULTS };
}

/** Why a request produced no results. Every reason leads to the shiur-level fallback. */
export type ApiFailure = "offline" | "network" | "timeout" | "http" | "invalid" | "stale";

export class SearchApiError extends Error {
  override name = "SearchApiError";
  constructor(
    readonly reason: ApiFailure,
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Longest query the Worker accepts (`workers/api/src/params.ts` MAX_Q_LENGTH). */
export const API_MAX_Q = 200;

/** The query as the Worker will see it (NFC, collapsed whitespace, length cap). */
export function apiQuery(q: string): string {
  return q.normalize("NFC").replace(/\s+/gu, " ").trim().slice(0, API_MAX_Q).trim();
}

/** Builds the query string the Worker accepts (it rejects unknown parameters with 400). */
export function searchUrl(req: SearchRequest, base = config.base): string {
  const sp = new URLSearchParams();
  sp.set("q", apiQuery(req.q));
  sp.set("ui", req.ui);
  if (req.audio && req.audio.length === 1) sp.set("audio", req.audio.join(","));
  for (const kind of ENTITY_FILTER_KINDS) {
    const ids = [...new Set(req.filters?.[kind] ?? [])].filter(isCorpusId).slice(0, API_MAX_FILTER_IDS);
    if (ids.length > 0) sp.set(kind, ids.join(","));
  }
  if (req.limit !== undefined) sp.set("limit", String(req.limit));
  if (req.cursor) sp.set("cursor", req.cursor);
  return `${base}/api/search?${sp.toString()}`;
}

function isOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

function isAbort(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { name?: unknown }).name === "AbortError";
}

/** Calls `/api/search`. Throws `SearchApiError`, or the caller's `AbortError` when it aborts. */
export async function fetchSearch(req: SearchRequest, opts: { signal?: AbortSignal } = {}): Promise<ApiResponse> {
  if (opts.signal?.aborted) throw new DOMException("aborted", "AbortError");
  if (!isOnline()) throw new SearchApiError("offline", 0, "browser is offline");
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, config.timeoutMs);
  const onAbort = () => ctrl.abort();
  opts.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    let res: Response;
    try {
      res = await config.fetch(searchUrl(req), { signal: ctrl.signal, headers: { accept: "application/json" } });
    } catch (e) {
      if (opts.signal?.aborted) throw isAbort(e) ? e : new DOMException("aborted", "AbortError");
      if (timedOut) throw new SearchApiError("timeout", 0, "search timed out");
      throw new SearchApiError("network", 0, `network error: ${String(e)}`);
    }
    if (res.status === 409) throw new SearchApiError("stale", 409, "stale cursor");
    if (!res.ok) throw new SearchApiError("http", res.status, `HTTP ${res.status}`);
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      if (opts.signal?.aborted) throw new DOMException("aborted", "AbortError");
      throw new SearchApiError("invalid", res.status, "response is not JSON");
    }
    const parsed = parseSearchResponse(body);
    if (!parsed) throw new SearchApiError("invalid", res.status, "response does not match the search contract");
    return parsed;
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onAbort);
  }
}

// ---------------------------------------------------------------------------------------------
// Allow-list copy

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const strOrNull = (v: unknown): string | null | undefined => (v === null ? null : isStr(v) ? v : undefined);

/** Valid, in-range, integer marks only; anything else is dropped (the text still shows, unhighlighted). */
function parseMarks(v: unknown, length: number): [number, number][] | null {
  if (!Array.isArray(v)) return null;
  const out: [number, number][] = [];
  for (const m of v) {
    if (!Array.isArray(m) || m.length !== 2) continue;
    const s: unknown = m[0];
    const e: unknown = m[1];
    if (!isNum(s) || !isNum(e) || !Number.isInteger(s) || !Number.isInteger(e)) continue;
    if (s >= 0 && e > s && e <= length) out.push([s, e]);
  }
  return out;
}

function parseSnippet(v: unknown): ApiSnippet | null | undefined {
  if (v === null || v === undefined) return null;
  if (!isObj(v)) return undefined;
  const text = v["text"];
  const lang = v["lang"];
  if (!isStr(text) || (lang !== "en" && lang !== "yi")) return undefined;
  const marks = parseMarks(v["marks"], text.length);
  if (!marks) return undefined;
  return { text, lang, marks };
}

function parseResult(v: unknown): ApiResult | null {
  if (!isObj(v)) return null;
  const momentId = v["momentId"];
  const shiurId = v["shiurId"];
  const kind = v["kind"];
  const t = v["t"];
  const end = v["end"];
  const title = v["title"];
  const matched = v["matched"];
  const score = v["score"];
  if (!isStr(momentId) || !isStr(shiurId) || !isStr(kind) || !(API_KINDS as readonly string[]).includes(kind)) return null;
  if (!isNum(t) || !(end === null || isNum(end)) || !isNum(score)) return null;
  if (matched !== "title" && matched !== "text" && matched !== "semantic") return null;
  if (!isObj(title)) return null;
  const en = strOrNull(title["en"]);
  const yi = strOrNull(title["yi"]);
  if (en === undefined || yi === undefined) return null;
  const snippet = parseSnippet(v["snippet"]);
  if (snippet === undefined) return null;
  return { momentId, shiurId, kind: kind as ApiKind, t, end, title: { en, yi }, matched, snippet, score };
}

/** Copies a `/api/search` body through the allow-list. `null` when the body does not fit the contract. */
export function parseSearchResponse(body: unknown): ApiResponse | null {
  if (!isObj(body)) return null;
  const rev = body["rev"];
  const tookMs = body["tookMs"];
  const results = body["results"];
  const groups = body["groups"];
  const next = body["next"] ?? null;
  if (!isStr(rev) || !isNum(tookMs) || !Array.isArray(results) || !Array.isArray(groups)) return null;
  if (!(next === null || isStr(next))) return null;
  const rs: ApiResult[] = [];
  for (const r of results) {
    const p = parseResult(r);
    if (!p) return null;
    rs.push(p);
  }
  const gs: ApiResponse["groups"] = [];
  for (const g of groups) {
    if (!isObj(g)) return null;
    const shiurId = g["shiurId"];
    const count = g["count"];
    if (!isStr(shiurId) || !isNum(count)) return null;
    gs.push({ shiurId, count });
  }
  return { rev, tookMs, results: rs, groups: gs, next };
}
