/**
 * `.corpus/layer/`: the corpus-wide layer as the sites read it (corpus-wave-plan §3.3, C1.2).
 * Browser-safe: types and constants only.
 *
 * Built from `data/derived/corpus/` by copying named fields one by one (never by spreading a
 * record), so a field the pipeline adds stays unpublished until someone maps it here. Every count,
 * hub, grade, member list and page flag is recomputed from the visible set (plan §3.2): shiurim
 * that are `full` in `.corpus` and in the corpus index, with the items they point at still present
 * after projection. `shiurCount`, `shiurIds.length` and the like are never read as counts.
 *
 * Text fields marked "generated" are AI-written, unreviewed prose (reported speech). `reviewed` is
 * true only when the entity carries `reviewStatus: "reviewed"`. No file here carries transcript
 * wording: no ASR variants, no alias-map keys, no segment indices.
 */
import type { Ed, L } from "./types.ts";

/** Bump when the shape of anything in `.corpus/layer/` changes. Separate from SCHEMA_VERSION. */
export const LAYER_SCHEMA_VERSION = 1;

/** The layer folder inside `.corpus/`. */
export const LAYER_DIR = "layer";

/** File names inside `.corpus/layer/` (series and shiur refs are one file per id). */
export const LAYER_FILES = {
  layer: "layer.json",
  topics: "topics.json",
  concepts: "concepts.json",
  people: "people.json",
  works: "works.json",
  stories: "stories.json",
  threads: "threads.json",
  synonyms: "synonyms.json",
  redirects: "redirects.json",
  occasionTopics: "occasion-topics.json",
  /** `series/<seriesId>.json` */
  seriesDir: "series",
  /** `shiur/<shiurId>.json` */
  shiurDir: "shiur",
} as const;

/** Page flag per site. */
export interface LayerPageFlags {
  quiet: boolean;
  live: boolean;
}

/** A visible moment inside a shiur: telling, cluster member, example section. */
export interface LayerMomentRef {
  shiurId: string;
  /** Moment id (`<shiur>~st3`, `<shiur>~i2`, `<shiur>~s4`). */
  momentId: string;
  /** Extraction section index of the chapter the moment sits in (null: time unknown). */
  chapterIdx: number | null;
  /** Global seconds (null: time unknown). */
  t: number | null;
  /** Earliest Hebrew year of the shiur (null: undated). */
  year: number | null;
  lang: Ed;
}

// ---------------------------------------------------------------- layer.json

export interface LayerInputs {
  topics: boolean;
  concepts: boolean;
  people: boolean;
  works: boolean;
  stories: boolean;
  teachingClusters: boolean;
  redirects: boolean;
  /** Series syntheses read / shiur-tags files read. */
  series: number;
  shiurTags: number;
}

export interface LayerSiteCounts {
  topics: number;
  concepts: number;
  people: number;
  works: number;
  stories: number;
  threads: number;
}

export interface LayerCounts {
  /** |V|. */
  visibleShiurim: number;
  topics: number;
  concepts: number;
  people: number;
  works: number;
  stories: number;
  threads: number;
  series: number;
  shiurRefs: number;
  synonyms: number;
  redirects: { corpus: number; legacy: number; legacyUnmatched: number };
  pages: { quiet: LayerSiteCounts; live: LayerSiteCounts };
}

/** A report-only lint: a cluster summary states a number of shiurim that disagrees with the visible count. */
export interface LayerCountLint {
  threadId: string;
  stated: number;
  visible: number;
}

/** `layer.json`. Ids, counts and file names only; never item text. */
export interface LayerInfo {
  layerSchemaVersion: number;
  /** False when `data/derived/corpus/` is absent: no other layer file exists. */
  enabled: boolean;
  corpusVersion: number | null;
  knownCorpusVersion: boolean;
  /** `index.json` `generatedAt` of the corpus (null when absent). */
  generatedAt: string | null;
  inputs: LayerInputs;
  /** Hash of the effective corpus policy. */
  policyHash: string;
  counts: LayerCounts;
  warnings: string[];
  /** `index.json` `files` entries the reader does not know (names only). */
  notRead: string[];
  /** Transcript-wording keys (ASR variants, heard-as samples) dropped on read: file → count. Key names are not repeated here. */
  droppedKeys: Record<string, number>;
  droppedRecords: number;
  lint: { clusterCounts: LayerCountLint[] };
}

// ---------------------------------------------------------------- topics.json

export interface LayerTopicNode {
  id: string;
  /** null for level 1 (or when the parent record is missing). */
  parentId: string | null;
  level: 1 | 2 | 3;
  label: { en: string; yi: string; he?: string };
  /** Visible shiurim tagged with this topic or a descendant (shiur or section level). */
  count: number;
  /** Explicit same-subject entity (`topics[].sameAs`), only targets that exist. */
  sameAs: { conceptId?: string; personId?: string; workId?: string } | null;
  reviewed: boolean;
  pages: LayerPageFlags;
  /** Quiet: gateway layout (level 1, or more than `thresholds.quiet.topicGatewayAbove` shiurim). */
  gateway: boolean;
}

export interface LayerGradeRow {
  shiurId: string;
  /** Highest shiur-level salience over the topic and its descendants. */
  salience: number;
}

export interface LayerTouchedRow {
  shiurId: string;
  /** The tagged chapters (topic or a descendant), in playback order. */
  chapters: { idx: number; t: number }[];
}

export interface LayerTopicDetail {
  id: string;
  /** Generated; null when the label stands alone. */
  description: L | null;
  /** "Begin here": up to ten visible shiurim, other-speaker shiurim excluded, by salience. */
  hubs: string[];
  /**
   * Over the topic and its descendants, each visible shiur once, in catalog order:
   * `main` salience ≥ 0.6, `discussed` lower shiur-level salience, `touched` section level only.
   */
  grades: { main: LayerGradeRow[]; discussed: LayerGradeRow[]; touched: LayerTouchedRow[] };
  children: string[];
  /** Topics tagged on the same visible sections, most shared first. */
  coTopics: { id: string; sections: number }[];
  /** Threads whose `topicIds` include this topic (largest first). */
  threadIds: string[];
  /** Stories with a visible telling inside a chapter tagged with this topic (most told first). */
  storyIds: string[];
  /** Occasion keys linked to this topic (occasion-topics.json). */
  occasions: string[];
}

export interface LayerTopicsFile {
  /** Taxonomy order (level, then label). */
  tree: LayerTopicNode[];
  /** Same order as `tree`. */
  detail: LayerTopicDetail[];
}

// ---------------------------------------------------------------- concepts.json

export interface LayerConcept {
  id: string;
  canonicalHe: string;
  label: L;
  /** Display spellings (the entity's own field). */
  transliterations: string[];
  /** Generated. */
  definition: L;
  /** Visible shiurim, catalog order. */
  shiurIds: string[];
  count: number;
  /** Visible example sections. */
  exampleRefs: { shiurId: string; sectionIndex: number; momentId: string; t: number }[];
  /** Quiet: above 1/`conceptPassimOneIn` of the visible shiurim ("throughout"). */
  passim: boolean;
  /** Live: above 1/`conceptFacetDropOneIn` of the visible shiurim (dropped from the facet list). */
  liveFacetDrop: boolean;
  /** The topic with `sameAs.conceptId` = this id: no concept page, the topic page is the entry. */
  mergedIntoTopic: string | null;
  reviewed: boolean;
  pages: LayerPageFlags;
}

export interface LayerConceptsFile {
  concepts: LayerConcept[];
}

// ---------------------------------------------------------------- people.json

export type LayerPersonType = "tanach" | "chazal" | "rishon" | "acharon" | "chassidic_rebbe" | "other";

/** Why a person is left out of every index (D5). */
export type LayerExcludedReason = "family" | "private" | "owner";

export interface LayerPerson {
  id: string;
  nameHe: string;
  nameEn: string;
  nameYi: string;
  aliases: string[];
  type: LayerPersonType;
  /** Position of `type` in the index of names (tanach first, other last). */
  typeOrder: number;
  shiurIds: string[];
  count: number;
  /** Stories (with a visible telling) that name this person. */
  storyIds: string[];
  /** Works whose `authorPersonId` is this person. */
  worksAuthored: string[];
  /** A work with the same id (the person and his sefer). */
  sameIdWork: string | null;
  /** A topic whose `sameAs.personId` is this person (cross-link only). */
  sameAsTopic: string | null;
  excluded: LayerExcludedReason | null;
  listed: LayerPageFlags;
  pages: LayerPageFlags;
  /** Quiet: the full list goes on a continuation page (≥ `personAllListMin`). */
  quietAllList: boolean;
  reviewed: boolean;
}

export interface LayerPeopleFile {
  people: LayerPerson[];
}

// ---------------------------------------------------------------- works.json

export interface LayerWork {
  id: string;
  titleHe: string;
  titleEn: string;
  aliases: string[];
  /** Only when that person is in people.json. */
  authorPersonId: string | null;
  sefariaIndexTitle: string | null;
  /** A generic label ("Midrash", "Talmud Bavli"): listed, never a page. */
  generic: boolean;
  /** Shelf group from the site's ordering table (null: not in the table, sorted last). */
  orderGroup: string | null;
  order: number | null;
  shiurIds: string[];
  count: number;
  /** A person with the same id. */
  sameIdPerson: string | null;
  sameAsTopic: string | null;
  reviewed: boolean;
  pages: LayerPageFlags;
}

export interface LayerWorksFile {
  /** Table works in shelf order, then the rest by English title. */
  works: LayerWork[];
}

// ---------------------------------------------------------------- stories.json

/** A person on a story: a person id, or a name printed as plain text. */
export type LayerStoryPerson = { id: string } | { name: string; linked: false };

export interface LayerStory {
  id: string;
  /** Generated. */
  title: L;
  /** Generated merged retelling. */
  retelling: L;
  people: LayerStoryPerson[];
  /** Visible tellings by year (undated last), then catalog order. */
  tellings: LayerMomentRef[];
  shiurCount: number;
  reviewed: boolean;
  pages: LayerPageFlags;
}

export interface LayerStoriesFile {
  stories: LayerStory[];
}

// ---------------------------------------------------------------- threads.json

export interface LayerThread {
  id: string;
  /** Generated. */
  label: L;
  /** Generated. */
  summary: L;
  topicIds: string[];
  /** Visible members by year (undated last), then catalog order. */
  members: LayerMomentRef[];
  /** Distinct visible shiurim (≥ 2, else the thread is dropped). */
  shiurCount: number;
  /** Members whose shiur is dated. */
  datedCount: number;
  /** [earliest, latest] year of the dated members. */
  years: [number, number] | null;
  /** Thread page (≥ `threads.pageMinShiurim` shiurim). */
  page: boolean;
  /** Show the year line as a timeline (≥ `threads.timelineMinDated` dated members). */
  timeline: boolean;
  reviewed: boolean;
}

export interface LayerThreadsFile {
  threads: LayerThread[];
}

// ---------------------------------------------------------------- series/<id>.json

export interface LayerSeries {
  seriesId: string;
  /** Generated subtitle (the catalog name stays the title). */
  title: L;
  overview: L;
  keyThemes: L[];
  /** Visible parts only, in series order. */
  arc: { shiurId: string; part: number; oneLiner: L }[];
  /**
   * Part numbers (1-based, series order) of the parts that are not visible (no notes yet), so the
   * page can keep their rows. Numbers only: a shiur that is not visible is never named here.
   */
  missing: number[];
  reviewed: boolean;
}

// ---------------------------------------------------------------- shiur/<id>.json

export interface LayerShiurStoryRef {
  momentId: string;
  storyId: string;
  /** Visible tellings of the story, this one included. */
  tellings: number;
  pages: LayerPageFlags;
}

export interface LayerShiurInsightRef {
  momentId: string;
  threadId: string;
  /** Distinct visible shiurim of the thread, this one included. */
  shiurCount: number;
  years: [number, number] | null;
  page: boolean;
  /** Two-shiur threads (D3 "inline-line"): the other member, shown as one line at the insight. */
  other?: LayerMomentRef;
}

export interface LayerShiurRefs {
  shiurId: string;
  /** Share of the shiur's time by another speaker (null: not given). */
  otherSpeakerShare: number | null;
  /** Shiur-level topics, highest salience first. */
  topics: { id: string; salience: number }[];
  /** Section-level topics of visible chapters (other-speaker chapters dropped). */
  chapters: { idx: number; topicIds: string[] }[];
  conceptIds: string[];
  personIds: string[];
  workIds: string[];
  /** Resolved work per source moment (`<shiur>~src<i>`); unresolved sources are absent. */
  sources: { momentId: string; workId: string }[];
  stories: LayerShiurStoryRef[];
  insights: LayerShiurInsightRef[];
}

// ---------------------------------------------------------------- synonyms.json

export type LayerEntityKind = "topic" | "concept" | "person" | "work";

export interface LayerSynonyms {
  kind: LayerEntityKind;
  id: string;
  /** Search-folded (`fold`) terms from the entity's own display fields only, deduplicated. */
  terms: string[];
}

export interface LayerSynonymsFile {
  synonyms: LayerSynonyms[];
}

// ---------------------------------------------------------------- redirects.json

export type LayerRedirectKind = "topics" | "concepts" | "people" | "works" | "stories" | "threads";
export type LegacyKind = "person" | "work" | "concept";
export type LayerTargetKind = "topic" | "concept" | "person" | "work";

export interface LegacyRedirect {
  kind: LegacyKind;
  /** The old site key (normalize-keyed entity). */
  oldKey: string;
  hadPage: LayerPageFlags;
  /** null: nothing matched (the site sends it to the index page). */
  target: { kind: LayerTargetKind; id: string } | null;
  /** How it matched. */
  via: "name" | "slug" | "overlap" | "sources" | null;
}

export interface LayerRedirectsFile {
  /** Retired corpus id → live id, per kind; chains resolved, cycles and dangling targets dropped. */
  corpus: Record<LayerRedirectKind, Record<string, string>>;
  legacy: LegacyRedirect[];
}

// ---------------------------------------------------------------- occasion-topics.json

export interface LayerOccasionTopic {
  /** parsha or zman key (@emunas/normalize). */
  key: string;
  kind: "parsha" | "zman";
  topicId: string;
  /** `data`: the topic's own parsha/zman field; `derived`: the share rule (D11). */
  source: "data" | "derived";
  /** Derived only: share of the occasion's visible catalog shiurim tagged with the topic at salience ≥ minSalience. */
  share: number | null;
}

export interface LayerOccasionTopicsFile {
  occasions: LayerOccasionTopic[];
}
