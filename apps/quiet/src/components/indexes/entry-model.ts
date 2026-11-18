/**
 * Shared pieces of the corpus-entry page models (C2.1): citations of visible shiurim in catalog
 * order, entry links through `@emunas/links` with the layer's page flags, the names an entry is
 * shown under, and alphabetical order for an edition.
 */
import { pickLocalized } from "@emunas/i18n";
import { formatQuiet, type CorpusKind } from "@emunas/links";
import { isHebrewScriptEdition, type Ed } from "../../lib/edition.ts";
import type { EntryData } from "./entries.ts";
import { citeFromRow, letterOf, run, sortForm, type Cite, type Run } from "./model.ts";

/** A citation of a visible shiur (null: not visible or unknown, never linked). */
export function citeShiur(d: EntryData, ed: Ed, shiurId: string, t: number | null = null, href?: string): Cite | null {
  if (!d.visible(shiurId)) return null;
  const row = d.rows.get(shiurId);
  return row ? citeFromRow(row, ed, t, href) : null;
}

/** Catalog-order comparator over shiur ids (unknown ids last). */
export function byCatalog(d: EntryData): (a: string, b: string) => number {
  return (a, b) => (d.order.get(a) ?? Number.MAX_SAFE_INTEGER) - (d.order.get(b) ?? Number.MAX_SAFE_INTEGER) || (a < b ? -1 : a > b ? 1 : 0);
}

/** One citation per visible shiur, in catalog order. */
export function citeShiurim(d: EntryData, ed: Ed, ids: readonly unknown[] | null | undefined): Cite[] {
  const list = [...new Set((Array.isArray(ids) ? ids : []).filter((x): x is string => typeof x === "string"))].sort(byCatalog(d));
  return list.map((id) => citeShiur(d, ed, id)).filter((c): c is Cite => c !== null);
}

/** The entry's page, or its line on its index when it has no page (a concept merged into a topic: the topic). */
export function entryHref(d: EntryData, ed: Ed, kind: CorpusKind, id: string): string {
  return formatQuiet({ kind: "entry", ed, entry: kind, id }, d.layer.links);
}

/** True when Quiet builds a page for this entry. */
export function hasEntryPage(d: EntryData, kind: CorpusKind, id: string): boolean {
  return d.layer.hasPage(kind, id);
}

export const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * Reads a generated text (`LocalizedText`) defensively: the edition's text, else the next language
 * along `CONTENT_FALLBACK`, as a run with the `lang`/`dir` of the language shown; null when blank in
 * every language.
 */
export function textRun(l: unknown, ed: Ed): Run | null {
  if (typeof l !== "object" || l === null) return null;
  const picked = pickLocalized<unknown>(l as Partial<Record<Ed, unknown>>, ed, (v) => str(v) !== "");
  return picked ? { text: str(picked.value), lang: picked.lang, dir: picked.dir } : null;
}

/** Reads a generated text defensively: the edition's own language only (no fallback). */
export function ownTextOf(l: unknown, ed: Ed): string {
  if (typeof l !== "object" || l === null) return "";
  return str((l as Record<string, unknown>)[ed]);
}

export function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim()) : [];
}

// ------------------------------------------------------------------ alphabetical order

/** Yiddish and English articles in front of a name ("דער חידושי הרי"ם", "the Abarbanel"). */
const LEADING_YIDDISH_ARTICLE = /^(?:דער|די|דאס|דעם)\s+/u;

/** Sort form of a name: no article (Yiddish or English), no marks or quote marks in front. */
export function nameSortForm(text: string): string {
  return sortForm(sortForm(text).replace(LEADING_YIDDISH_ARTICLE, ""));
}

/** The letter a name is filed under (after its article). */
export function nameLetter(text: string): string {
  return letterOf(nameSortForm(text));
}

const collators = {
  he: new Intl.Collator("he", { sensitivity: "base", numeric: true }),
  en: new Intl.Collator("en", { sensitivity: "base", numeric: true }),
};

/**
 * Alphabetical order of names for an edition: names in the edition's script first (Hebrew
 * letters in the Yiddish and Hebrew editions, Latin in the English one), then the rest; each in its
 * own collation, articles ignored; ties by id.
 */
export function compareRuns(ed: Ed): (a: { name: Run; id: string }, b: { name: Run; id: string }) => number {
  const hebrew = (s: string) => /[א-ת]/.test(s.charAt(0));
  const hebrewFirst = isHebrewScriptEdition(ed);
  return (a, b) => {
    const ka = nameSortForm(a.name.text);
    const kb = nameSortForm(b.name.text);
    const pa = hebrew(ka) === hebrewFirst ? 0 : 1;
    const pb = hebrew(kb) === hebrewFirst ? 0 : 1;
    if (pa !== pb) return pa - pb;
    const c = hebrew(ka) || hebrew(kb) ? collators.he : collators.en;
    return c.compare(ka, kb) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  };
}

/** A Hebrew data string as a run (glossary headwords are Hebrew in every edition). */
export function hebrewRun(text: string): Run {
  return { text, lang: "he", dir: "rtl" };
}

export { run };
