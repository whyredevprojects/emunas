/**
 * The public contract of emunas-api: response shapes, the exact key lists tests hold
 * responses to, and the vector-id scheme shared with the index sync (W3.10).
 *
 * Responses are always built field by field from these types (copy allowed, never strip),
 * so a column added to D1 later cannot reach a client unless it is mapped here on purpose.
 */

export const KINDS = ["shiur", "section", "insight", "question", "takeaway", "story", "keypoint", "writeup"] as const;
export type Kind = (typeof KINDS)[number];

export const LANGS = ["en", "yi"] as const;
export type Lang = (typeof LANGS)[number];

export const MODES = ["hybrid", "lexical", "semantic"] as const;
export type Mode = (typeof MODES)[number];

/**
 * `moment_entities.type` values, which are also the search filter parameter names. Entity ids are
 * corpus ids (`data/derived/corpus`, via the search-core MomentRow); `topic` is the corpus topic
 * tree (section rows: the chapter's topics; other rows: the shiur's topics at salience >= 0.6).
 */
export const ENTITY_TYPES = ["work", "person", "concept", "topic"] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

/** How a result matched: words in its generated title, words in its generated text, or meaning only. */
export type Matched = "title" | "text" | "semantic";

export interface Title {
  en: string | null;
  yi: string | null;
}

/** A snippet cut from generated text in D1. `marks` are [start, end) UTF-16 offsets into `text`. */
export interface Snippet {
  text: string;
  lang: Lang;
  marks: [number, number][];
}

export interface SearchResult {
  momentId: string;
  shiurId: string;
  kind: Kind;
  t: number;
  end: number | null;
  title: Title;
  matched: Matched;
  snippet: Snippet | null;
  score: number;
}

export interface SearchGroup {
  shiurId: string;
  count: number;
}

export interface SearchResponse {
  rev: string;
  tookMs: number;
  results: SearchResult[];
  groups: SearchGroup[];
  next: string | null;
}

export interface SimilarResult {
  momentId: string;
  shiurId: string;
  kind: Kind;
  t: number;
  end: number | null;
  title: Title;
  score: number;
}

export interface SimilarResponse {
  rev: string;
  results: SimilarResult[];
}

export type Health = "ok" | "error";
export interface HealthResponse {
  rev: string;
  d1: Health;
  vectorize: Health;
}

export interface FeedbackAccepted {
  id: string;
}

export const FEEDBACK_FIELDS = ["source", "person", "time", "summary", "other"] as const;
export type FeedbackField = (typeof FEEDBACK_FIELDS)[number];
export const FEEDBACK_REASONS = ["wrong-source", "wrong-name", "wrong-time", "misrepresents", "other"] as const;
export type FeedbackReason = (typeof FEEDBACK_REASONS)[number];
/** Which recording was playing when the report was sent: the AI-improved copy or the original. */
export const FEEDBACK_AUDIO = ["cleaned", "original"] as const;
export type FeedbackAudio = (typeof FEEDBACK_AUDIO)[number];
export const FEEDBACK_STATUSES = ["open", "done", "rejected"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

/** Admin export row. ua_hash is not exported. */
export interface FeedbackRow {
  id: string;
  createdAt: string;
  shiurId: string;
  momentId: string | null;
  field: FeedbackField | null;
  reason: FeedbackReason;
  text: string | null;
  ui: Lang;
  rev: string;
  /** null when no recording was playing or the client did not say. */
  audio: FeedbackAudio | null;
  status: FeedbackStatus;
}

/** Exact key lists (sorted) used by tests and by the runtime self-check in `assertKeys`. */
export const ALLOWED_KEYS = {
  search: ["groups", "next", "results", "rev", "tookMs"],
  searchResult: ["end", "kind", "matched", "momentId", "score", "shiurId", "snippet", "t", "title"],
  title: ["en", "yi"],
  snippet: ["lang", "marks", "text"],
  group: ["count", "shiurId"],
  similar: ["results", "rev"],
  similarResult: ["end", "kind", "momentId", "score", "shiurId", "t", "title"],
  health: ["d1", "rev", "vectorize"],
  feedbackAccepted: ["id"],
  adminList: ["items"],
  feedbackRow: ["audio", "createdAt", "field", "id", "momentId", "reason", "rev", "shiurId", "status", "text", "ui"],
  error: ["error", "param"],
} as const satisfies Record<string, readonly string[]>;

/**
 * Vectorize ids: one vector per (moment, language), id `<momentId>@<lang>`, metadata
 * `{ shiurId, t, hash, audio_lang, kind, category, year }` (the last four are the declared
 * metadata indexes). Vectorize ids are limited to 64 bytes; the sync must check that.
 *
 * A moment id too long for that (shiur ids run to 64 characters) gets a short alias
 * `<shiurId head>~h<fnv1a32(shiurId)>~<local>@<lang>`: the shiur id is cut to fit and tagged with
 * its hash, the moment's own `~<local>` part is kept. Plain moment ids hold one `~`, an alias two,
 * so the forms never collide. The Worker resolves an alias against D1 (`resolveVectorIds`).
 * The index sync mirrors this in sync/src/rows.ts.
 */
export const VECTOR_ID_MAX_BYTES = 64;

export interface VectorAlias {
  /** Leading characters of the shiur id. */
  shiurHead: string;
  /** `fnv1a32Hex` of the whole shiur id. */
  shiurHash: string;
  /** The moment's part after the shiur id, with its `~` (e.g. `~kp0`). */
  local: string;
}

export type ParsedVectorId = { momentId: string; lang: Lang; alias?: undefined } | { momentId: null; lang: Lang; alias: VectorAlias };

const utf8Length = (s: string): number => new TextEncoder().encode(s).length;

/** FNV-1a (32-bit) of the UTF-16 code units, 8 lowercase hex digits. */
export function fnv1a32Hex(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function vectorIdFor(momentId: string, lang: Lang): string {
  const plain = `${momentId}@${lang}`;
  const cut = momentId.indexOf("~");
  if (utf8Length(plain) <= VECTOR_ID_MAX_BYTES || cut <= 0) return plain;
  const shiurId = momentId.slice(0, cut);
  const tail = `~h${fnv1a32Hex(shiurId)}${momentId.slice(cut)}@${lang}`;
  // Shiur ids are ASCII; an id that still does not fit is left long and skipped by the sync.
  return `${shiurId.slice(0, Math.max(1, VECTOR_ID_MAX_BYTES - utf8Length(tail)))}${tail}`;
}

export function parseVectorId(id: string): ParsedVectorId | null {
  const at = id.lastIndexOf("@");
  if (at <= 0) return null;
  const lang = id.slice(at + 1);
  if (lang !== "en" && lang !== "yi") return null;
  const momentId = id.slice(0, at);
  const m = /^([^~]+)~h([0-9a-f]{8})(~[^~]+)$/.exec(momentId);
  if (m) return { momentId: null, lang, alias: { shiurHead: m[1]!, shiurHash: m[2]!, local: m[3]! } };
  return { momentId, lang };
}

export function isKind(v: string): v is Kind {
  return (KINDS as readonly string[]).includes(v);
}

export function isLang(v: string): v is Lang {
  return v === "en" || v === "yi";
}
