/**
 * What gets indexed (integration-plan C9, C19, W2.2). Both sites index exactly these fields:
 * Pagefind records (Quiet), the MiniSearch quick index (Live), D1 rows and Vectorize (emunas-api).
 *
 * The field lists below are the allow-list. `SearchDoc`/`MomentRow` are checked against them at
 * compile time (`AssertEqual`), and the builders construct objects key by key from a
 * `PublicShiur`, which has no transcript-derived field. The other input is the corpus layer
 * (`.corpus/layer/`, corpus-wave-plan §3.3, §3.6): topic labels and the entities' own display-field
 * synonyms, and corpus ids for facets and entities. Topic labels and aliases land only in
 * `SearchDoc.keywords` (low weight, never displayed). The retired extraction topic strings (C9) are
 * not read at all and are a forbidden key.
 */
import type { Category, Ed, LayerShiurRefs, MomentKind, PublicShiur, ShiurStatus, WriteupMomentKind } from "@emunas/corpus/public";
import { UI_LANGS, type LocalizedText, type UiLang } from "@emunas/i18n";
import type { SearchLayer } from "./layer-types.ts";

/**
 * Bump when the shape of a SearchDoc, MomentRow or EntityDoc, or the text that feeds a hash, changes.
 * 2: corpus-layer keywords, corpus-id facets and entities (+ topics), entities.ndjson.
 * 3: every interface language (`UI_LANGS`): SearchDoc texts are `LocalizedText` (translations
 *    when current), MomentRow `title_<lang>`/`body_<lang>` per language, EntityDoc labels per language.
 */
export const SEARCH_SCHEMA_VERSION = 3;

// ---------------------------------------------------------------- languages

/**
 * Text languages are the interface languages (`UI_LANGS` of `@emunas/i18n`). Generated text is in
 * `en` and `yi` always and in a translated language (`he`) only when the corpus applied a current
 * translation overlay; nothing here fills a missing translation from another language. Readers
 * that show or index one language pick along `CONTENT_FALLBACK` (`docTextParts(doc, reader)`,
 * `pickText`).
 */
export type MomentRowTextPart = "title" | "body";
/** `title_<lang>` / `body_<lang>` of a MomentRow. */
export type MomentRowTextField = `${MomentRowTextPart}_${UiLang}`;

/** The MomentRow field holding `part` in `lang`. */
export function momentRowTextField(part: MomentRowTextPart, lang: UiLang): MomentRowTextField {
  return `${part}_${lang}`;
}

/** Every per-language text field of a MomentRow: the titles, then the bodies, each in `UI_LANGS` order. */
export const MOMENT_ROW_TEXT_FIELDS: readonly MomentRowTextField[] = [
  ...UI_LANGS.map((l) => momentRowTextField("title", l)),
  ...UI_LANGS.map((l) => momentRowTextField("body", l)),
];

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
export const DOC_FACET_FIELDS = [
  "parsha",
  "zman",
  "series",
  "years",
  "catalogued",
  "works",
  "people",
  "concepts",
  "topics",
] as const;

/** MomentRow fields in output order; the text fields are `MOMENT_ROW_TEXT_FIELDS`. */
export const MOMENT_ROW_FIELDS: readonly MomentRowField[] = [
  "id",
  "shiurId",
  "kind",
  "t",
  "end",
  "lang",
  ...MOMENT_ROW_TEXT_FIELDS,
  "entities",
  "facets",
  "hash",
];
export type MomentRowField = "id" | "shiurId" | "kind" | "t" | "end" | "lang" | MomentRowTextField | "entities" | "facets" | "hash";

export const MOMENT_ENTITY_FIELDS = ["works", "people", "concepts", "topics"] as const;
export const MOMENT_FACET_FIELDS = ["category", "occasion", "series", "year", "catalogued", "soft"] as const;

/** The only field that carries topic labels and topic aliases (low-weight keywords, never displayed). */
export const KEYWORD_FIELD = "keywords" as const;

export const ENTITY_DOC_KINDS = ["topic", "concept", "person", "work"] as const;
export type EntityDocKind = (typeof ENTITY_DOC_KINDS)[number];

export const ENTITY_DOC_FIELDS = ["kind", "id", "labels", "synonyms", "count", "listed", "pages", "mergedInto", "hash"] as const;
/** One label per interface language (`UI_LANGS`). */
export const ENTITY_DOC_LABEL_FIELDS: typeof UI_LANGS = UI_LANGS;
export const ENTITY_DOC_FLAG_FIELDS = ["quiet", "live"] as const;

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
  "asrVariants",
  "heardAsSamples",
] as const;
export type ForbiddenSearchKey = (typeof FORBIDDEN_SEARCH_KEYS)[number];

// ---------------------------------------------------------------- SearchDoc

/** A chapter of a SearchDoc. */
export interface SearchDocSection {
  title: LocalizedText;
  summary: LocalizedText;
}

export interface SearchDocSource {
  work: string | null;
  ref: string | null;
}

/**
 * Corpus ids only (`.corpus/layer/shiur/<id>.json`), for filters and entity pages, not for text
 * matching. Entities that no site lists (excluded or unlisted people, entities with no visible
 * shiur) are left out.
 */
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
  /** Shiur-level and section-level topics. */
  topics: string[];
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
  /**
   * Generated text: `en` and `yi`, plus each translated language (`he`) present and non-blank only
   * when the corpus has a current translation. Null (or left out of a list) when every language is blank.
   */
  oneLiner: LocalizedText | null;
  abstract: LocalizedText | null;
  keyPoints: LocalizedText[];
  sections: SearchDocSection[];
  storyTitles: LocalizedText[];
  /** Question text only (answers are moment-level). */
  questions: LocalizedText[];
  sources: SearchDocSource[];
  /**
   * Display names (corpus layer) of the shiur's people and of the people of its merged stories.
   * Never a raw extraction name: those may be ASR mishearings (F.1). Empty without layer refs.
   */
  people: string[];
  /** Display names (canonicalHe, label in every language) of the shiur's concepts in the corpus layer. */
  concepts: string[];
  /**
   * The shiur's visible topics: labels (every language) and the topics' own aliases (search-folded),
   * deduplicated after folding. Low weight, never displayed.
   */
  keywords: string[];
  facets: DocFacets;
  /** sha256(schemaVersion + every other field), hex. */
  hash: string;
}

// ---------------------------------------------------------------- MomentRow

export const MOMENT_ROW_KINDS = ["section", "insight", "question", "takeaway", "story", "keypoint", "writeup"] as const;
export type MomentRowKind = (typeof MOMENT_ROW_KINDS)[number];

/** Corpus moment-id kind behind each row kind (every write-up kind, `w<lang>`, is a `writeup` row). */
export const ROW_KIND_OF: Readonly<Record<Exclude<MomentKind, "src" | "ol" | "ab">, MomentRowKind>> = {
  s: "section",
  i: "insight",
  q: "question",
  tk: "takeaway",
  st: "story",
  kp: "keypoint",
  ...(Object.fromEntries(UI_LANGS.map((l) => [`w${l}`, "writeup"])) as Record<WriteupMomentKind, "writeup">),
};

/**
 * Corpus ids. Section rows: works cited and people of stories inside the chapter, concepts whose
 * example section it is, the chapter's topics. Other rows: their own works/people, and the shiur's
 * topics with salience ≥ 0.6.
 */
export interface MomentEntities {
  works: string[];
  people: string[];
  concepts: string[];
  topics: string[];
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
 * Display text per language (generated text only): `title_<lang>` and `body_<lang>` for every
 * `UiLang`. A language without text (no current translation) is null; a write-up paragraph has a
 * body only in its own language. Read them with `momentRowText`.
 */
export type MomentRowTexts = { [F in MomentRowTextField]: string | null };

/**
 * One timed, searchable item (a D1 row; also the unit for embeddings). Ids are the corpus moment
 * ids (`<shiurId>~s3`, `<shiurId>~wen2.1`, `<shiurId>~whe2.1`). Items whose time could not be
 * resolved are not rows.
 */
export interface MomentRow extends MomentRowTexts {
  id: string;
  shiurId: string;
  kind: MomentRowKind;
  /** Global seconds. */
  t: number;
  end: number | null;
  /** Audio language of the shiur. */
  lang: Ed;
  entities: MomentEntities;
  facets: MomentFacets;
  hash: string;
}

/** What the builders read: the public contract plus the corpus layer, nothing else. */
export interface SearchInput {
  shiur: PublicShiur;
  /** The corpus layer; absent or null: no keywords and empty entity facets. */
  layer?: SearchLayer | null;
}

// ---------------------------------------------------------------- EntityDoc

/**
 * Display labels per interface language: topic label, concept label (`he`: canonicalHe, else its
 * translation), person names, work titles. Null when the entity has none in that language.
 */
export type EntityDocLabels = { [L in UiLang]: string | null };

export interface EntityDocFlags {
  quiet: boolean;
  live: boolean;
}

/**
 * One per corpus entity listed on at least one site (`.corpus/search/entities.ndjson`): headword
 * results on Quiet, entity suggestions on Live. Never people of type `other`, never excluded
 * people. Story and thread documents are second cut. All entities are AI-generated and unreviewed.
 */
export interface EntityDoc {
  kind: EntityDocKind;
  id: string;
  labels: EntityDocLabels;
  /** Search-folded terms from the entity's own display fields (layer synonyms.json only). Never displayed. */
  synonyms: string[];
  /** Visible shiurim. */
  count: number;
  /** Listed in that site's index. */
  listed: EntityDocFlags;
  /** Has its own page on that site. */
  pages: EntityDocFlags;
  /** Concepts merged into a topic: that topic's id (the topic page is the entry). Otherwise null. */
  mergedInto: string | null;
  hash: string;
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
  entity: AssertEqual<keyof EntityDoc, (typeof ENTITY_DOC_FIELDS)[number]>;
  entityLabels: AssertEqual<keyof EntityDocLabels, (typeof ENTITY_DOC_LABEL_FIELDS)[number]>;
  entityFlags: AssertEqual<keyof EntityDocFlags, (typeof ENTITY_DOC_FLAG_FIELDS)[number]>;
  /** No transcript-derived key can exist in the output types or in the builder input. */
  docClean: AssertNever<Extract<DeepKeys<SearchDoc>, ForbiddenSearchKey>>;
  rowClean: AssertNever<Extract<DeepKeys<MomentRow>, ForbiddenSearchKey>>;
  entityClean: AssertNever<Extract<DeepKeys<EntityDoc>, ForbiddenSearchKey>>;
  /** The per-shiur layer refs the builders read. */
  layerClean: AssertNever<Extract<DeepKeys<LayerShiurRefs>, ForbiddenSearchKey>>;
  inputClean: AssertNever<Extract<DeepKeys<SearchInput["shiur"]>, Exclude<ForbiddenSearchKey, "transcript">>>;
} = {
  doc: true,
  section: true,
  source: true,
  docFacets: true,
  row: true,
  entities: true,
  rowFacets: true,
  entity: true,
  entityLabels: true,
  entityFlags: true,
  docClean: true,
  rowClean: true,
  entityClean: true,
  layerClean: true,
  inputClean: true,
};
