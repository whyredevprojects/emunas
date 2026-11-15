/**
 * Which corpus-layer entities have a Live page (concept-live-corpus E.1, corpus-wave-plan §2 D2,
 * D10), as one rule shared by the data emit (`data-build/emit-corpus.ts`: which files exist), the
 * prerender list and SEO (`app/seo`). The layer computes the thresholds into its page flags; these add
 * Live's own exclusions. Records are read defensively (a missing flag is false).
 *
 * Browser-safe, structural types only.
 */

interface Flags {
  readonly live?: boolean | null;
  readonly quiet?: boolean | null;
}

const live = (f: Flags | null | undefined): boolean => f?.live === true;
const positive = (n: unknown): boolean => typeof n === "number" && n > 0;

/** Every topic with visible shiurim (all have pages, E.1). */
export function liveTopicPage(t: { readonly count?: number; readonly pages?: Flags | null }): boolean {
  return positive(t.count) && live(t.pages);
}

/** People: ≥3 shiurim (layer flag), listed, never type `other` (D2), never excluded (D5). */
export function livePersonPage(p: {
  readonly count?: number;
  readonly pages?: Flags | null;
  readonly listed?: Flags | null;
  readonly type?: string;
  readonly excluded?: string | null;
}): boolean {
  return positive(p.count) && live(p.pages) && live(p.listed) && p.type !== "other" && (p.excluded ?? null) === null;
}

/** Concepts: ≥3 shiurim (layer flag) and not merged into a topic (the topic page is the entry). */
export function liveConceptPage(c: { readonly count?: number; readonly pages?: Flags | null; readonly mergedIntoTopic?: string | null }): boolean {
  return positive(c.count) && live(c.pages) && !c.mergedIntoTopic;
}

/** Works: ≥3 shiurim (layer flag), never a generic label. */
export function liveWorkPage(w: { readonly count?: number; readonly pages?: Flags | null; readonly generic?: boolean }): boolean {
  return positive(w.count) && live(w.pages) && w.generic !== true;
}

/** Stories told at least twice (layer flag). */
export function liveStoryPage(s: { readonly pages?: Flags | null }): boolean {
  return live(s.pages);
}

/** Threads of at least three shiurim (layer flag). */
export function liveThreadPage(t: { readonly page?: boolean }): boolean {
  return t.page === true;
}
