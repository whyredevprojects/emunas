/**
 * Catalog gaps (concept-quiet decision 3, tech-quiet §4): guide rows that have no audio at all (the
 * 2012 guide lists them but no file exists, or the file never reached the bucket). They are out of
 * scope in ingest, so they get no shiur file and no page; a catalog should still be complete, so
 * `index.json` lists them and the section pages show them greyed as "no recording".
 *
 * Only catalog fields are copied (no note, no recordings). Purim rows (seudos and the printed
 * gramen) are out of scope by the plan and are not listed.
 */
import type { Shiur } from "../../../../src/types.ts";
import type { CatalogGap, CatalogGapReason, KeyedValue } from "../public/types.ts";
import type { Keyer, KeyKind } from "./keyer.ts";
import type { ReportCollector } from "./report.ts";

/** An out-of-scope row is a gap when it has no recording at all and is not a Purim row. */
export function isCatalogGap(s: Shiur): boolean {
  return !s.inScope && s.recordingIds.length === 0 && s.category !== "purim";
}

export function gapReason(s: Shiur): CatalogGapReason {
  return /not on disk/i.test(s.outOfScopeReason ?? "") ? "not-on-disk" : "not-in-bucket";
}

const sectionKeyOf = (s: Shiur) => `${s.catalog.source}:${s.catalog.sectionId}`;

/**
 * Every gap in ingest (catalog) order, each placed after the in-scope shiur of its section that
 * precedes it in the same order.
 */
export function catalogGaps(all: readonly Shiur[], keyer: Keyer, report: ReportCollector): CatalogGap[] {
  const keyedValue = (kind: KeyKind, raw: string | null, id: string): KeyedValue | null => {
    if (raw === null || raw.trim() === "") return null;
    const r = keyer.key(kind, raw);
    if (!r.mapped) report.unmapped(kind, raw, r.key, id);
    return { raw, key: r.key };
  };
  const lastInSection = new Map<string, string>();
  const out: CatalogGap[] = [];
  for (const s of all) {
    const sectionKey = sectionKeyOf(s);
    if (s.inScope) {
      lastInSection.set(sectionKey, s.id);
      continue;
    }
    if (!isCatalogGap(s)) continue;
    const c = s.catalog;
    const catalog: CatalogGap["catalog"] = {
      source: c.source,
      sectionId: c.sectionId,
      sectionTitle: c.sectionTitle,
      n: c.n,
      page: c.page,
      titleOriginal: c.titleOriginal,
      subTitle: c.subTitle,
      derived: c.derived,
    };
    if (c.heading !== undefined) catalog.heading = c.heading;
    out.push({
      id: s.id,
      lang: s.lang,
      category: s.category,
      catalog,
      sectionKey,
      after: lastInSection.get(sectionKey) ?? null,
      reason: gapReason(s),
      parsha: keyedValue("parsha", s.parsha, s.id),
      zman: keyedValue("zman", s.zman, s.id),
      perek: s.perek,
      years: [...s.hebrewYears],
      series: s.seriesId !== null ? { id: s.seriesId, order: s.seriesOrder } : null,
    });
  }
  return out;
}
