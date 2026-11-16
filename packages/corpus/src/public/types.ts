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
import type { AudioTable, AudioTableEntry, MediaUrl } from "@emunas/audio";
import type { CatalogSource, DerivedFrom, SectionKind, Shiur } from "../../../../src/types.ts";

export type { CatalogSource, DerivedFrom, SectionKind };
/** `.corpus/audio-table.json`: recordingId → { url, canonicalId, playable, size } (built by `@emunas/audio`). */
export type { AudioTable, AudioTableEntry, MediaUrl };
export type Ed = "yi" | "en";
export type Category = Shiur["category"];

/** Two-language text. (`he` from the raw `Localized` is not published.) */
export interface L {
  en: string;
  yi: string;
}

export type ShiurStatus = "full" | "catalog-only";

interface PublicRecordingBase {
  id: string;
  /** Position in playback order (0-based). */
  order: number;
  /** Global seconds at which this recording starts (cumulative duration of the earlier ones). */
  offset: number;
  /** Seconds. */
  duration: number;
  /** Literal `false` today; turning the transcript view on is a deliberate type change (§0.3, C17). */
  transcript: { eligible: false };
}

/**
 * A recording. Audio is served from the media host (Amendment A1): `audioUrl` is
 * `${EMUNAS_MEDIA_ORIGIN}/<per-segment-encoded bucket key>` (a duplicate gets its canonical's URL).
 * Recordings whose object is not an mp3 (3 `.WMA` today) are `playable: false` with `audioUrl: null`
 * and are shown as unavailable. The bucket key itself is never published.
 */
export type PublicRecording = PublicRecordingBase &
  ({ audioUrl: MediaUrl; playable: true } | { audioUrl: null; playable: false });

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

export type SkipKind = SectionKind | "pause";
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

/**
 * A story moment. No person names: the extraction's raw names may be ASR mishearings, so names come
 * only from the corpus layer (the merged story's people, linked entities' display names).
 */
export interface PublicStory {
  id: string;
  title: L;
  retelling: L;
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
  /*
   * No people or concept names: raw extraction names may be ASR mishearings. People, terms and
   * their names come from the corpus layer refs (`layer/shiur/<id>.json`) and entity files.
   */
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

/**
 * A catalog row that has no recording (concept-quiet decision 3, tech-quiet §4): listed in a guide
 * but its audio is not on disk or not in the bucket. Catalog fields only; it gets no page and no
 * shiur file, and is shown greyed as "no recording" in its section. Purim rows are not listed.
 */
export interface CatalogGap {
  id: string;
  lang: Ed;
  category: Category;
  catalog: Omit<PublicCatalog, "topics" | "note">;
  /** `${source}:${sectionId}`, as in `sections[].key`. */
  sectionKey: string;
  /**
   * The in-scope shiur of the same section that precedes this row in catalog order (null: the row
   * comes first), so a section page can put the row where the guide prints it.
   */
  after: string | null;
  reason: CatalogGapReason;
  parsha: KeyedValue | null;
  zman: KeyedValue | null;
  perek: string | null;
  years: number[];
  series: { id: string; order: number | null } | null;
}

/** `not-on-disk`: the 2012 guide lists it but no file exists; `not-in-bucket`: the file never reached the bucket. */
export type CatalogGapReason = "not-on-disk" | "not-in-bucket";

export interface CorpusIndex {
  schemaVersion: number;
  sections: IndexSection[];
  series: PublicSeries[];
  shiurim: IndexRow[];
  /** Guide rows without audio, in catalog order (not part of `shiurim`). */
  gaps: CatalogGap[];
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
  /** Origin every `audioUrl` starts with (for CSP `media-src`); `EMUNAS_MEDIA_ORIGIN` or the dev placeholder. */
  mediaOrigin: string;
  counts: BuildCounts;
}
