/** Edition (Quiet) / UI language (Live): always the first path segment on both sites. */
export type Ed = "yi" | "en";
export const EDS: readonly Ed[] = ["yi", "en"];

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

/** Entities that have their own index pages on Quiet (sources, people, inyanim). */
export type EntityKind = "work" | "person" | "concept";

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
  | "concepts"
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
  | { readonly kind: "entity"; readonly ed: Ed; readonly entity: EntityKind; readonly key: string }
  | { readonly kind: "index"; readonly ed: Ed; readonly index: IndexName }
  | { readonly kind: "search"; readonly ed: Ed; readonly q?: string }
  | { readonly kind: "audio"; readonly recordingId: string; readonly download?: boolean };

/**
 * Lookups from `.corpus/` that some mappings need. All optional: without them the
 * mapping degrades (documented per function) and never throws.
 */
export interface LinkData {
  /** Number of shiurim an entity appears in (`.corpus/entities.json`). */
  readonly entityCount?: (entity: EntityKind, key: string) => number | undefined;
  /** Whether an occasion key is a parsha or a zman (`.corpus/occasions.json`). */
  readonly occasionKind?: (key: string) => OccasionKind | undefined;
  /** Global start second of section `index` of a shiur (`PublicShiur.notes.chapters[i].t`). */
  readonly sectionStart?: (shiurId: string, index: number) => number | undefined;
}

export function isEd(value: unknown): value is Ed {
  return value === "yi" || value === "en";
}
