// Shared contract between ingest (P0), pilot extraction (P4/P4b), and validation.

export type Lang = "yi" | "en";
export type SegIdx = number;
export type Confidence = number; // 0..1

export interface Localized {
  en: string;
  yi: string;
  he?: string;
}

// ---------- P0: ingest ----------

export type CatalogSource = "pocket-guide-2012" | "uncatalogued-guide";
export type DerivedFrom = "catalog" | "pocket-guide" | "dir-prefix" | "filename";

/** One audio file + its transcript in R2. */
export interface Recording {
  id: string;                 // stable slug, e.g. "y-parsha-bereishis-02-03-noach"
  audioKey: string;           // R2 key of the mp3
  transcriptKey: string | null; // R2 key prefix without extension: "transcripts/<path>" (has .json/.txt/.vtt), null if untranscribed
  durationSec: number | null; // from transcript json when available
  asrModel: string | null;
  sizeBytes: number;
  /** recording ids that are byte-for-byte / catalog-declared duplicates of this one (whole file vs parts). */
  duplicateOf: string | null;
  partOf: string | null;      // when this file is a part of another recording that covers it entirely
}

/** One logical shiur (a catalog row, or one side of a two-sided cassette row). */
export interface Shiur {
  id: string;                 // stable slug
  lang: Lang;
  category: "parsha" | "zman" | "shonos" | "set" | "simcha" | "misc" | "current" | "purim";
  seriesId: string | null;    // e.g. "tanya-yi", "emunah-en"
  seriesOrder: number | null; // order within series
  catalog: {
    source: CatalogSource;
    sectionId: string;        // catalog section id, e.g. "tanya-1"
    sectionTitle: string;
    n: string | null;
    page: number | null;
    titleOriginal: string;    // inyan/title as in catalog (Hebrew/Yiddish/English)
    subTitle: string | null;
    /** topic heading (`inyan`) when the row has both inyan and a detailed title (shonos, English misc). */
    heading?: string;
    derived: DerivedFrom;     // "catalog" for pocket-guide rows; uncatalogued rows carry their own `derived`
    note: string | null;
  };
  parsha: string | null;      // catalog spelling, e.g. "נח"
  zman: string | null;
  perek: string | null;       // Tanya perek etc.
  hebrewYears: number[];      // e.g. [5736]; parsed from shana/year
  recordingIds: string[];     // in playback order
  inScope: boolean;           // false for purim seudos, untranscribed, junk
  outOfScopeReason: string | null;
  pathNotes: string[];        // e.g. "imperfect sound quality"
}

export interface Series {
  id: string;
  title: Localized;
  lang: Lang;
  catalogSectionIds: string[];
  shiurIds: string[];         // ordered
}

export interface IngestOutput {
  generatedAt: string;
  stats: Record<string, number>;
  shiurim: Shiur[];
  recordings: Recording[];
  series: Series[];
  warnings: string[];
}

// ---------- P4 / P4b: extraction and write-up (written by LLM, validated by code) ----------

export interface Evidence {
  segs: SegIdx[];             // segment indices into the recording transcript
  confidence: Confidence;
  /** Which recording `segs` index into. Required when the shiur has >1 recording; may be omitted
   *  for single-recording shiurim. Write-up paragraphs default to their section's recording. */
  recordingId?: string;
}

export interface SegRange {
  recordingId: string;
  startSeg: SegIdx;
  endSeg: SegIdx;             // inclusive
}

export type SectionKind = "intro" | "main" | "story" | "tangent" | "closing" | "brachah" | "singing" | "other_speaker" | "noise";

export interface Section extends SegRange {
  title: Localized;
  summary: Localized;         // 1-3 sentences each
  kind: SectionKind;
  catalogTopicIdx: number[];  // which items of the catalog title (split on ';') this section covers
  subsections: (SegRange & { title: Localized; summary: Localized })[];
}

export interface SourceMention {
  heardAs: string;
  work: string | null;        // canonical work name, e.g. "Tanya", "Bereishis", "Bnei Yissaschar"
  ref: string | null;         // e.g. "Tanya ch. 2", "Bereishis 6:9"
  sefariaRef: string | null;  // Sefaria-style ref
  /** resolved: ref + sefariaRef both set; inferred: ref set (sefariaRef optional); unresolved: ref and sefariaRef null. */
  resolution: "resolved" | "inferred" | "unresolved";
  mention: "quoted" | "paraphrased" | "alluded";
  evidence: Evidence;
}

export interface Extraction {
  shiurId: string;
  model: string;              // "sonnet" | "opus" | "haiku"
  variant: string;            // e.g. "raw" | "cleaned"
  /** Version of prompts/p4-extract.md that produced it ("p4-v3"); absent in pilot outputs. */
  promptVersion?: string;
  summary: {
    oneLiner: Localized;
    abstract: Localized;      // 80-150 words en, 80-180 yi
    keyPoints: { text: Localized; evidence: Evidence }[]; // 3-7
  };
  sections: Section[];        // must tile each recording with no gaps/overlaps
  sources: SourceMention[];
  insights: { text: Localized; evidence: Evidence }[];      // 3-7
  stories: { title: Localized; retelling: Localized; people: string[]; evidence: Evidence }[];
  questions: { question: Localized; answer: Localized; questionSegs: SegIdx[]; answerSegs: SegIdx[]; confidence: Confidence; recordingId?: string }[]; // <=6; recordingId as in Evidence
  takeaways: { text: Localized; evidence: Evidence }[];     // <=5
  candidateTopics: string[];  // free English noun phrases, 5-10
  concepts: { he: string; heardAs: string[] }[];            // glossary candidates
  people: { name: string; heardAs: string[] }[];
  asrNotes: string;           // free text: how bad was the ASR, what couldn't be recovered
}

/** P4b output: the long-form write-up, written from input.txt + an already-validated Extraction. */
export interface Writeup {
  shiurId: string;
  model: string;              // "opus" | "sonnet" | ...
  variant: string;            // e.g. "raw"
  /** Version of prompts/p4b-writeup.md that produced it ("p4b-v2"); absent in pilot outputs. */
  promptVersion?: string;
  /** File stem of the extraction this write-up was built on, in the same directory
   *  (production: "extraction" -> data/derived/shiurim/<shiurId>/extraction.json).
   *  `sectionIndex` and `sourceIdx` index into that extraction's sections[] and sources[]. */
  extractionVariant: string;
  en: WriteupBlock[];
  yi: WriteupBlock[];
}

export interface WriteupBlock {
  sectionIndex: number;
  heading: string | null;
  paragraphs: { text: string; sourceIdx: number[]; evidence: Evidence }[];
}

// ---------- P4c: translations into further languages ----------
//
// P4/P4b write `en` and `yi` directly from the transcript. Every further content language comes from
// P4c, which translates the already-validated `en`/`yi` text (never the transcript) into one target
// language. Translations are overlays: the P4/P4b files are never edited, and a translation is keyed
// by the path of the text it translates, so any number of languages can be added side by side.
// `scripts/translate.ts` builds the source, validates and reports status; prompts/p4c-translate.md
// is the agent contract.

/** Languages produced by P4c translation. Add a language here, plus its style guide in prompts/. */
export type TranslationLang = "he";
export const TRANSLATION_LANGS: readonly TranslationLang[] = ["he"];

/**
 * `data/derived/shiurim/<shiurId>/i18n/<lang>.json`.
 *
 * Keys of `text`:
 * - `x.<path>`: the `Localized` object at that path in extraction.json, e.g. `x.summary.oneLiner`,
 *   `x.sections.2.title`, `x.sections.2.subsections.0.summary`, `x.summary.keyPoints.3.text`,
 *   `x.stories.1.retelling`, `x.questions.0.answer`.
 * - `w.<block>.heading`, `w.<block>.paragraphs.<p>.text`: the write-up, mirroring writeup.json's `yi`
 *   blocks one-to-one (same block and paragraph indices, so `sectionIndex`, `sourceIdx` and `evidence`
 *   are taken from the `yi` paragraph). A `yi` heading that is null has no key.
 */
export interface ShiurTranslation {
  shiurId: string;
  lang: TranslationLang;
  model: string;
  promptVersion: string;
  /** Hash of the en/yi source text it was made from; a mismatch means the translation is stale. */
  sourceHash: string;
  text: Record<string, string>;
}

/**
 * `data/derived/corpus/i18n/<lang>/<part>.json`: translations of corpus-level text. Any number of
 * part files; a reader merges all of them. An entry key is `<collection>:<id>`; a text key is
 * `<entryKey>.<field path>`:
 * - `concepts:<id>.label|definition`, `stories:<id>.title|retelling`, `topics:<id>.label|description`,
 *   `teaching-clusters:<id>.label|summary`, `people:<id>.description`
 * - `series:<seriesId>.title|overview`, `series:<seriesId>.keyThemes.<i>`,
 *   `series:<seriesId>.arc.<shiurId>.oneLiner`
 */
export interface CorpusTranslation {
  lang: TranslationLang;
  model: string;
  promptVersion: string;
  /** Per entry key, the hash of that entry's en/yi source text. */
  sourceHashes: Record<string, string>;
  text: Record<string, string>;
}
