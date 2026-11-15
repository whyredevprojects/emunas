/**
 * Shapes of the aggregate files in `.corpus/` (integration-plan §5.1, W2.1). Types only and
 * browser-safe. Every list is in a fixed, deterministic order; ties are broken by catalog order
 * (the order of `index.json` rows) and then by id.
 *
 * These files carry ids, keys, catalog text, AI-derived titles and times only. Story retellings,
 * write-up text and anything from transcripts are not here.
 */
import type { Ed, L, MentionKind, Resolution, ShiurStatus } from "../public/types.ts";

// ---------------------------------------------------------------- sections.json

export interface SectionListing {
  /** `${source}:${id}` as in index.json `sections`. */
  key: string;
  source: string;
  id: string;
  title: string;
  order: number;
  count: number;
  /** Catalog order. Every in-scope shiur is in exactly one section. */
  shiurIds: string[];
}

export interface SectionsFile {
  sections: SectionListing[];
}

// ---------------------------------------------------------------- neighbours.json

export interface NavPosition {
  /** Section key or series id. */
  of: string;
  /** 1-based position. */
  pos: number;
  count: number;
  prev: string | null;
  next: string | null;
}

export interface Neighbours {
  section: NavPosition;
  series: NavPosition | null;
  /**
   * Other shiurim with the same parsha or zman key (both languages, by year). Empty for the
   * "other" bucket and for uncatalogued rows whose parsha/zman is a file-name guess.
   */
  sameOccasion: string[];
}

export type NeighboursFile = Record<string, Neighbours>;

// ---------------------------------------------------------------- series.json

export interface SeriesPart {
  id: string;
  /** `seriesOrder` from the catalog (may be null). */
  order: number | null;
  perek: string | null;
  lang: Ed;
  status: ShiurStatus;
}

export interface SeriesEntry {
  id: string;
  title: L;
  lang: Ed;
  catalogSectionIds: string[];
  count: number;
  /** The same set in the other language (`tanya-yi` ↔ `tanya-en`); a link, not a merge. */
  sibling: string | null;
  /** Ordered. */
  parts: SeriesPart[];
  /**
   * Present when the parts carry a `perek` (Tanya): consecutive runs of parts with the same perek
   * (spellings differing only in quote marks count as the same), in series order. Parts without a
   * perek form their own runs (`perek: null`).
   */
  groups: { perek: string | null; shiurIds: string[] }[] | null;
}

export interface SeriesFile {
  series: SeriesEntry[];
}

// ---------------------------------------------------------------- occasions.json

export interface OccasionShiurRef {
  id: string;
  lang: Ed;
  years: number[];
  /** The catalog spelling. */
  raw: string;
  audience: "children" | "bachurim" | null;
}

export interface ParshaOccasion {
  key: string;
  order: number;
  chumash: string;
  he: string;
  yi: string;
  en: string;
  /** For combined parshiyos: the two parts. */
  parts: [string, string] | null;
  count: number;
  /** Both languages together, sorted by year (undated last), then catalog order. */
  shiurim: OccasionShiurRef[];
}

export interface ZmanOccasion {
  key: string;
  order: number;
  he: string;
  yi: string;
  en: string;
  /** All shiurim, including those under a sub-heading. */
  count: number;
  /** Shiurim on the zman itself, sorted by year. */
  shiurim: OccasionShiurRef[];
  /** Sub-headings ("סעודת זאת חנוכה" → seudah under zos-chanukah), each sorted by year. */
  subs: { sub: "seudah" | "lechaim"; shiurim: OccasionShiurRef[] }[];
}

export interface OccasionsFile {
  /** Every parsha of the table, in Torah order (combined parshiyos after their first part). */
  parshiyos: ParshaOccasion[];
  /** Every occasion of the table, in year order from Elul. */
  zmanim: ZmanOccasion[];
  /** Catalogued shiurim whose parsha/zman is a one-off event or not in the tables. */
  other: OccasionShiurRef[];
  excluded: {
    /** Uncatalogued rows with a parsha/zman guessed from the file name (concept-quiet decision 7). */
    uncataloguedGuesses: number;
  };
}

// ---------------------------------------------------------------- years.json

export interface YearsFile {
  /** Ascending. A shiur with two years is listed under both. */
  years: { year: number; count: number; shiurIds: string[] }[];
  /** Shiurim without `hebrewYears`. */
  unknown: { count: number; shiurIds: string[] };
}

// ---------------------------------------------------------------- works.json

export interface MentionRef {
  shiurId: string;
  /** Moment id of the source (`<shiur>~src<i>`). */
  id: string;
  t: number | null;
  resolution: Resolution;
  mention: MentionKind;
  /** The free-text reference as given (may be null). */
  ref: string | null;
  soft?: true;
}

export interface WorkRef {
  /** The Sefaria ref string, as given. */
  ref: string;
  label: { en: string; he: string };
  /** Traditional-order sort key from @emunas/normalize. */
  sortKey: number[];
  mentions: MentionRef[];
}

export interface WorkEntry {
  key: string;
  /**
   * The merged corpus work (`.corpus/layer/works.json` id) most of this entry's mentions resolve
   * to through `shiur-tags.sourceWorkIds`; null when none does or the corpus layer is off. Always
   * written by corpus:build; optional so readers of an older `.corpus/` and hand-made test entries
   * still type.
   */
  workId?: string | null;
  /** false: not in the works table (key is a slug of the name, listed in build-report). */
  mapped: boolean;
  group: string | null;
  order: number | null;
  he: string | null;
  yi: string | null;
  en: string;
  sefaria: string[];
  scheme: "tanach" | "shas" | "chapter" | "none";
  /** Generic label ("Midrash", "Gemara"): listed, not shelved. */
  genre: boolean;
  /** Distinct `work` strings filed under this key. */
  names: string[];
  shiurCount: number;
  mentionCount: number;
  /** Resolved and inferred mentions with a parseable Sefaria ref, in the work's own order. */
  refs: WorkRef[];
  /** Mentions with no place that could be ordered ("place not identified"). */
  unlocated: MentionRef[];
}

export interface WorksFile {
  /** Table works in traditional order (group, order within group), then unmapped works by key. */
  works: WorkEntry[];
}

// ---------------------------------------------------------------- people.json

export interface PersonShiur {
  id: string;
  /** Listed in the shiur's `people`. */
  mentioned: boolean;
  /** Moment ids of the shiur's stories that involve the person. */
  stories: string[];
}

export interface PersonEntry {
  key: string;
  mapped: boolean;
  en: string;
  he: string | null;
  names: string[];
  shiurCount: number;
  /** Catalog order. */
  shiurim: PersonShiur[];
}

export interface PeopleFile {
  /** Alphabetical by English name, then key. */
  people: PersonEntry[];
}

// ---------------------------------------------------------------- concepts.json

export interface ConceptEntry {
  key: string;
  /** Canonical Hebrew term (after alias merging, nikud stripped): the headword in both editions. */
  he: string;
  /** Distinct spellings filed under this key. */
  variants: string[];
  shiurCount: number;
  /** Catalog order; `sections` are chapter moment ids whose title contains the term. */
  shiurim: { id: string; sections: string[] }[];
}

export interface ConceptsFile {
  /** Minimum number of shiurim for a concept to be listed (CONCEPT_MIN_SHIURIM). */
  minShiurim: number;
  omitted: { stopListed: number; belowThreshold: number };
  /** Sorted by the folded Hebrew term, then key. */
  concepts: ConceptEntry[];
}

// ---------------------------------------------------------------- stories.json

export interface StoryEntry {
  id: string;
  shiurId: string;
  lang: Ed;
  years: number[];
  title: L;
  people: string[];
  peopleKeys: string[];
  t: number | null;
  end: number | null;
  soft?: true;
}

export interface StoriesFile {
  /** Catalog order, then position in the shiur. No retellings. */
  stories: StoryEntry[];
  /** Grouped by the first person of each story (null: no person), in people.json order. */
  byPerson: { key: string | null; storyIds: string[] }[];
}

// ---------------------------------------------------------------- entities.json

export interface EntityCount {
  key: string;
  shiurim: number;
  /** Quiet makes an entity page (works/people ≥2, concepts ≥3; never for genre works). */
  quietPage: boolean;
  /** Live prerenders the entity route (≥3). */
  livePrerender: boolean;
}

export interface EntitiesFile {
  thresholds: { quiet: { work: number; person: number; concept: number }; live: { prerender: number } };
  works: EntityCount[];
  people: EntityCount[];
  /** All concepts not on the stop-list, including those below the listing threshold. */
  concepts: EntityCount[];
  occasions: { key: string; shiurim: number }[];
}

export interface Aggregates {
  sections: SectionsFile;
  neighbours: NeighboursFile;
  series: SeriesFile;
  occasions: OccasionsFile;
  years: YearsFile;
  works: WorksFile;
  people: PeopleFile;
  concepts: ConceptsFile;
  stories: StoriesFile;
  entities: EntitiesFile;
}
