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

export const LIVE_DATA_SCHEMA_VERSION = 1;

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
  /** Ids only; labels are in `facets.json`. */
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
  /** The same series in the other audio language, if any. */
  sibling: string | null;
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
  work: Record<string, FacetValue>;
  person: Record<string, FacetValue>;
  concept: Record<string, FacetValue>;
}

// ---------------------------------------------------------------------------------------------
// /data/today.json

export interface TodayOccasion {
  /** Shiurim for this occasion, ordered by Hebrew year (undated last). Both audio languages. */
  shiurIds: string[];
  /** Candidate pool for "a moment for today" (insights, stories, questions); chosen per date client-side. */
  moments: MomentRef[];
}

export interface TodayFile {
  schemaVersion: typeof LIVE_DATA_SCHEMA_VERSION;
  occasions: Record<string, TodayOccasion>;
  /** Shiurim whose notes landed recently (manifest `updatedAt`), newest first. */
  newlySummarized: { shiurId: string; updatedAt: string }[];
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
}

export interface ShiurFile extends Omit<PublicShiur, "recordings" | "notes"> {
  schemaVersion: typeof LIVE_DATA_SCHEMA_VERSION;
  recordings: LiveRecording[];
  /** Present only when `status === "full"`. */
  notes?: LiveNotes;
  related: ShiurRelated;
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

export interface SeriesFile {
  schemaVersion: typeof LIVE_DATA_SCHEMA_VERSION;
  id: string;
  title: L;
  lang: Ed;
  sibling: string | null;
  parts: SeriesPart[];
  /** Tanya: parts grouped by perek, in order. Empty for series without perakim. */
  perekGroups: { perek: string; shiurIds: string[] }[];
}

// ---------------------------------------------------------------------------------------------
// /data/works.json and /data/work/<key>.json

export interface WorkSummary {
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
}

export type DataKind = keyof DataFiles;

/** Keys of `KeyedValue` used in the contract (re-exported for convenience). */
export type { KeyedValue };
