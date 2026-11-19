/**
 * Index-side text: the folded strings each engine indexes, built only from allow-listed fields.
 * Pure and browser-safe. Uses the same `fold` as `normalizeQuery`.
 */
import { fold, foldTokens, hebrewYear, lookupParsha, lookupZman } from "@emunas/normalize";
import type { KeyedValue } from "@emunas/corpus/public";
import { UI_LANGS, pickText, type LocalizedText, type UiLang } from "@emunas/i18n";
import { momentRowTextField, type MomentRow, type MomentRowTextPart, type SearchDoc } from "./types.ts";

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

/**
 * The strings of a localized text to index. Without `reader`: every language it has, in
 * `UI_LANGS` order (an index shared by every edition). With `reader`: only the text that reader
 * is shown, along `CONTENT_FALLBACK` (an index of one language: a Hebrew reader's index holds the
 * Hebrew translation when there is one, else the Yiddish, else the English). Blank texts are left out.
 */
export function localizedTexts(text: LocalizedText | null | undefined, reader?: UiLang): string[] {
  if (text === null || text === undefined) return [];
  if (reader !== undefined) {
    const t = pickText(text, reader).text;
    return t.trim() === "" ? [] : [t];
  }
  const out: string[] = [];
  for (const l of UI_LANGS) {
    const t = text[l];
    if (t !== undefined && t.trim() !== "") out.push(t);
  }
  return out;
}

/**
 * Every text field of a SearchDoc except the keywords, in a fixed order (unfolded). Generated
 * texts give every language they have, or, with `reader`, the one that reader is shown
 * (`localizedTexts`). Catalog strings and names are not localized and always come whole.
 */
export function docTextParts(doc: SearchDoc, reader?: UiLang): string[] {
  const texts = (l: LocalizedText | null): string[] => localizedTexts(l, reader);
  return [
    doc.titleOriginal,
    doc.heading ?? "",
    doc.subTitle ?? "",
    ...doc.parsha,
    ...doc.zman,
    ...doc.years,
    ...doc.catalogTopics,
    ...texts(doc.oneLiner),
    ...texts(doc.abstract),
    ...doc.keyPoints.flatMap(texts),
    ...doc.sections.flatMap((s) => [...texts(s.title), ...texts(s.summary)]),
    ...doc.storyTitles.flatMap(texts),
    ...doc.questions.flatMap(texts),
    ...doc.sources.flatMap((s) => [s.work ?? "", s.ref ?? ""]),
    ...doc.people,
    ...doc.concepts,
  ].filter((s) => s.length > 0);
}

/**
 * Folded index text of a SearchDoc: `content` (main weight) and `keywords` (topic labels and aliases,
 * low weight). Pagefind puts `content` in the record body and `keywords` in a low-weight field;
 * MiniSearch indexes them as two fields with boosts. `reader` as in `docTextParts`.
 */
export function docSearchText(doc: SearchDoc, reader?: UiLang): { content: string; keywords: string } {
  return {
    content: docTextParts(doc, reader).map(fold).filter((s) => s.length > 0).join("\n"),
    keywords: doc.keywords.map(fold).filter((s) => s.length > 0).join("\n"),
  };
}

/** A MomentRow's title or body in `lang` (its `title_<lang>` / `body_<lang>`), or null. */
export function momentRowText(row: MomentRow, part: MomentRowTextPart, lang: UiLang): string | null {
  return row[momentRowTextField(part, lang)];
}

/**
 * Folded title/body of a MomentRow in one language (for FTS rows and embeddings input). Null when
 * the row has no text in `lang` (no fallback: a row holds only text that is in that language).
 */
export function momentSearchText(row: MomentRow, lang: UiLang): { title: string; body: string } | null {
  const title = momentRowText(row, "title", lang);
  const body = momentRowText(row, "body", lang);
  if (title === null && body === null) return null;
  return { title: title === null ? "" : fold(title), body: body === null ? "" : fold(body) };
}
