/**
 * Index-side text: the folded strings each engine indexes, built only from allow-listed fields.
 * Pure and browser-safe. Uses the same `fold` as `normalizeQuery`.
 */
import { fold, foldTokens, hebrewYear, lookupParsha, lookupZman } from "@emunas/normalize";
import type { KeyedValue, L } from "@emunas/corpus/public";
import type { MomentRow, SearchDoc } from "./types.ts";

/** Folded tokens of an indexed string. */
export function indexTokens(s: string): string[] {
  return foldTokens(s);
}

/** Folded form of an indexed string. */
export function foldForIndex(s: string): string {
  return fold(s);
}

function uniq(xs: Iterable<string>): string[] {
  return [...new Set([...xs].filter((x) => x.length > 0))];
}

/** Catalog parsha string plus the table's he/yi/en names when it maps. */
export function parshaLabels(v: KeyedValue | null): string[] {
  if (v === null) return [];
  const m = lookupParsha(v.raw);
  return uniq([v.raw.trim(), ...(m.parsha ? [m.parsha.he, m.parsha.yi, m.parsha.en] : [])]);
}

/** Catalog zman string plus the occasion's he/yi/en names when it maps. */
export function zmanLabels(v: KeyedValue | null): string[] {
  if (v === null) return [];
  const m = lookupZman(v.raw);
  return uniq([v.raw.trim(), ...(m.occasion ? [m.occasion.he, m.occasion.yi, m.occasion.en] : [])]);
}

/** Hebrew years in letters (with gershayim) and digits. */
export function yearLabels(years: readonly number[]): string[] {
  const out: string[] = [];
  for (const y of years) {
    try {
      out.push(hebrewYear(y));
    } catch {
      // not representable: digits only
    }
    out.push(String(y));
  }
  return uniq(out);
}

const both = (l: L | null): string[] => (l === null ? [] : [l.en, l.yi]);

/** Every text field of a SearchDoc except the keywords, in a fixed order (unfolded). */
export function docTextParts(doc: SearchDoc): string[] {
  return [
    doc.titleOriginal,
    doc.heading ?? "",
    doc.subTitle ?? "",
    ...doc.parsha,
    ...doc.zman,
    ...doc.years,
    ...doc.catalogTopics,
    ...both(doc.oneLiner),
    ...both(doc.abstract),
    ...doc.keyPoints.flatMap(both),
    ...doc.sections.flatMap((s) => [...both(s.title), ...both(s.summary)]),
    ...doc.storyTitles.flatMap(both),
    ...doc.questions.flatMap(both),
    ...doc.sources.flatMap((s) => [s.work ?? "", s.ref ?? ""]),
    ...doc.people,
    ...doc.concepts,
  ].filter((s) => s.length > 0);
}

/**
 * Folded index text of a SearchDoc: `content` (main weight) and `keywords` (candidateTopics,
 * low weight). Pagefind puts `content` in the record body and `keywords` in a low-weight field;
 * MiniSearch indexes them as two fields with boosts.
 */
export function docSearchText(doc: SearchDoc): { content: string; keywords: string } {
  return {
    content: docTextParts(doc).map(fold).filter((s) => s.length > 0).join("\n"),
    keywords: doc.keywords.map(fold).filter((s) => s.length > 0).join("\n"),
  };
}

/** Folded title/body of a MomentRow in one language (for FTS rows and embeddings input). */
export function momentSearchText(row: MomentRow, lang: "en" | "yi"): { title: string; body: string } | null {
  const title = lang === "en" ? row.title_en : row.title_yi;
  const body = lang === "en" ? row.body_en : row.body_yi;
  if (title === null && body === null) return null;
  return { title: title === null ? "" : fold(title), body: body === null ? "" : fold(body) };
}
