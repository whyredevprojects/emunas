/**
 * The public data contract (integration-plan §5.2). Everything in `.corpus/` that apps read has one
 * of these shapes. Browser-safe: types only.
 *
 * Built field by field by the projector (`src/build/project.ts`), never by stripping raw objects, so a
 * field the pipeline adds later stays unpublished until someone maps it here on purpose.
 *
 * Never present (type test + guard): heardAs, asrNotes, segs, startSeg, endSeg, questionSegs,
 * answerSegs, segments, transcriptKey, audioKey, asrModel, model, variant, noise types.
 */
import type { CatalogSource, DerivedFrom, SectionKind, Shiur } from "../../../../src/types.ts";

export type { CatalogSource, DerivedFrom, SectionKind };
export type Ed = "yi" | "en";
export type Category = Shiur["category"];

/** Two-language text. (`he` from the raw `Localized` is not published.) */
export interface L {
  en: string;
  yi: string;
}

export type ShiurStatus = "full" | "catalog-only";

export interface PublicRecording {
  id: string;
  /** Position in playback order (0-based). */
  order: number;
  /** Global seconds at which this recording starts (cumulative duration of the earlier ones). */
  offset: number;
  /** Seconds. */
  duration: number;
  audio: `/audio/${string}.mp3`;
  /** Literal `false` today; turning the transcript view on is a deliberate type change (§0.3, C17). */
  transcript: { eligible: false };
}

/**
 * A timed item. `t`/`end` are global seconds. They are `null` only when the item's evidence could
 * not be resolved to a time (out-of-range segment, or no recording given on a multi-recording
 * shiur); the item is kept and the build report lists it (C6).
 */
export interface Moment {
  id: string;
  text: L;
  t: number | null;
  end: number | null;
  soft?: true;
}

export interface PublicChapter {
  /** Index into the extraction's sections (= write-up `sectionIndex`); moment id `<shiur>~s<idx>`. */
  idx: number;
  id: string;
  recordingId: string;
  t: number;
  end: number;
  title: L;
  summary: L;
  kind: SectionKind;
  catalogTopicIdx: number[];
  sub: { title: L; summary: L; t: number }[];
}

export type SkipKind = SectionKind | "asr-noise";
/** [startSec, endSec, kind] in global seconds. */
export type SkipRange = [number, number, SkipKind];

export type Resolution = "resolved" | "inferred" | "unresolved";
export type MentionKind = "quoted" | "paraphrased" | "alluded";

export interface PublicSource {
  /** Index in the published (filtered) source list; write-up `src` arrays point here. */
  idx: number;
  id: string;
  work: string | null;
  workKey: string | null;
  ref: string | null;
  sefariaRef: string | null;
  resolution: Resolution;
  mention: MentionKind;
  t: number | null;
  soft?: true;
}

export interface PublicQuestion {
  id: string;
  q: L;
  a: L;
  tq: number | null;
  ta: number | null;
  soft?: true;
}

export interface PublicStory {
  id: string;
  title: L;
  retelling: L;
  people: string[];
  peopleKeys: string[];
  t: number | null;
  end: number | null;
  soft?: true;
}

export interface PublicWriteupParagraph {
  id: string;
  text: string;
  /** Indexes into `notes.sources` (already remapped to the filtered list). */
  src: number[];
  t: number | null;
  end: number | null;
}

export interface PublicWriteupBlock {
  sectionIndex: number;
  heading: string | null;
  paragraphs: PublicWriteupParagraph[];
}

export interface PublicNotes {
  summary: { oneLiner: L; abstract: L; keyPoints: Moment[] };
  /** In playback order; they tile [0, duration] exactly. */
  chapters: PublicChapter[];
  skip: SkipRange[];
  sources: PublicSource[];
  insights: Moment[];
  takeaways: Moment[];
  questions: PublicQuestion[];
  stories: PublicStory[];
  people: { name: string; key: string }[];
  concepts: { he: string; key: string }[];
  writeup: Record<Ed, PublicWriteupBlock[]>;
}

export interface PublicCatalog {
  source: CatalogSource;
  sectionId: string;
  sectionTitle: string;
  n: string | null;
  page: number | null;
  titleOriginal: string;
  subTitle: string | null;
  heading?: string;
  derived: DerivedFrom;
  note: string | null;
  /** The catalog title split on ';' (human catalog text; `catalogTopicIdx` points here). */
  topics: string[];
}

export interface KeyedValue {
  raw: string;
  key: string;
}

export interface PublicShiur {
  id: string;
  /** Short content hash of every input of this shiur + projector/keyer/schema versions. */
  rev: string;
  lang: Ed;
  category: Category;
  catalog: PublicCatalog;
  parsha: KeyedValue | null;
  zman: KeyedValue | null;
  perek: string | null;
  years: number[];
  series: { id: string; order: number | null; count: number } | null;
  pathNotes: string[];
  /** Seconds, sum of the recordings. */
  duration: number;
  recordings: PublicRecording[];
  status: ShiurStatus;
  /** Present only when status === "full". */
  notes?: PublicNotes;
}

/** One row of `.corpus/index.json`. */
export interface IndexRow {
  id: string;
  rev: string;
  lang: Ed;
  category: Category;
  status: ShiurStatus;
  catalog: Omit<PublicCatalog, "topics" | "note">;
  parsha: KeyedValue | null;
  zman: KeyedValue | null;
  perek: string | null;
  years: number[];
  series: { id: string; order: number | null; count: number } | null;
  duration: number;
  recordingIds: string[];
  oneLiner: L | null;
  entities: { works: string[]; people: string[]; concepts: string[] };
  counts: { chapters: number; sources: number; stories: number; questions: number; insights: number };
}

export interface IndexSection {
  /** `${source}:${id}`; section ids repeat across the two catalogs. */
  key: string;
  source: CatalogSource;
  id: string;
  title: string;
  /** Position in catalog order (pocket guide first, then the uncatalogued guide). */
  order: number;
  pages: [number, number] | null;
  dir: "rtl" | "ltr" | null;
}

export interface PublicSeries {
  id: string;
  title: L;
  lang: Ed;
  catalogSectionIds: string[];
  /** In-scope shiurim, ordered. */
  shiurIds: string[];
}

export interface CorpusIndex {
  schemaVersion: number;
  sections: IndexSection[];
  series: PublicSeries[];
  shiurim: IndexRow[];
}

export interface BuildCounts {
  total: number;
  full: number;
  catalogOnly: number;
  /** Manifest says done but the shiur was published catalog-only. */
  downgraded: number;
}

export interface BuildInfo {
  buildId: string;
  dataSha: string | null;
  schemaVersion: number;
  counts: BuildCounts;
}

export interface AudioTableEntry {
  size: number;
  canonicalId: string;
}
export type AudioTable = Record<string, AudioTableEntry>;
