/**
 * Text normalization and search folding. Pure, browser-safe, no dependencies.
 *
 * Three levels, each built on the previous one:
 *
 * - `normalizeHe(s)`: mechanical, meaning-preserving cleanup used for ids, FTS rows and the
 *   client index. NFC; maqaf (U+05BE) becomes "-"; nikud and cantillation (U+0591–U+05C7) are
 *   stripped; Hebrew presentation forms are decomposed; ״ ” “ „ become `"`; ׳ ’ ‘ ` ´ become `'`;
 *   whitespace is collapsed and trimmed. Displayed text is never passed through this.
 * - `foldBasic(s)`: matching form used by every key function. `normalizeHe`, then Latin
 *   diacritics removed and lower-cased, quotes/apostrophes/geresh removed (ל"ג → לג), hyphens and
 *   other punctuation become spaces, Yiddish digraph ligatures expanded (ײ → יי). Stable: keys are
 *   derived from it, so changes here change URLs. Do not edit casually.
 * - `fold(s)`: search folding. `foldBasic` plus the transliteration variant table
 *   (`tables/variants.ts`), so `lag baomer`, `ל"ג בעומר` and `ל”ג בעומר` all fold to `לג בעומר`.
 *   Used at index time and on the query (Pagefind glue, MiniSearch, the API Worker).
 */
import { VARIANTS } from "./tables/variants.ts";

const NIKUD_AND_CANTILLATION = /[\u0591-\u05C7]/g;
const DOUBLE_QUOTES = /[\u05F4\u201C\u201D\u201E\u201F\u2033\u00AB\u00BB]/g;
const SINGLE_QUOTES = /[\u05F3\u2018\u2019\u201A\u201B`\u00B4\u2032]/g;
const DASHES = /[\u05BE\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g;
const WHITESPACE = /\s+/gu;

/** Mechanical normalization (see module doc). */
export function normalizeHe(input: string): string {
  if (input.length === 0) return "";
  return (
    input
      // NFD decomposes Hebrew presentation forms (U+FB1D–FB4E) into letter + point,
      // so stripping the points below leaves the plain letter.
      .normalize("NFD")
      .replace(DASHES, "-")
      .replace(NIKUD_AND_CANTILLATION, "")
      .replace(DOUBLE_QUOTES, '"')
      .replace(SINGLE_QUOTES, "'")
      .normalize("NFC")
      .replace(WHITESPACE, " ")
      .trim()
  );
}

const YIDDISH_LIGATURES: Readonly<Record<string, string>> = {
  "\u05F0": "וו", // װ → וו
  "\u05F1": "וי", // ױ → וי
  "\u05F2": "יי", // ײ → יי
  "\uFB4F": "אל", // ﭏ → אל
};

/** Matching form for keys and lookups (see module doc). */
export function foldBasic(input: string): string {
  const n = normalizeHe(input);
  if (n.length === 0) return "";
  return (
    n
      .replace(/[\u05F0\u05F1\u05F2\uFB4F]/g, (c) => YIDDISH_LIGATURES[c] ?? c)
      .normalize("NFD")
      .replace(/\p{M}/gu, "") // Latin diacritics (ḥ → h, é → e); Hebrew points are already gone
      .toLowerCase()
      .replace(/["']/g, "") // ל"ג → לג, ba'al → baal
      .replace(/[^\p{L}\p{N}]+/gu, " ") // hyphens and all other punctuation → space
      .normalize("NFC")
      .trim()
  );
}

/** Tokens of `foldBasic(s)`. */
export function foldBasicTokens(input: string): string[] {
  const f = foldBasic(input);
  return f.length === 0 ? [] : f.split(" ");
}

// ---- variant table, compiled once ----

interface Compiled {
  /** first token → candidate variants (token arrays) longest first, with their canonical tokens */
  byFirst: Map<string, { tokens: string[]; canonical: string[] }[]>;
}

function compile(): Compiled {
  const byFirst = new Map<string, { tokens: string[]; canonical: string[] }[]>();
  for (const row of VARIANTS) {
    const canonical = foldBasicTokens(row.canonical);
    for (const v of row.variants) {
      const tokens = foldBasicTokens(v);
      const first = tokens[0];
      if (first === undefined) continue;
      const list = byFirst.get(first) ?? [];
      if (!list.some((e) => e.tokens.join(" ") === tokens.join(" "))) list.push({ tokens, canonical });
      byFirst.set(first, list);
    }
  }
  for (const list of byFirst.values()) list.sort((a, b) => b.tokens.length - a.tokens.length);
  return { byFirst };
}

let compiled: Compiled | null = null;

/** Apply the variant table to already-folded tokens (longest match first, left to right). */
export function applyVariants(tokens: readonly string[]): string[] {
  compiled ??= compile();
  const out: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    const tok = tokens[i] as string;
    const candidates = compiled.byFirst.get(tok);
    let matched = false;
    if (candidates) {
      for (const c of candidates) {
        if (i + c.tokens.length > tokens.length) continue;
        let ok = true;
        for (let k = 1; k < c.tokens.length; k++) {
          if (tokens[i + k] !== c.tokens[k]) {
            ok = false;
            break;
          }
        }
        if (ok) {
          out.push(...c.canonical);
          i += c.tokens.length;
          matched = true;
          break;
        }
      }
    }
    if (!matched) {
      out.push(tok);
      i += 1;
    }
  }
  return out;
}

/** Search folding (see module doc). */
export function fold(input: string): string {
  return applyVariants(foldBasicTokens(input)).join(" ");
}

/** Tokens of `fold(s)`. */
export function foldTokens(input: string): string[] {
  return applyVariants(foldBasicTokens(input));
}
