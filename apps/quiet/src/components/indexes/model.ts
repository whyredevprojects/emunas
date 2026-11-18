/**
 * Shared pieces of the corpus-entry indexes (people, sources, glossary): data runs with their
 * script, shiur and section hrefs, catalog citations, the alphabetical order and letter blocks,
 * and the reference-order shapes of a work page. The page models are in `entry-model.ts`,
 * `works.ts` and the `names`/`glossary`/`stories` components; everything here is pure.
 */
import type { IndexRow } from "@emunas/corpus/public";
import { langFor, scriptOf, type ContentLang, type Dir } from "@emunas/i18n";
import { formatQuiet } from "@emunas/links";
import type { Ed } from "../../lib/edition.ts";

/** A data string with the `lang`/`dir` of its script (rendered as a `<bdi>`). */
export interface Run {
  readonly text: string;
  readonly lang: ContentLang;
  readonly dir: Dir;
}

export function run(text: string, ed: Ed): Run {
  const { lang, dir } = langFor(text, ed);
  return { text, lang, dir };
}

// ------------------------------------------------------------------ hrefs

export function shiurHref(ed: Ed, shiurId: string, t: number | null): string {
  return t === null ? formatQuiet({ kind: "shiur", ed, id: shiurId }) : formatQuiet({ kind: "shiur", ed, id: shiurId, t });
}

export function sectionHref(ed: Ed, shiurId: string, idx: number): string {
  return formatQuiet({ kind: "shiur", ed, id: shiurId, moment: { kind: "s", index: idx } });
}

/** Outbound Sefaria link (tech-quiet §4: resolved references only, encoded as one path segment). */
export function sefariaHref(ref: string): string {
  return `https://www.sefaria.org/${encodeURIComponent(ref.trim())}`;
}

// ------------------------------------------------------------------ citations

/** One pointer into a shiur: the catalog's own words for it, and where in it. */
export interface Cite {
  readonly shiurId: string;
  readonly href: string;
  /** Parsha or zman as catalogued, else the section title. */
  readonly occasion: Run;
  /** Catalog number as printed. */
  readonly n: string | null;
  readonly years: readonly number[];
  /** Language of the shiur; shown only when it differs from the edition. */
  readonly lang: Ed;
  /** Global seconds of the moment, or null (link to the shiur itself). */
  readonly t: number | null;
}

export function citeFromRow(row: IndexRow, ed: Ed, t: number | null, href?: string): Cite {
  const occasion = row.parsha?.raw ?? row.zman?.raw ?? row.catalog.sectionTitle;
  return {
    shiurId: row.id,
    href: href ?? shiurHref(ed, row.id, t),
    occasion: run(occasion, row.lang),
    n: row.catalog.n,
    years: row.years,
    lang: row.lang,
    t,
  };
}

// ------------------------------------------------------------------ alphabetical order

const HEBREW_FINALS: Readonly<Record<string, string>> = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" };
const LEADING_ARTICLE = /^(?:the|a|an)\s+/i;

/** Sort form of a name: no leading article, no marks, no quote marks or punctuation in front. */
export function sortForm(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-֑ͯ-ׇ]/g, "")
    .replace(/^[\s"'“”‘’׳״\-–(.]+/, "")
    .replace(LEADING_ARTICLE, "")
    .replace(/^[\s"'“”‘’׳״\-–(.]+/, "")
    .trim();
}

/** The jump-list letter of a name: Hebrew letters without final forms, Latin capitals, else "#". */
export function letterOf(text: string): string {
  const ch = sortForm(text).charAt(0);
  if (/[א-ת]/.test(ch)) return HEBREW_FINALS[ch] ?? ch;
  if (/[a-z]/i.test(ch)) return ch.toUpperCase();
  return "#";
}

const collators = { he: new Intl.Collator("he", { sensitivity: "base", numeric: true }), en: new Intl.Collator("en", { sensitivity: "base", numeric: true }) };

/**
 * Alphabetical order for an edition: names in the edition's script first (Hebrew letters in the
 * Yiddish edition, Latin in the English one), each part in its own collation; ties by key.
 */
export function compareNames(ed: Ed) {
  const primary = ed === "yi" ? "he" : "latin";
  return (a: { name: Run; key: string }, b: { name: Run; key: string }): number => {
    const sa = scriptOf(a.name.text) === primary ? 0 : 1;
    const sb = scriptOf(b.name.text) === primary ? 0 : 1;
    if (sa !== sb) return sa - sb;
    const ka = sortForm(a.name.text);
    const kb = sortForm(b.name.text);
    const heb = /[א-ת]/.test(ka.charAt(0)) || /[א-ת]/.test(kb.charAt(0));
    return (heb ? collators.he : collators.en).compare(ka, kb) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  };
}

export interface LetterBlock<T> {
  readonly letter: string;
  /** Anchor id of the block. */
  readonly id: string;
  readonly items: T[];
}

/** Consecutive runs by letter (items already sorted). */
export function byLetter<T extends { letter: string }>(items: readonly T[]): LetterBlock<T>[] {
  const out: LetterBlock<T>[] = [];
  for (const item of items) {
    const last = out[out.length - 1];
    if (last && last.letter === item.letter) last.items.push(item);
    else out.push({ letter: item.letter, id: `letter-${out.length + 1}`, items: [item] });
  }
  return out;
}

// ------------------------------------------------------------------ sources

export type WorkGroupId =
  | "torah" | "neviim" | "kesuvim" | "targum" | "mishnah" | "bavli" | "yerushalmi" | "midrash"
  | "zohar" | "rishonim" | "acharonim" | "tefillah" | "other" | "unmapped" | "general";

export interface MentionLine {
  /** "apparently" for an inferred identification; null when resolved. */
  readonly qualifier: string | null;
  readonly cite: Cite;
}

export interface RefBlock {
  readonly ref: string;
  readonly label: Run;
  readonly sefaria: string | null;
  readonly mentions: readonly MentionLine[];
}

export interface OtherRefLine extends MentionLine {
  /** The reference as the notes give it. */
  readonly text: Run;
}
