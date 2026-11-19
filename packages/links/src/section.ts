/**
 * Quiet section pages (`/{ed}/section/{slug}/`, tech-quiet §2). Only Quiet has section pages;
 * Live has no equivalent, so a section URL parses as the contents listing (see `parseQuiet`).
 *
 * The slug rule mirrors `sectionSlug` in apps/quiet/src/components/catalog/model.ts (W3.1), which
 * builds the pages: Pocket Guide sections keep their id (`/yi/section/zmanim/`); sections of any
 * other catalog source (the uncatalogued guide, whose ids repeat the guide's) are always prefixed
 * (`/yi/section/unc-zmanim/`). A Quiet test checks the two agree on every section of the corpus.
 */
import { badEdition, isEd, type Ed } from "./types.ts";
import { seg } from "./url.ts";

/** The catalog source whose section ids are used as they are. */
export const POCKET_GUIDE_SOURCE = "pocket-guide-2012";
/** Prefix of the slug of a section of any other catalog source. */
export const UNCATALOGUED_SECTION_PREFIX = "unc-";

/** A catalog section: its source (`CatalogSource`) and its id within that source. */
export interface SectionRef {
  readonly source: string;
  readonly id: string;
}

/** The address segment of a section (not URL-encoded). */
export function sectionSlug(section: SectionRef): string {
  if (typeof section.id !== "string" || section.id === "" || section.id.includes("/")) {
    throw new TypeError(`@emunas/links: bad section id: ${JSON.stringify(section.id)}`);
  }
  return section.source === POCKET_GUIDE_SOURCE ? section.id : `${UNCATALOGUED_SECTION_PREFIX}${section.id}`;
}

/** `/{ed}/section/{slug}/`. */
export function quietSectionPath(ed: Ed, section: SectionRef): string {
  if (!isEd(ed)) throw new TypeError(badEdition(ed));
  return `/${ed}/section/${seg(sectionSlug(section))}/`;
}
