// Corpus-wide layer (P7-P11): taxonomy, glossary, entities, series syntheses, stories,
// teaching clusters and per-shiur tags. Built from the per-shiur outputs in
// data/derived/shiurim/<shiurId>/{extraction.json, writeup.json, meta.json} (see ./types.ts).
//
// This file is the contract between the corpus agents and the website. Output files are
// documented in docs/corpus-data.md. All ids are stable ASCII kebab-case slugs.

import type { Lang, SectionKind } from "./types.js";

/** English + Yiddish (Chassidish orthography) text pair. */
export interface Bilingual {
  en: string;
  yi: string;
}

/** Every corpus entity is generated automatically; human review is a later step. */
export type ReviewStatus = "unreviewed" | "reviewed";

/**
 * A node in the topic taxonomy (max 3 levels). Level 1 is seeded from the Pocket Guide
 * sections; a leaf needs enough shiurim to stand on its own (see docs/data-generation-plan.md).
 */
export interface Topic {
  /** Stable ASCII kebab slug, e.g. "emunah", "emunah-hashgacha-pratis". */
  id: string;
  /** Parent topic id; null for level-1 topics. */
  parentId: string | null;
  level: 1 | 2 | 3;
  /** Display label; `he` when the topic has a natural loshon-hakodesh name. */
  label: { en: string; yi: string; he?: string };
  /** Alternate phrasings (lowercase English candidate-topic phrases folded into this topic, Hebrew terms). */
  aliases: string[];
  /** Short description of what the topic covers; null when the label speaks for itself. */
  description: Bilingual | null;
  /** Number of shiurim tagged with this topic or any descendant. */
  shiurCount: number;
  /** Representative shiurim for the topic page (highest salience first), subset of tagged shiurim. */
  hubShiurIds: string[];
  reviewStatus?: ReviewStatus;
}

/** A glossary entry: a Torah/Chassidus concept as the Rav uses it. Doubles as the ASR correction list. */
export interface Concept {
  /** Stable ASCII kebab slug from the transliteration, e.g. "bitachon", "tzimtzum". */
  id: string;
  /** Canonical spelling in loshon-hakodesh, e.g. "ביטחון". */
  canonicalHe: string;
  label: Bilingual;
  /** Latin-script spellings, e.g. ["bitachon", "bitochon"]. */
  transliterations: string[];
  /** Misspellings produced by ASR (from extraction.concepts[].heardAs). Internal; useful for search expansion. */
  asrVariants: string[];
  /** Definition as the Rav uses the term, grounded in the shiurim that mention it. */
  definition: Bilingual;
  /** Shiurim whose extraction lists this concept. */
  shiurIds: string[];
  /** Sections that illustrate the concept well (index into that shiur's extraction.sections[]). */
  exampleRefs: { shiurId: string; sectionIndex: number }[];
  reviewStatus?: ReviewStatus;
}

export type PersonType = "tanach" | "chazal" | "rishon" | "acharon" | "chassidic_rebbe" | "other";

/** A person mentioned in the shiurim (from extraction.people[] and stories[].people). */
export interface Person {
  /** Stable ASCII kebab slug, e.g. "baal-shem-tov", "rambam", "avraham-avinu". */
  id: string;
  nameHe: string;
  nameEn: string;
  /** Yiddish (Chassidish orthography) form of the name as readers would say it. */
  nameYi: string;
  type: PersonType;
  /** Other names/titles, e.g. "the Besht", "Reb Yisroel Baal Shem Tov". */
  aliases: string[];
  /** ASR misspellings (from extraction.people[].heardAs). */
  asrVariants: string[];
  shiurIds: string[];
  reviewStatus?: ReviewStatus;
}

/** A sefer / text cited in the shiurim (from extraction.sources[].work). */
export interface Work {
  /** Stable ASCII kebab slug, e.g. "tanya", "bnei-yissaschar", "bereishis". */
  id: string;
  titleHe: string;
  titleEn: string;
  /** Other spellings of the work name found in extractions (e.g. "Likutei Amarim"). */
  aliases: string[];
  /** ASR misspellings (from sources[].heardAs). */
  asrVariants: string[];
  /** Person id of the author when known (a Person entry must exist), else null. */
  authorPersonId: string | null;
  /** Sefaria index title when the work exists on Sefaria, e.g. "Tanya", "Bnei Yissaschar". */
  sefariaIndexTitle: string | null;
  /** Shiurim that cite the work. */
  shiurIds: string[];
  reviewStatus?: ReviewStatus;
}

/** Overview of one catalog series (ingest.json series[]), written from its shiurim's extractions. */
export interface SeriesSynthesis {
  /** Same id as ingest Series.id, e.g. "tanya-yi". */
  seriesId: string;
  title: Bilingual;
  /** What the series covers as a whole and how it builds. */
  overview: Bilingual;
  /** One entry per shiur, in series order. `part` is 1-based position in the series. */
  arc: { shiurId: string; part: number; oneLiner: Bilingual }[];
  keyThemes: Bilingual[];
  reviewStatus?: ReviewStatus;
}

/** A maaseh (story), deduplicated across every shiur that tells it. */
export interface Story {
  /** Stable ASCII kebab slug, e.g. "baal-shem-tov-and-the-simple-shepherd". */
  id: string;
  title: Bilingual;
  /** Merged retelling grounded in the tellings below (third-person, reported). */
  retelling: Bilingual;
  /** Person ids where resolved, otherwise the name as it appears in the extraction. */
  people: string[];
  /** Each telling: index into that shiur's extraction.stories[]. */
  tellings: { shiurId: string; storyIndex: number }[];
  reviewStatus?: ReviewStatus;
}

/** The same idea taught across several shiurim/years. */
export interface TeachingCluster {
  /** Stable ASCII kebab slug. */
  id: string;
  label: Bilingual;
  summary: Bilingual;
  topicIds: string[];
  /** Each member: index into that shiur's extraction.insights[]. */
  members: { shiurId: string; insightIndex: number }[];
  reviewStatus?: ReviewStatus;
}

/** Closed-list tags for one shiur (P8 re-tag against the frozen taxonomy and glossary). */
export interface ShiurTags {
  shiurId: string;
  /** At most 8 topics; salience 0..1 (1 = the shiur's main subject). */
  topics: { id: string; salience: number }[];
  /** Per section (index into extraction.sections[]), at most 3 topic ids. */
  sections: { index: number; topicIds: string[] }[];
  conceptIds: string[];
  personIds: string[];
  workIds: string[];
  /** Parallel to extraction.sources[]: the Work id each source resolves to, or null. */
  sourceWorkIds: (string | null)[];
}

/** One line of search/sections.jsonl: the search hit unit (one section of one shiur). */
export interface SearchSectionDoc {
  /** `${shiurId}#${sectionIndex}` */
  id: string;
  shiurId: string;
  sectionIndex: number;
  lang: Lang;
  kind: SectionKind;
  recordingId: string;
  startSeg: number;
  endSeg: number;
  /** Start/end time in seconds, converted in code from the transcript's segments; null if unavailable. */
  startSec: number | null;
  endSec: number | null;
  shiurTitle: string;
  title: Bilingual;
  summary: Bilingual;
  topicIds: string[];
  seriesId: string | null;
  parsha: string | null;
  zman: string | null;
  hebrewYears: number[];
}

/** data/derived/corpus/index.json */
export interface CorpusIndex {
  version: number;
  generatedAt: string;
  /** Shiurim with manifest status "done" that the corpus covers. */
  shiurIds: string[];
  counts: {
    shiurim: number;
    topics: number;
    concepts: number;
    people: number;
    works: number;
    series: number;
    stories: number;
    teachingClusters: number;
    searchSections: number;
  };
  /** Files under data/derived/corpus/, relative paths. */
  files: string[];
}
