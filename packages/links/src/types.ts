import { UI_LANGS, isUiLang, type UiLang } from "@emunas/i18n";

/**
 * Edition (Quiet) / UI language (Live): always the first path segment on both sites. The set is
 * `UI_LANGS` of `@emunas/i18n` (en, yi, he); a language added there is an edition here with no
 * change in this package.
 */
export type Ed = UiLang;
export const EDS: typeof UI_LANGS = UI_LANGS;

export type Site = "quiet" | "live";

/**
 * Moment kinds inside a shiur (integration-plan §2.2): section, insight, question,
 * story, takeaway, key point. Moment id = `<shiurId>~<kind><index>`.
 */
export type MomentKind = "s" | "i" | "q" | "st" | "tk" | "kp";
export const MOMENT_KINDS: readonly MomentKind[] = ["s", "i", "q", "st", "tk", "kp"];

export interface MomentRef {
  readonly kind: MomentKind;
  readonly index: number;
}

/**
 * Corpus-wide entities (corpus-wave-plan §3.5), addressed by their corpus id, which the data
 * contract promises is stable. Every one is AI-generated and unreviewed unless its layer record
 * says `reviewed`.
 */
export type CorpusKind = "topic" | "concept" | "person" | "work" | "story" | "thread";
export const CORPUS_KINDS: readonly CorpusKind[] = ["topic", "concept", "person", "work", "story", "thread"];

export type OccasionKind = "parsha" | "zman";

/**
 * Pages that are an index or listing rather than a single thing. Some exist on one site
 * only; the formatter of the other site maps them to the closest page it has.
 */
export type IndexName =
  | "contents" // Quiet contents and section pages
  | "calendar-parsha"
  | "calendar-zman"
  | "years"
  | "about"
  | "sources" // Quiet sources index, Live seforim shelf
  | "stories" // Quiet stories, Live maasios
  | "people"
  | "topics" // Quiet topic tree (/inyanim/), Live Explore map
  | "glossary" // Quiet glossary (/erachim/); Live has none
  | "series" // Live series index (Quiet has none: contents)
  | "explore" // Live only
  | "shelf"; // Live only (shelf, playlists)

/** A site-neutral description of a page; both sites' paths parse into and format from it. */
export type Route =
  | { readonly kind: "root" }
  | { readonly kind: "home"; readonly ed: Ed }
  | {
      readonly kind: "shiur";
      readonly ed: Ed;
      readonly id: string;
      /** Global seconds (integration-plan C5). */
      readonly t?: number;
      readonly moment?: MomentRef;
    }
  | { readonly kind: "series"; readonly ed: Ed; readonly id: string }
  | { readonly kind: "occasion"; readonly ed: Ed; readonly key: string; readonly occasion?: OccasionKind }
  /** A corpus entity by corpus id. `all`: Quiet's continuation page (topics and people). */
  | {
      readonly kind: "entry";
      readonly ed: Ed;
      readonly entry: CorpusKind;
      readonly id: string;
      readonly all?: boolean;
    }
  | { readonly kind: "index"; readonly ed: Ed; readonly index: IndexName }
  | { readonly kind: "search"; readonly ed: Ed; readonly q?: string };

/**
 * Lookups from `.corpus/` that some mappings need. All optional: without them the
 * mapping degrades (documented per function) and never throws.
 */
export interface LinkData {
  /**
   * Whether a corpus entity has its own page on a site: the layer's page flags
   * (`.corpus/layer/*.json` `pages` / thread `page`; `pageLookupFromLayer` builds this). Undefined
   * means "not known": the page is assumed to exist.
   */
  readonly hasPage?: (site: Site, kind: CorpusKind, id: string) => boolean | undefined;
  /** The topic a concept is merged into (layer `concepts[].mergedIntoTopic`): links go to the topic. */
  readonly conceptTopic?: (conceptId: string) => string | undefined;
  /** Whether an occasion key is a parsha or a zman (`.corpus/occasions.json`). */
  readonly occasionKind?: (key: string) => OccasionKind | undefined;
  /** Global start second of section `index` of a shiur (`PublicShiur.notes.chapters[i].t`). */
  readonly sectionStart?: (shiurId: string, index: number) => number | undefined;
}

export function isEd(value: unknown): value is Ed {
  return isUiLang(value);
}

/** The TypeError message for a value that is not an edition. */
export function badEdition(value: unknown): string {
  return `@emunas/links: edition must be one of ${EDS.map((e) => JSON.stringify(e)).join(", ")}, got ${JSON.stringify(value)}`;
}
