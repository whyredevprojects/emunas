/**
 * What gets indexed (integration-plan C9, C19, W2.2). Both sites index exactly these fields:
 * Pagefind records (Quiet), the MiniSearch quick index (Live), D1 rows and Vectorize (emunas-api).
 *
 * The field lists below are the allow-list. `SearchDoc`/`MomentRow` are checked against them at
 * compile time (`AssertEqual`), and the builders construct objects key by key from a
 * `PublicShiur`, which has no transcript-derived field. The one non-PublicShiur input,
 * `candidateTopics` (derived extraction data, never displayed), lands only in `SearchDoc.keywords`.
 */
import type { Category, Ed, L, MomentKind, PublicShiur, ShiurStatus } from "@emunas/corpus/public";

/** Bump when the shape of a SearchDoc or MomentRow, or the text that feeds a hash, changes. */
export const SEARCH_SCHEMA_VERSION = 1;

// ---------------------------------------------------------------- allow-lists

export const SEARCH_DOC_FIELDS = [
  "id",
  "kind",
  "lang",
  "category",
  "status",
  "titleOriginal",
  "heading",
  "subTitle",
  "parsha",
  "zman",
  "years",
  "catalogTopics",
  "oneLiner",
  "abstract",
  "keyPoints",
  "sections",
  "storyTitles",
  "questions",
  "sources",
  "people",
  "concepts",
  "keywords",
  "facets",
  "hash",
] as const;

export const SEARCH_DOC_SECTION_FIELDS = ["title", "summary"] as const;
export const SEARCH_DOC_SOURCE_FIELDS = ["work", "ref"] as const;
export const DOC_FACET_FIELDS = ["parsha", "zman", "series", "years", "catalogued", "works", "people", "concepts"] as const;

export const MOMENT_ROW_FIELDS = [
  "id",
  "shiurId",
  "kind",
  "t",
  "end",
  "lang",
  "title_en",
  "title_yi",
  "body_en",
  "body_yi",
  "entities",
  "facets",
  "hash",
] as const;

export const MOMENT_ENTITY_FIELDS = ["works", "people", "concepts"] as const;
export const MOMENT_FACET_FIELDS = ["category", "occasion", "series", "year", "catalogued", "soft"] as const;

/** The only field that carries `candidateTopics` (C9: low-weight keywords, never displayed). */
export const KEYWORD_FIELD = "keywords" as const;

/** Keys that must never appear anywhere in search output (§0.1, §5.2). */
export const FORBIDDEN_SEARCH_KEYS = [
  "heardAs",
  "asrNotes",
  "segs",
  "startSeg",
  "endSeg",
  "questionSegs",
  "answerSegs",
  "segments",
  "transcriptKey",
  "audioKey",
  "asrModel",
  "model",
  "variant",
  "types",
  "transcript",
  "candidateTopics",
] as const;
export type ForbiddenSearchKey = (typeof FORBIDDEN_SEARCH_KEYS)[number];

// ---------------------------------------------------------------- SearchDoc

/** Labels of a parsha/zman: the catalog string plus the table names (he/yi/en) when mapped. */
export interface SearchDocSection {
  title: L;
  summary: L;
}

export interface SearchDocSource {
  work: string | null;
  ref: string | null;
}

/** Ids only; used for filters and entity pages, not for text matching. */
export interface DocFacets {
  parsha: string | null;
  zman: string | null;
  series: string | null;
  years: number[];
  /** Pocket-guide (printed catalog) shiur, as opposed to the uncatalogued guide. */
  catalogued: boolean;
  works: string[];
  people: string[];
  concepts: string[];
}

/** One per in-scope shiur (catalog-only shiurim have empty note fields). */
export interface SearchDoc {
  id: string;
  kind: "shiur";
  lang: Ed;
  category: Category;
  status: ShiurStatus;
  titleOriginal: string;
  heading: string | null;
  subTitle: string | null;
  /** Catalog string + table labels (he/yi/en), deduplicated. Empty when none. */
  parsha: string[];
  zman: string[];
  /** Hebrew years as letters (תשל"ו) and digits ("5736"). */
  years: string[];
  catalogTopics: string[];
  oneLiner: L | null;
  abstract: L | null;
  keyPoints: L[];
  sections: SearchDocSection[];
  storyTitles: L[];
  /** Question text only (answers are moment-level). */
  questions: L[];
  sources: SearchDocSource[];
  people: string[];
  concepts: string[];
  /** `candidateTopics`: low-weight keywords, never displayed (C9). */
  keywords: string[];
  facets: DocFacets;
  /** sha256(schemaVersion + every other field), hex. */
  hash: string;
}

// ---------------------------------------------------------------- MomentRow

export const MOMENT_ROW_KINDS = ["section", "insight", "question", "takeaway", "story", "keypoint", "writeup"] as const;
export type MomentRowKind = (typeof MOMENT_ROW_KINDS)[number];

/** Corpus moment-id kind behind each row kind. */
export const ROW_KIND_OF: Readonly<Record<Exclude<MomentKind, "src" | "ol" | "ab">, MomentRowKind>> = {
  s: "section",
  i: "insight",
  q: "question",
  tk: "takeaway",
  st: "story",
  kp: "keypoint",
  wen: "writeup",
  wyi: "writeup",
};

export interface MomentEntities {
  works: string[];
  people: string[];
  concepts: string[];
}

export interface MomentFacets {
  category: Category;
  /** Parsha key, else zman key, else null. */
  occasion: string | null;
  series: string | null;
  /** First Hebrew year, or null. */
  year: number | null;
  catalogued: boolean;
  /** Confidence 0.6–0.75 (C7). */
  soft: boolean;
}

/**
 * One timed, searchable item (a D1 row; also the unit for embeddings). Ids are the corpus moment
 * ids (`<shiurId>~s3`, `<shiurId>~wen2.1`). Items whose time could not be resolved are not rows.
 */
export interface MomentRow {
  id: string;
  shiurId: string;
  kind: MomentRowKind;
  /** Global seconds. */
  t: number;
  end: number | null;
  /** Audio language of the shiur. */
  lang: Ed;
  /** Display title per language (generated text only). */
  title_en: string | null;
  title_yi: string | null;
  /** Further text per language; a write-up paragraph has only its own language. */
  body_en: string | null;
  body_yi: string | null;
  entities: MomentEntities;
  facets: MomentFacets;
  hash: string;
}

/** What the builders read: the public contract plus derived keywords, nothing else. */
export interface SearchInput {
  shiur: PublicShiur;
  /** `extraction.candidateTopics` of a full shiur; [] otherwise. */
  candidateTopics: readonly string[];
}

// ---------------------------------------------------------------- compile-time checks

/** Every key at any depth of T (through arrays and records). */
export type DeepKeys<T> = T extends readonly (infer U)[]
  ? DeepKeys<U>
  : T extends object
    ? { [K in keyof T & string]-?: K | DeepKeys<NonNullable<T[K]>> }[keyof T & string]
    : never;

type AssertEqual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
type AssertNever<A> = [A] extends [never] ? true : never;

/** The interfaces match the allow-lists exactly. */
export const _fieldChecks: {
  doc: AssertEqual<keyof SearchDoc, (typeof SEARCH_DOC_FIELDS)[number]>;
  section: AssertEqual<keyof SearchDocSection, (typeof SEARCH_DOC_SECTION_FIELDS)[number]>;
  source: AssertEqual<keyof SearchDocSource, (typeof SEARCH_DOC_SOURCE_FIELDS)[number]>;
  docFacets: AssertEqual<keyof DocFacets, (typeof DOC_FACET_FIELDS)[number]>;
  row: AssertEqual<keyof MomentRow, (typeof MOMENT_ROW_FIELDS)[number]>;
  entities: AssertEqual<keyof MomentEntities, (typeof MOMENT_ENTITY_FIELDS)[number]>;
  rowFacets: AssertEqual<keyof MomentFacets, (typeof MOMENT_FACET_FIELDS)[number]>;
  /** No transcript-derived key can exist in the output types or in the builder input. */
  docClean: AssertNever<Extract<DeepKeys<SearchDoc>, ForbiddenSearchKey>>;
  rowClean: AssertNever<Extract<DeepKeys<MomentRow>, ForbiddenSearchKey>>;
  inputClean: AssertNever<Extract<DeepKeys<SearchInput["shiur"]>, Exclude<ForbiddenSearchKey, "transcript">>>;
} = {
  doc: true,
  section: true,
  source: true,
  docFacets: true,
  row: true,
  entities: true,
  rowFacets: true,
  docClean: true,
  rowClean: true,
  inputClean: true,
};
