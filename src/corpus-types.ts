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
  /**
   * Calendar join key: catalog parsha spellings, exactly as in ingest.json shiurim[].parsha (including the catalog's
   * own variants, e.g. "פנחס"/"פינחס", "בהר-בחקתי"/"בהר בחקותי", and mixed values such as "שלח קינדער").
   * A sefer topic (sefer-bereishis ... sefer-devarim) lists every parsha of that sefer that occurs in the catalog;
   * a narrative topic under a sefer lists the parshiyos it is read in (noach-mabul -> ["נח"]).
   * Absent when the topic does not follow the parsha cycle.
   */
  parsha?: string[];
  /**
   * Calendar join key: catalog zman spellings, exactly as in ingest.json shiurim[].zman
   * (e.g. ["ל\"ג בעומר", "ל”ג בעומר", "סעודת ל\"ג בעומר"]). A parent topic's list includes its descendants' keys.
   * Absent when the topic is not a yom tov, month or zman.
   */
  zman?: string[];
  /** Number of shiurim tagged with this topic or any descendant. */
  shiurCount: number;
  /** Representative shiurim for the topic page (highest salience first), subset of tagged shiurim. */
  hubShiurIds: string[];
  /** Set when an entity page with the same id exists (the topic and that entity are the same subject). */
  sameAs?: { conceptId?: string; personId?: string; workId?: string };
  reviewStatus?: ReviewStatus;
}

/** A glossary entry: a Torah/Chassidus concept as the Mashgiach uses it. Doubles as the ASR correction list. */
export interface Concept {
  /** Stable ASCII kebab slug from the transliteration, e.g. "bitachon", "tzimtzum". */
  id: string;
  /** Canonical spelling in loshon-hakodesh, e.g. "ביטחון". */
  canonicalHe: string;
  label: Bilingual;
  /** Latin-script spellings, e.g. ["bitachon", "bitochon"]. */
  transliterations: string[];
  /** Definition as the Mashgiach uses the term, grounded in the shiurim that mention it. */
  definition: Bilingual;
  /** Shiurim whose extraction lists this concept. */
  shiurIds: string[];
  /** Sections that illustrate the concept well (index into that shiur's extraction.sections[]). */
  exampleRefs: { shiurId: string; sectionIndex: number }[];
  reviewStatus?: ReviewStatus;
}

/**
 * tanach: figures of Tanach (incl. Midrash about them).
 * chazal: Tannaim, Amoraim and Second-Temple/Talmudic-era figures such as Matisyahu Kohen Gadol.
 * rishon / acharon: Torah authorities of those eras (acharon also covers later rabbanim and well-known chassidim who were not rebbes).
 * chassidic_rebbe: chassidic rebbes.
 * malach: malachim and other non-human spiritual beings (e.g. Samael, Ashmedai).
 * ruler: kings, emperors, heads of state, political and military leaders outside Tanach (e.g. Titus, Napoleon, Yannai HaMelech).
 * individual: private persons known from stories or the Mashgiach's own life (Kamtza, Dama ben Nesina, chassidim, acquaintances, gabbaim).
 * other: everyone else (thinkers, writers, scientists, public figures, founders of other religions, named groups).
 */
export type PersonType =
  | "tanach"
  | "chazal"
  | "rishon"
  | "acharon"
  | "chassidic_rebbe"
  | "malach"
  | "ruler"
  | "individual"
  | "other";

/**
 * A person mentioned in the shiurim (from extraction.people[] and stories[].people). One entry is one person:
 * pairs and lists ("Kamtza and Bar Kamtza") resolve to the individuals, and roles (Moshiach, the Kohen Gadol)
 * are concepts. Exception: inseparable pairs with no individual entries (bigsan-and-teresh, shamchazai-and-uza).
 */
export interface Person {
  /** Stable ASCII kebab slug, e.g. "baal-shem-tov", "rambam", "avraham-avinu". */
  id: string;
  nameHe: string;
  nameEn: string;
  /** Yiddish (Chassidish orthography) form of the name as readers would say it. */
  nameYi: string;
  type: PersonType;
  /**
   * Disambiguation note: who this entry is and how it differs from similarly named persons
   * (e.g. the Amora Rav vs "the Mashgiach"; the unspecified Belzer Rav; the Beis Aharon vs Rabbi Aharon HaGadol of Karlin).
   */
  description?: Bilingual;
  /** Other names/titles, e.g. "the Besht", "Reb Yisroel Baal Shem Tov". */
  aliases: string[];
  shiurIds: string[];
  reviewStatus?: ReviewStatus;
}

/**
 * What sort of text a Work is.
 * - "genre": a collection (midrash, talmud-bavli, mishnah, midrash-rabbah, targum, ...), or an author's writings cited by
 *   name (rashi, ramban, rambam, tosafos, chasam-sofer, ...) that have specific sub-works listed under them.
 * - "tanach-book": a book of Tanach, incl. the combined books (sefer-shmuel, sefer-melachim, divrei-hayamim).
 * - "talmud-tractate": a Bavli or Yerushalmi tractate (parentWorkId tells which).
 * - "mishnah-tractate": a Mishnah tractate, incl. Pirkei Avos.
 * - "liturgy": siddur/machzor texts, tefillos, piyutim, zemiros, the Haggadah, Perek Shirah.
 * - "document": a single document, letter or essay (kesubah, tzava'ah).
 * - "sefer": any other book.
 */
export type WorkKind = "sefer" | "genre" | "tanach-book" | "talmud-tractate" | "mishnah-tractate" | "liturgy" | "document";

/** A sefer / text cited in the shiurim (from extraction.sources[].work). */
export interface Work {
  /** Stable ASCII kebab slug, e.g. "tanya", "bnei-yissaschar", "bereishis". */
  id: string;
  titleHe: string;
  titleEn: string;
  kind: WorkKind;
  /**
   * Canonical sort key, or null when the work has no natural position. One global scale: Tanach books 1-39 in Tanach
   * order (a combined book such as sefer-shmuel shares its first part's number); tractates 100 + Mishnah-order number
   * (Berachos 101 ... Avos 139 ... Uktzin 163), shared by Bavli, Yerushalmi and Mishnah; a work on exactly one Tanach
   * book or tractate (Rashi on Bereishis, Tosafos on Pesachim, Shemos Rabbah) takes its base text's number;
   * Shulchan Aruch sections 1-4 (OC, YD, EH, CM). Compare only among works of the same kind or the same parentWorkId.
   */
  order: number | null;
  /**
   * The larger work or collection this is part of, else null: a tractate -> talmud-bavli / talmud-yerushalmi / mishnah;
   * rashi-on-bereishis -> rashi-on-the-torah -> rashi; tosafos-* -> tosafos; Midrash Rabbah books -> midrash-rabbah;
   * Shulchan Aruch sections -> shulchan-aruch; shmuel-i -> sefer-shmuel. Always an existing work id; at most 2 levels deep.
   * A parent's shiurIds cover only sources that cite it generically; they are not a roll-up of its children.
   */
  parentWorkId: string | null;
  /** Other spellings of the work name found in extractions (e.g. "Likutei Amarim"). */
  aliases: string[];
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
  /**
   * True when the tellings credit the story to different people (or differ on details that matter); the merged
   * retelling then says so in reported speech, and `people` lists every person named. Absent = the tellings agree.
   */
  attributionVaries?: boolean;
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
  /** Share (0..1) of the shiur's time in sections of kind other_speaker. Shiurim at >= 0.5 are left out of topic hubs. */
  otherSpeakerShare: number;
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
  /** Section-level topic ids (from shiur-tags sections[].topicIds). */
  topicIds: string[];
  /** Shiur-level concept ids (shiur-tags conceptIds); concepts are not tagged per section. */
  conceptIds: string[];
  seriesId: string | null;
  parsha: string | null;
  zman: string | null;
  hebrewYears: number[];
}

/** data/derived/corpus/index.json */
export interface CorpusIndex {
  /** Bumped whenever any shape changes. 2: Work kind/order/parentWorkId, Person description and new types, Topic parsha/zman, Story attributionVaries, cross-kind redirects. */
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
    /** Number of shiur-tags/<shiurId>.json files (equals shiurim). */
    shiurTags: number;
  };
  /** Files under data/derived/corpus/, relative paths. */
  files: string[];
  /** Level-1/2 topic ids whose `description` is still null, waiting for the description pass. */
  pendingDescriptions: string[];
}

/** The entity kinds that redirects.json is keyed by. */
export type RedirectKind = "topics" | "concepts" | "people" | "works" | "stories";

/**
 * A redirect target. A plain string is an id of the same kind as the retired id. The object form points at an
 * entity of another kind, e.g. the retired person `moshiach` -> `{ kind: "concepts", id: "mashiach" }`.
 */
export type RedirectTarget = string | { kind: RedirectKind; id: string };

/**
 * redirects.json: retired id -> the entity it was merged into, per entity kind. For redirecting old addresses.
 * Every target exists (checked by corpus:assemble) and no retired id is live again.
 */
export type Redirects = { [K in RedirectKind]?: Record<string, RedirectTarget> };
