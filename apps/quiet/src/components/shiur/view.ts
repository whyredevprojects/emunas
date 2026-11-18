/**
 * The shiur page's view model (concept-quiet §5.4, tech-quiet §4): pure functions from a
 * `PublicShiur` (plus a few lookups from the aggregate files) to what the page renders around the
 * header: the previous/next line and the "report an error" link.
 * Browser-safe and framework-free so it can be unit-tested without Astro.
 *
 * Nothing here reads raw data: the input is the allow-listed public contract, so there is no
 * field through which transcript text could arrive.
 */
import type { AudioLang, PickedText } from "@emunas/i18n";
import { quietPaths } from "@emunas/links";
import type { IndexRow, PublicCatalog, PublicShiur } from "@emunas/corpus/public";
import type { Neighbours } from "@emunas/corpus/aggregate";
import type { Ed } from "../../lib/edition.ts";
import { sectionDisplayTitle, sectionHref as catalogSectionHref } from "../catalog/model.ts";

// ---------------------------------------------------------------- IRIs

/** Decodes percent-encoded non-ASCII (UTF-8) sequences only; ASCII escapes (`%20`, `%2F`) stay. */
export function iri(href: string): string {
  return href.replace(/(?:%[89A-F][0-9A-F])+/gi, (m) => {
    try {
      return decodeURIComponent(m);
    } catch {
      return m;
    }
  });
}

// ---------------------------------------------------------------- previous and next

export interface RowRef {
  readonly id: string;
  readonly href: string;
  readonly title: string;
  /** Spoken language of the shiur (its catalog title is in it). */
  readonly lang: AudioLang;
}

/** One line under the page: the shiur before, the series or section it is in, the shiur after. */
export interface PrevNextView {
  /** Which order the line follows: the series when the shiur is in one, else the section. */
  readonly of: "series" | "section";
  /** The series or section name (empty for a series without a title). */
  readonly label: string;
  /**
   * `lang`/`dir` of `label` when its language is known (the series title is generated text, picked
   * along `CONTENT_FALLBACK`); null for a catalog string (the section name), read by its script.
   */
  readonly labelAttrs: { readonly lang: Ed; readonly dir: "ltr" | "rtl" } | null;
  readonly href: string;
  readonly prev: RowRef | null;
  readonly next: RowRef | null;
}

export type RowLookup = (id: string) => Pick<IndexRow, "id" | "lang" | "catalog"> | undefined;

export function rowRef(ed: Ed, id: string, rows: RowLookup): RowRef | null {
  const row = rows(id);
  if (!row) return null;
  return { id, href: quietPaths().shiur(ed, id), title: row.catalog.titleOriginal, lang: row.lang };
}

/**
 * Section page path (`/{ed}/section/{slug}/`, tech-quiet §2). Uses the catalog pages' slug rule
 * (W3.1), since uncatalogued-guide section ids repeat the guide's and are prefixed there.
 */
export function sectionHref(ed: Ed, catalog: Pick<PublicCatalog, "source" | "sectionId">): string {
  return catalogSectionHref(ed, { source: catalog.source, id: catalog.sectionId });
}

/** The shiur's section title as the edition shows it (the display name, else as catalogued). */
export function sectionTitle(ed: Ed, catalog: Pick<PublicCatalog, "source" | "sectionId" | "sectionTitle">): string {
  return sectionDisplayTitle(`${catalog.source}:${catalog.sectionId}`, catalog.sectionTitle, ed);
}

/**
 * Previous and next: in the series order when the shiur is in a series (a series can run past the
 * end of its catalog section, and its neighbours are the next part, not the next row of the
 * section), else in the section order. Catalog fields only; no AI-made "related shiurim". Null
 * when the aggregate has no neighbours for the shiur.
 */
export function prevNext(
  ed: Ed,
  shiur: Pick<PublicShiur, "catalog" | "series">,
  neighbours: Neighbours | undefined,
  rows: RowLookup,
  seriesTitle?: (id: string) => PickedText | undefined,
): PrevNextView | null {
  if (!neighbours) return null;
  const ref = (id: string | null) => (id === null ? null : rowRef(ed, id, rows));
  const s = neighbours.series;
  if (s && shiur.series) {
    const picked = seriesTitle?.(shiur.series.id);
    return {
      of: "series",
      label: picked?.text ?? "",
      labelAttrs: picked ? { lang: picked.lang, dir: picked.dir } : null,
      href: quietPaths().series(ed, shiur.series.id),
      prev: ref(s.prev),
      next: ref(s.next),
    };
  }
  return {
    of: "section",
    label: sectionTitle(ed, shiur.catalog),
    labelAttrs: null,
    href: sectionHref(ed, shiur.catalog),
    prev: ref(neighbours.section.prev),
    next: ref(neighbours.section.next),
  };
}

// ---------------------------------------------------------------- report an error

/**
 * The plain mail link that pre-fills the shiur id (concept-quiet §5.4, C18). Null when no
 * address is configured (`EMUNAS_FEEDBACK_EMAIL`); the page then leaves the line out.
 */
export function reportHref(address: string | undefined, subject: string, body: string): string | null {
  const to = address?.trim();
  if (!to || !/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(to)) return null;
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
