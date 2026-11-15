/**
 * The Live data contract: the shape of every file under `/data/` (tech-live §3.3), built on the
 * integration-plan public contract (`@emunas/corpus/public`, §5.2). W3.6 emits files that conform to
 * these types; wave-3/4 UI reads them through `client.ts`.
 *
 * Rules carried over from the public contract:
 * - Times are global seconds (C5). `t` may be `null` when the build could not resolve an item's time
 *   (C6); the item is still shown, without a play button.
 * - Text is derived (catalog + AI notes) only. No transcript-derived field exists here, and the
 *   forbidden keys (heardAs, asrNotes, segs, startSeg, endSeg, questionSegs, answerSegs, segments,
 *   transcriptKey, audioKey, asrModel, model, variant) must never appear (`contract.test.ts`).
 * - Audio (Amendment A1): each recording carries `audioUrl`, a URL on the media host
 *   (`${MEDIA_ORIGIN}/<encoded key>`), or `null` when the recording is not playable (non-mp3 source).
 *
 * Bump `LIVE_DATA_SCHEMA_VERSION` whenever a shape here changes; `build.json` carries it and the
 * client refuses files whose `schemaVersion` differs.
 */
import type {
  BuildCounts,
  Category,
  Ed,
  IndexRow,
  KeyedValue,
  L,
  Moment,
  PublicNotes,
  PublicRecording,
  PublicShiur,
  PublicWriteupBlock,
  SectionKind,
  ShiurStatus,
} from "@emunas/corpus/public";

export type { Ed, L, Moment, ShiurStatus };

export const LIVE_DATA_SCHEMA_VERSION = 2;

// ---------------------------------------------------------------------------------------------
// Shared pieces

/** Moment kinds as they appear in moment ids (`<shiurId>~<kind><index>`), integration-plan §2.2. */
export type MomentKind = "kp" | "s" | "i" | "tk" | "q" | "st";

/** A pointer to a playable moment, used by Today pools, entity pages and work locations. */
export interface MomentRef {
  /** `<shiurId>~<kind><index>` */
  id: string;
  shiurId: string;
  kind: MomentKind;
  t: number | null;
  end: number | null;
}

/** Facet / entity kinds. `o` = occasion (parsha and zman keys share one namespace). */
export type EntityKind = "p" | "c" | "o";

/** Labels for a facet value. `he` is the original Hebrew-script form where one exists. */
export interface FacetLabel {
  en: string;
  yi: string;
  he?: string;
}

// ---------------------------------------------------------------------------------------------
// /data/build.json

export interface BuildFile {
  schemaVersion: typeof LIVE_DATA_SCHEMA_VERSION;
  /** Schema version of the `.corpus/` the files were emitted from. */
  corpusSchemaVersion: number;
  buildId: string;
  dataSha: string | null;
  /** ISO 8601. */
  generatedAt: string;
  counts: BuildCounts;
  /** Number of `/data/moments/<lang>-<n>.json` shards per reading language (n = 0 … count-1). */
  momentShards: Record<Ed, number>;
  /**
   * Glossary shard prefixes (`/data/glossary/<prefix>.json`). A concept's card is in the shard whose
   * prefix is the longest one its id starts with (`glossaryShardFor`).
   */
  glossaryShards: string[];
}

// ---------------------------------------------------------------------------------------------
// /data/corpus.json — one row per in-scope shiur

export interface CorpusRow extends Pick<
  IndexRow,
  "id" | "rev" | "lang" | "category" | "status" | "perek" | "years" | "duration" | "oneLiner"
> {
  /** `catalog.titleOriginal`, as written (render with `<Text shiurLang>`). */
  title: string;
  heading: string | null;
  sectionTitle: string;
  derived: IndexRow["catalog"]["derived"];
  /** Parsha key, zman key: both are occasion keys (`/o/:occasionId`). */
  parsha: string | null;
  zman: string | null;
  series: { id: string; order: number | null } | null;
  /**
   * Corpus ids (corpus layer, C1.7) of the entities listed in `facets.json`; labels are there.
   * Explore's own copy, with topics, is `explore/entities.json`; this one goes in C3.1.
   */
  entities: IndexRow["entities"];
  counts: Pick<IndexRow["counts"], "chapters" | "stories" | "questions" | "insights">;
}

export interface CorpusFile {
  schemaVersion: typeof LIVE_DATA_SCHEMA_VERSION;
  buildId: string;
  counts: BuildCounts;
  shiurim: CorpusRow[];
}

// ---------------------------------------------------------------------------------------------
// /data/facets.json — facet dictionaries (id → labels, count)

export interface FacetValue {
  label: FacetLabel;
  /** Number of shiurim with this value. */
  count: number;
}

export interface SeriesFacetValue extends FacetValue {
  lang: Ed;
}

export interface OccasionFacetValue extends FacetValue {
  type: "parsha" | "zman";
  /**
   * True when `/data/entity/o/<key>.json` exists (the occasion is listed in `today.json` with at
   * least two shiurim), so links to `/o/<key>` need no other file. `count` can be higher than the
   * listed membership: it also counts uncatalogued file-name guesses.
   */
  hasPage: boolean;
}

export interface FacetsFile {
  schemaVersion: typeof LIVE_DATA_SCHEMA_VERSION;
  category: Partial<Record<Category, FacetValue>>;
  lang: Record<Ed, FacetValue>;
  occasion: Record<string, OccasionFacetValue>;
  /** Hebrew year (as a string key) → count; `unknown` = shiurim without a year. */
  year: Record<string, FacetValue>;
  series: Record<string, SeriesFacetValue>;
  /** Corpus work ids with a Live page (never a generic label). */
  work: Record<string, FacetValue>;
  /** Corpus person ids with a Live page (never type `other`, never excluded). */
  person: Record<string, FacetValue>;
  /** Corpus concept ids with a Live page (merged-into-topic concepts are reached through the topic). */
  concept: Record<string, FacetValue>;
}

// ---------------------------------------------------------------------------------------------
// /data/today.json

/** A shiur card (topic hubs): what a card renders without the shiur file. */
export interface ShiurCard {
  id: string;
  lang: Ed;
  /** `catalog.titleOriginal`, as written. */
  title: string;
  oneLiner: L | null;
  duration: number;
  years: number[];
  status: ShiurStatus;
}

/** A section of a mix: the moment id of the chapter (`<shiur>~s<idx>`), its times and title. */
export interface MixItem {
  id: string;
  shiurId: string;
  t: number;
  end: number;
  lang: Ed;
  title: L;
}

/**
 * A card in today.json, keyed by shiur id. Compact on purpose (today.json ≤ 30 KiB br, plan §4):
 * the one-liner only on the newly-summarized cards, the duration in whole seconds.
 */
export interface TodayCard {
  lang: Ed;
  title: string;
  duration: number;
  years: number[];
  status: ShiurStatus;
  oneLiner?: L;
}

/** A "moment for today" candidate; the shiur is the moment id's prefix (`<shiurId>~<kind><n>`). */
export interface TodayMoment {
  id: string;
  t: number;
}

/** A mix section in today.json; the shiur is the id's prefix, its language is on the shiur's card. */
export interface TodayMixItem {
  id: string;
  t: number;
  end: number;
  title: L;
}

/**
 * The occasion mix (concept-live C.3): sections tagged with the occasion's topic (occasion-topics
 * of the corpus layer), best first, one per shiur until the pool runs out. Featured: shiurim mostly
 * by another speaker and the owner's excluded topics never appear (D7). Assembled by AI tags; the
 * rest of the mix is in the topic's file and moment pages.
 */
export interface TodayMix {
  topicId: string;
  label: FacetLabel;
  /** Sections and distinct shiurim in the whole mix. */
  sections: number;
  shiurim: number;
  /** The first items, ready to queue. */
  first: TodayMixItem[];
}

/** Shiurim per audio language in an occasion's row (the occasion page lists all of them). */
export const TODAY_ROW_PER_LANG = 3;

export interface TodayOccasion {
  /**
   * Present only when it differs from the shared parsha/occasion tables (`@emunas/normalize`
   * PARSHIYOS, OCCASIONS), which the client reads by key: the "other" bucket and unmapped keys.
   */
  label?: FacetLabel;
  /**
   * The row: up to `TODAY_ROW_PER_LANG` shiurim per audio language, ordered by Hebrew year (undated
   * last). `total` counts all of the occasion's shiurim.
   */
  shiurIds: string[];
  total: number;
  /** Candidate pool for "a moment for today" (insights, stories, questions); chosen per date client-side. */
  moments: TodayMoment[];
  /** Null when the occasion has no topic (or no featured section). */
  mix: TodayMix | null;
}

export interface TodayFile {
  schemaVersion: typeof LIVE_DATA_SCHEMA_VERSION;
  /** The corpus counter. */
  counts: BuildCounts;
  occasions: Record<string, TodayOccasion>;
  /** Shiurim whose notes landed recently (manifest `updatedAt`), newest first. */
  newlySummarized: { shiurId: string; updatedAt: string }[];
  /** A card for every shiur named above (rows, moment pools, mixes, newly summarized). */
  cards: Record<string, TodayCard>;
}

// ---------------------------------------------------------------------------------------------
// /data/shiur/<id>.json — the listening room, without the write-up

/**
 * A recording with its media-host URL (Amendment A1): exactly the corpus `PublicRecording`, i.e.
 * `{ audioUrl: MediaUrl, playable: true }` or `{ audioUrl: null, playable: false }` (shown as unavailable).
 */
export type LiveRecording = PublicRecording;

/** Notes without the write-up (loaded lazily per language from `/data/writeup/`). */
export interface LiveNotes extends Omit<PublicNotes, "writeup"> {
  /** Languages for which `/data/writeup/<id>.<lang>.json` exists. */
  writeupLangs: Ed[];
}

export interface ShiurRelated {
  /** Other shiurim for the same parsha/zman (both languages), by year. */
  sameOccasion: string[];
  /** Previous/next in catalog section and series order. */
  prev: string | null;
  next: string | null;
  /** "Same idea elsewhere" (W4.4); empty until neighbours are computed. */
  neighbors: { momentId: string; shiurId: string; t: number; score: number }[];
  /** Title and audio language of every other shiur this file names (above, and thread pointers). */
  titles: Record<string, { title: string; lang: Ed; years: number[] }>;
}

/** A topic, concept, person or work as a chip: corpus id, labels, whether Live has its page. */
export interface EntityChip {
  id: string;
  label: FacetLabel;
  page: boolean;
}

/**
 * The shiur's corpus-layer refs, self-contained (concept-live G.1): every label the room shows is
 * here, so the room never needs a corpus-wide file. Generated and unreviewed (label once per page).
 */
export interface ShiurCorpus {
  /** Shiur-level topics, highest salience first. */
  topics: { id: string; salience: number }[];
  /** Section topic chips (other-speaker chapters have none). */
  chapters: { idx: number; topicIds: string[] }[];
  /** Every topic named above. */
  topicLabels: Record<string, EntityChip>;
  /** "Terms in this shiur": the concepts, with their glossary labels. */
  terms: EntityChip[];
  /** Resolved work per source moment. */
  sources: { momentId: string; workId: string; page: boolean }[];
  /** Story moments that belong to a merged story: visible tellings (this one included) and page flag. */
  stories: { momentId: string; storyId: string; tellings: number; page: boolean }[];
  /**
   * Insight moments in a thread: distinct shiurim, year span, page flag; a two-shiur thread carries
   * the other member instead (one line at the insight, never a headline).
   */
  insights: {
    momentId: string;
    threadId: string;
    shiurCount: number;
    years: [number, number] | null;
    page: boolean;
    other?: { shiurId: string; momentId: string; t: number | null; year: number | null; lang: Ed };
  }[];
}

export interface ShiurFile extends Omit<PublicShiur, "recordings" | "notes"> {
  schemaVersion: typeof LIVE_DATA_SCHEMA_VERSION;
  recordings: LiveRecording[];
  /** Present only when `status === "full"`. */
  notes?: LiveNotes;
  related: ShiurRelated;
  /** The series title (catalog), so the room needs no other file. */
  seriesTitle: L | null;
  /** Present for full shiurim in the corpus layer's visible set. */
  corpus?: ShiurCorpus;
}

// ---------------------------------------------------------------------------------------------
// /data/writeup/<id>.<lang>.json

export interface WriteupFile {
  schemaVersion: typeof LIVE_DATA_SCHEMA_VERSION;
  shiurId: string;
  /** Same as the shiur's `rev`, so a stale write-up can be detected. */
  rev: string;
  lang: Ed;
  blocks: PublicWriteupBlock[];
}

// ---------------------------------------------------------------------------------------------
// /data/series/<id>.json

export interface SeriesPart {
  shiurId: string;
  order: number | null;
  title: string;
  oneLiner: L | null;
  duration: number;
  years: number[];
  status: ShiurStatus;
  perek: string | null;
}

/** The series synthesis (concept-live C.6): generated, unreviewed. Absent when there is none. */
export interface SeriesSynthesis {
  title: L;
  overview: L;
  /** Plain text, not topic ids. */
  keyThemes: L[];
  /** Position-aware one-liners for the visible parts. */
  arc: { shiurId: string; oneLiner: L }[];
  reviewed: boolean;
}

export interface SeriesFile {
  schemaVersion: typeof LIVE_DATA_SCHEMA_VERSION;
  id: string;
  title: L;
  lang: Ed;
  parts: SeriesPart[];
  /** Tanya: parts grouped by perek, in order. Empty for series without perakim. */
  perekGroups: { perek: string; shiurIds: string[] }[];
  synthesis?: SeriesSynthesis;
}

// ---------------------------------------------------------------------------------------------
// /data/works.json and /data/work/<key>.json

export interface WorkSummary {
  /** Corpus work id. */
  key: string;
  /** The work's name as cited (first spelling seen; normalize supplies canonical names in W2.1). */
  name: string;
  label: FacetLabel;
  /** Number of shiurim citing it. */
  count: number;
  /** Number of citations. */
  mentions: number;
}

export interface WorksFile {
  schemaVersion: typeof LIVE_DATA_SCHEMA_VERSION;
  works: WorkSummary[];
}

export interface WorkCitation {
  shiurId: string;
  /** Source id `<shiurId>~src<n>`. */
  sourceId: string;
  t: number | null;
  mention: "quoted" | "paraphrased" | "alluded";
  resolution: "resolved" | "inferred" | "unresolved";
}

export interface WorkLocation {
  /** The reference as cited (`Bereishis 6:8`). */
  ref: string;
  sefariaRef: string | null;
  citations: WorkCitation[];
}

export interface WorkFile {
  schemaVersion: typeof LIVE_DATA_SCHEMA_VERSION;
  key: string;
  name: string;
  label: FacetLabel;
  /** In the work's own order where known (W2.1 normalize order), else by first appearance. */
  locations: WorkLocation[];
  /** Citations without a usable reference. */
  unlocated: WorkCitation[];
}

// ---------------------------------------------------------------------------------------------
// /data/entity/{p,c,o}/<key>.json

export interface EntityFile {
  schemaVersion: typeof LIVE_DATA_SCHEMA_VERSION;
  kind: EntityKind;
  /** Corpus id for `p` and `c`; occasion key for `o`. */
  key: string;
  label: FacetLabel;
  /** Shiurim, by year. */
  shiurIds: string[];
  /** Hebrew year (string) → number of shiurim; `unknown` for undated. */
  years: Record<string, number>;
  moments: MomentRef[];
  /** Entities sharing ≥ N shiurim with this one. */
  related: { kind: EntityKind; key: string; shared: number }[];
}

// ---------------------------------------------------------------------------------------------
// /data/stories.json — all stories, without the retelling

export interface StoryRow {
  id: string;
  shiurId: string;
  title: L;
  /** Corpus person ids with a Live page (from the merged story the telling belongs to). */
  peopleKeys: string[];
  t: number | null;
  end: number | null;
  year: number | null;
  lang: Ed;
}

export interface StoriesFile {
  schemaVersion: typeof LIVE_DATA_SCHEMA_VERSION;
  stories: StoryRow[];
}

// ---------------------------------------------------------------------------------------------
// /data/moments/<lang>-<n>.json — Explore "moments" unit, sharded by 1,000

export const MOMENT_SHARD_SIZE = 1000;

export interface MomentRow extends MomentRef {
  /** Title (chapter title, story title, question) or text (insight, takeaway, key point) in the shard's language. */
  title: string;
  /** Chapter kind for `s` moments. */
  sectionKind?: SectionKind;
}

export interface MomentShardFile {
  schemaVersion: typeof LIVE_DATA_SCHEMA_VERSION;
  lang: Ed;
  shard: number;
  moments: MomentRow[];
}

// ---------------------------------------------------------------------------------------------
// /data/quick-index.<lang>.json — serialized MiniSearch (W3.6 builds it, W4.3 loads it)

export interface QuickIndexFile {
  schemaVersion: typeof LIVE_DATA_SCHEMA_VERSION;
  lang: Ed;
  /** Options to pass to `MiniSearch.loadJSON` (fields and stored fields). */
  options: { fields: string[]; storeFields: string[]; idField: string };
  /** `JSON.stringify(miniSearch)`; opaque to the contract. */
  index: unknown;
}

// ---------------------------------------------------------------------------------------------
// Corpus layer (C1.7). Every entity here is AI-generated and unreviewed unless `reviewed` is true;
// pages carry the label once (concept-live E.3). Counts are the visible recounts of the layer.

/** A topic of the tree, as `topicNodes()` expands it. */
export interface TopicNode {
  id: string;
  parentId: string | null;
  level: number;
  label: FacetLabel;
  /** Visible shiurim tagged with the topic or a descendant. */
  count: number;
}

/**
 * One row of the topic tree: `[id, parentId, label.en, label.yi, label.he (null: same as yi), count]`.
 * Rows rather than objects keep the whole tree under its 8 KiB br budget (plan §4) with the Hebrew
 * names the map shows; `topicNodes()` (app/data/topics.ts) expands them.
 */
export type TopicRow = [id: string, parentId: string | null, en: string, yi: string, he: string | null, count: number];

/** /data/topics.json: the topic tree only (no descriptions, aliases or hubs). Explore / idle. */
export interface TopicsFile {
  schemaVersion: typeof LIVE_DATA_SCHEMA_VERSION;
  /** Taxonomy order: a parent always comes before its children. */
  topics: TopicRow[];
}

/** A section in a topic's moment list (first page, with titles). */
export interface TopicMoment extends MixItem {
  year: number | null;
}

/** A section in a later moments page: ids and times only. */
export interface TopicMomentRef {
  id: string;
  shiurId: string;
  t: number;
  end: number;
  lang: Ed;
}

/** /data/topic/<id>.json: one file per topic page. */
export interface TopicFile {
  schemaVersion: typeof LIVE_DATA_SCHEMA_VERSION;
  id: string;
  level: 1 | 2 | 3;
  label: FacetLabel;
  /** Ancestors, root first. */
  breadcrumb: { id: string; label: FacetLabel }[];
  /** Generated; null when the label stands alone. */
  description: L | null;
  reviewed: boolean;
  /** The concept with the same subject: its definition is shown as "the term" (concept-live C.2). */
  term: { conceptId: string; he: string; definition: L } | null;
  /** Same-subject person or sefer pages (cross-links only). */
  person: EntityChip | null;
  work: EntityChip | null;
  /** Visible shiurim (with descendants). */
  count: number;
  /** "Start here". */
  hubs: ShiurCard[];
  children: { id: string; label: FacetLabel; count: number }[];
  /** "Often together with" (section co-tagging). */
  coTopics: { id: string; label: FacetLabel; sections: number }[];
  /** Largest first; `page: false` threads are shown as a line, never a link. */
  threads: { id: string; label: L; shiurCount: number; page: boolean }[];
  threadTotal: number;
  /** Stories with a telling inside a tagged section, most told first. */
  stories: { id: string; title: L; tellings: number; page: boolean }[];
  storyTotal: number;
  /** Occasion keys this topic is the calendar topic of. */
  occasions: string[];
  /** The mix: the first sections with titles, best first (one per shiur first). */
  moments: TopicMoment[];
  /** All sections and distinct shiurim in the mix. */
  momentTotal: number;
  momentShiurim: number;
  /** Further sections in `topic/<id>.moments-<n>.json`, n = 1 … momentPages. */
  momentPages: number;
}

export const TOPIC_FIRST_MOMENTS = 30;
export const TOPIC_MOMENTS_PAGE_SIZE = 300;

/** /data/topic/<id>.moments-<n>.json */
export interface TopicMomentsFile {
  schemaVersion: typeof LIVE_DATA_SCHEMA_VERSION;
  topicId: string;
  page: number;
  moments: TopicMomentRef[];
}

/** A visible member of a thread or telling of a story, with what its row shows. */
export interface CorpusMember {
  shiurId: string;
  momentId: string;
  t: number | null;
  /** Earliest Hebrew year of the shiur (null: undated). */
  year: number | null;
  lang: Ed;
  /** The shiur's catalog title, as written. */
  title: string;
  /** The chapter the moment sits in. */
  chapterTitle: L | null;
}

/** /data/thread/<id>.json: threads with a page (≥3 shiurim). Always noindex (D8). */
export interface ThreadFile {
  schemaVersion: typeof LIVE_DATA_SCHEMA_VERSION;
  id: string;
  label: L;
  summary: L;
  reviewed: boolean;
  topics: { id: string; label: FacetLabel }[];
  /** By year (undated last); `text` is the per-shiur insight. */
  members: (CorpusMember & { text: L | null })[];
  shiurCount: number;
  datedCount: number;
  years: [number, number] | null;
  /** Show the year line as a timeline. */
  timeline: boolean;
}

/** A person on a story: a linked person, or a name printed as plain text. */
export type StoryPerson = { id: string; label: FacetLabel; page: boolean } | { name: string };

/** /data/story/<id>.json: stories with a page (≥2 tellings). */
export interface StoryFile {
  schemaVersion: typeof LIVE_DATA_SCHEMA_VERSION;
  id: string;
  title: L;
  retelling: L;
  reviewed: boolean;
  people: StoryPerson[];
  /** The tellings credit the story to different people; the page says so (the retelling does too). */
  attributionVaries: boolean;
  tellings: CorpusMember[];
}

/** /data/stories-index.json: every merged story, without retellings (Maasios). */
export interface StoryIndexRow {
  id: string;
  title: L;
  /** Linked people with a Live listing. */
  people: string[];
  tellings: number;
  langs: Ed[];
  page: boolean;
  /** The first telling: where a story without a page links. */
  first: { shiurId: string; momentId: string; t: number | null };
}

export interface StoriesIndexFile {
  schemaVersion: typeof LIVE_DATA_SCHEMA_VERSION;
  stories: StoryIndexRow[];
}

/** A glossary card ("as the term is used in these shiurim"). */
export interface GlossaryCard {
  id: string;
  he: string;
  label: L;
  definition: L;
  count: number;
  /** Live concept page. */
  page: boolean;
  /** Merged into this topic: the topic page is the entry. */
  topicId: string | null;
  /** "Hear it explained": up to three example sections. */
  examples: { shiurId: string; momentId: string; t: number }[];
}

/** /data/glossary/<prefix>.json */
export interface GlossaryShardFile {
  schemaVersion: typeof LIVE_DATA_SCHEMA_VERSION;
  shard: string;
  concepts: GlossaryCard[];
}

/** /data/explore/entities.json: entity id arrays per summarized shiur, for Explore's facets. */
export interface ExploreEntitiesFile {
  schemaVersion: typeof LIVE_DATA_SCHEMA_VERSION;
  shiurim: Record<string, { topics: string[]; people: string[]; concepts: string[]; works: string[] }>;
}

// ---------------------------------------------------------------------------------------------
// Map of every data path to its file type

export interface DataFiles {
  build: BuildFile;
  corpus: CorpusFile;
  facets: FacetsFile;
  today: TodayFile;
  shiur: ShiurFile;
  writeup: WriteupFile;
  series: SeriesFile;
  works: WorksFile;
  work: WorkFile;
  entity: EntityFile;
  stories: StoriesFile;
  moments: MomentShardFile;
  quickIndex: QuickIndexFile;
  topics: TopicsFile;
  topic: TopicFile;
  topicMoments: TopicMomentsFile;
  thread: ThreadFile;
  story: StoryFile;
  storiesIndex: StoriesIndexFile;
  glossary: GlossaryShardFile;
  exploreEntities: ExploreEntitiesFile;
}

export type DataKind = keyof DataFiles;

/** Keys of `KeyedValue` used in the contract (re-exported for convenience). */
export type { KeyedValue };
