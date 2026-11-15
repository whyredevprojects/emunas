/**
 * Query normalization, shared by the Pagefind glue (Quiet), MiniSearch (Live) and the emunas-api
 * Worker. Pure and browser-safe.
 *
 * normalizeQuery(q) = fold (normalizeHe + Latin folding + transliteration variants, from
 * @emunas/normalize) + alias expansion: spans of the query that name a parsha, occasion, work or
 * person in the normalize tables (or a concept spelling variant) add that entry's other names as
 * alternatives, so `parshas noach` also looks for `נח`, and `rambam` for `רמב"ם`.
 *
 * Index time uses the same `fold` (see `text.ts`), so both sides meet on folded tokens.
 */
import {
  fold,
  foldTokens,
  lookupConcept,
  lookupParsha,
  lookupPerson,
  lookupWork,
  lookupZman,
} from "@emunas/normalize";

export type ExpansionKind = "parsha" | "occasion" | "work" | "person" | "concept";

export interface Expansion {
  kind: ExpansionKind;
  /** Stable key from @emunas/normalize. */
  key: string;
  /** Token range [from, to) in `terms` that matched. */
  span: [number, number];
  /**
   * Folded alternative names (each may be several tokens), excluding the matched text itself.
   * Empty when every name folds to what was typed (`lag baomer` → `לג בעומר` already).
   */
  forms: string[];
}

export interface NormalizedQuery {
  /** The query as typed (trimmed). */
  raw: string;
  /** `fold(raw)`. */
  folded: string;
  /** Folded tokens in query order, deduplicated. Engines that AND their terms use these. */
  terms: string[];
  expansions: Expansion[];
  /** `terms` plus every token of every expansion form, deduplicated. Engines that OR use these. */
  tokens: string[];
  /** The folded query, then one alternative query per expansion form (span replaced), at most 9. */
  variants: string[];
}

/** Longest span (in tokens) considered for alias lookup. */
const MAX_SPAN = 5;
const MAX_VARIANTS = 9;
/** Upper bound on query length we process (characters); longer input is truncated. */
export const MAX_QUERY_LENGTH = 256;

function uniq(xs: Iterable<string>): string[] {
  return [...new Set([...xs].filter((x) => x.length > 0))];
}

function formsOf(names: readonly (string | undefined)[], matched: string): string[] {
  return uniq(names.map((n) => (n === undefined ? "" : fold(n)))).filter((f) => f !== matched);
}

function lookupSpan(text: string): { kind: ExpansionKind; key: string; names: string[] } | null {
  const p = lookupParsha(text);
  if (p.status === "mapped" && p.parsha) return { kind: "parsha", key: p.key, names: [p.parsha.he, p.parsha.yi, p.parsha.en] };
  const z = lookupZman(text);
  if (z.status === "mapped" && z.occasion) return { kind: "occasion", key: z.key, names: [z.occasion.he, z.occasion.yi, z.occasion.en] };
  const w = lookupWork(text);
  if (w.status === "mapped" && w.work) return { kind: "work", key: w.key, names: [w.work.he, w.work.yi, w.work.en] };
  const pe = lookupPerson(text);
  if (pe.status === "mapped" && pe.person) return { kind: "person", key: pe.key, names: [pe.person.he, pe.person.yi, pe.person.en] };
  const c = lookupConcept(text);
  if (c.merged) return { kind: "concept", key: c.key, names: [c.he] };
  return null;
}

/** Fold a query and expand aliases (see module doc). Never throws. */
export function normalizeQuery(q: string): NormalizedQuery {
  let raw = q.trim();
  if (raw.length > MAX_QUERY_LENGTH) {
    // Cut at a word boundary so the last term is not a fragment.
    const cut = raw.slice(0, MAX_QUERY_LENGTH + 1);
    const lastSpace = cut.search(/\s\S*$/u);
    raw = (lastSpace > 0 ? cut.slice(0, lastSpace) : cut.slice(0, MAX_QUERY_LENGTH)).trim();
  }
  const tokens0 = foldTokens(raw);
  const folded = tokens0.join(" ");
  const terms = uniq(tokens0);

  // Greedy longest-first, left to right, non-overlapping spans over the folded tokens.
  const expansions: Expansion[] = [];
  let i = 0;
  while (i < tokens0.length) {
    let advanced = false;
    for (let len = Math.min(MAX_SPAN, tokens0.length - i); len >= 1; len--) {
      const text = tokens0.slice(i, i + len).join(" ");
      if (text.length < 2) continue;
      const hit = lookupSpan(text);
      if (!hit) continue;
      const forms = formsOf(hit.names, text);
      // Kept even without new forms: the key still lets the api Worker filter by entity.
      if (!expansions.some((e) => e.kind === hit.kind && e.key === hit.key)) {
        expansions.push({ kind: hit.kind, key: hit.key, span: [i, i + len], forms });
      }
      i += len;
      advanced = true;
      break;
    }
    if (!advanced) i += 1;
  }

  const allTokens = uniq([...terms, ...expansions.flatMap((e) => e.forms.flatMap((f) => f.split(" ")))]);
  const variants = folded.length === 0 ? [] : [folded];
  for (const e of expansions) {
    for (const f of e.forms) {
      if (variants.length >= MAX_VARIANTS) break;
      const v = [...tokens0.slice(0, e.span[0]), f, ...tokens0.slice(e.span[1])].join(" ");
      if (!variants.includes(v)) variants.push(v);
    }
  }
  return { raw, folded, terms, expansions, tokens: allTokens, variants };
}
