/**
 * Query normalization.
 *
 * Local shim for `normalizeQuery` from `@emunas/search-core` (W2.2), which had not landed when
 * this Worker was written. Same contract as the brief describes: fold (NFC, nikud stripped,
 * quotes unified, lower-cased) plus the transliteration/alias variants from
 * `@emunas/normalize`, so `ל"ג בעומר`, `ל”ג בעומר` and `lag baomer` produce the same tokens.
 * When search-core lands, replace the body of this module with a re-export and keep the
 * NormalizedQuery shape (or adapt `toNormalizedQuery`).
 */
import { foldBasicTokens, foldTokens } from "@emunas/normalize/fold";

export interface NormalizedQuery {
  /** Folded query with variants applied (the canonical form). */
  readonly folded: string;
  /** Tokens of `folded`. */
  readonly tokens: readonly string[];
  /** Other token sequences that should match as well (e.g. the pre-variant spelling). */
  readonly alternatives: readonly (readonly string[])[];
}

export const MAX_QUERY_TOKENS = 12;

export function normalizeQuery(q: string): NormalizedQuery {
  const tokens = foldTokens(q).slice(0, MAX_QUERY_TOKENS);
  const basic = foldBasicTokens(q).slice(0, MAX_QUERY_TOKENS);
  const alternatives = basic.join(" ") !== tokens.join(" ") && basic.length > 0 ? [basic] : [];
  return { folded: tokens.join(" "), tokens, alternatives };
}

/** Folds one word of display text the same way query tokens are folded. */
export function foldWord(word: string): string {
  return foldTokens(word).join(" ");
}
