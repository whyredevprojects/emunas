/**
 * Query normalization for the Worker, backed by `normalizeQuery` from `@emunas/search-core`
 * (the one implementation shared with the Pagefind glue and MiniSearch; W2.2).
 *
 * search-core returns `{ terms, expansions, tokens, variants }`. The Worker's FTS and snippet
 * code works on token sequences that must all match (AND), plus alternative sequences:
 *
 * - `tokens`: search-core `terms` (the folded query, in order, deduplicated);
 * - `alternatives`: every further search-core `variant` (the query with one alias span replaced
 *   by another name of the same parsha/occasion/work/person/concept), split into tokens, then
 *   the pre-variant spelling (`lag baomer` before it folds to `לג בעומר`), which lets the
 *   snippet code highlight display words that fold one at a time (`Lag`, `BaOmer`);
 * - `expansions`: passed through (entity keys a later filter can use).
 *
 * The index side (the W3.10 sync) writes FTS rows with search-core's `momentSearchText`, which
 * uses the same `fold`, so both sides meet on folded tokens.
 */
import { indexTokens, normalizeQuery as coreNormalizeQuery, type Expansion } from "@emunas/search-core";
import { foldBasicTokens } from "@emunas/normalize/fold";

export interface NormalizedQuery {
  /** Folded query (the canonical form). */
  readonly folded: string;
  /** Tokens of `folded`, deduplicated, at most MAX_QUERY_TOKENS. */
  readonly tokens: readonly string[];
  /** Other token sequences that should match as well (alias variants). */
  readonly alternatives: readonly (readonly string[])[];
  /** Alias expansions found by search-core (kind + key + other names). */
  readonly expansions?: readonly Expansion[];
}

export const MAX_QUERY_TOKENS = 12;

export function normalizeQuery(q: string): NormalizedQuery {
  const core = coreNormalizeQuery(q);
  const tokens = core.terms.slice(0, MAX_QUERY_TOKENS);
  const seen = new Set<string>([tokens.join(" ")]);
  const alternatives: string[][] = [];
  for (const variant of core.variants.slice(1)) {
    const seq = [...new Set(variant.split(" ").filter((t) => t.length > 0))].slice(0, MAX_QUERY_TOKENS);
    const key = seq.join(" ");
    if (seq.length === 0 || seen.has(key)) continue;
    seen.add(key);
    alternatives.push(seq);
  }
  const basic = [...new Set(foldBasicTokens(core.raw))].slice(0, MAX_QUERY_TOKENS);
  if (basic.length > 0 && !seen.has(basic.join(" "))) alternatives.push(basic);
  return { folded: tokens.join(" "), tokens, alternatives, expansions: core.expansions };
}

/** Folds one word of display text the same way query tokens are folded. */
export function foldWord(word: string): string {
  return indexTokens(word).join(" ");
}
