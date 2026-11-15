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

export const ENTITY_TYPES = ["work", "person", "concept"] as const;
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
  feedbackRow: ["createdAt", "field", "id", "momentId", "reason", "rev", "shiurId", "status", "text", "ui"],
  error: ["error", "param"],
} as const satisfies Record<string, readonly string[]>;

/**
 * Vectorize ids: one vector per (moment, language), id `<momentId>@<lang>`, metadata
 * `{ shiurId, t, hash, audio_lang, kind, category, year }` (the last four are the declared
 * metadata indexes). Vectorize ids are limited to 64 bytes; the sync must check that.
 */
export const VECTOR_ID_MAX_BYTES = 64;

export function vectorIdFor(momentId: string, lang: Lang): string {
  return `${momentId}@${lang}`;
}

export function parseVectorId(id: string): { momentId: string; lang: Lang } | null {
  const at = id.lastIndexOf("@");
  if (at <= 0) return null;
  const lang = id.slice(at + 1);
  if (lang !== "en" && lang !== "yi") return null;
  return { momentId: id.slice(0, at), lang };
}

export function isKind(v: string): v is Kind {
  return (KINDS as readonly string[]).includes(v);
}

export function isLang(v: string): v is Lang {
  return v === "en" || v === "yi";
}
