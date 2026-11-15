/**
 * FTS5 MATCH expressions from a normalized query. Tokens come from fold(), so they hold only
 * Unicode letters and digits; they are still quoted (and quotes doubled) so no token can be
 * read as an FTS5 operator.
 */
import type { NormalizedQuery } from "./query.ts";

function quote(token: string): string {
  return `"${token.replaceAll('"', '""')}"`;
}

function sequences(q: NormalizedQuery): (readonly string[])[] {
  const all = [q.tokens, ...q.alternatives].filter((s) => s.length > 0);
  const seen = new Set<string>();
  return all.filter((s) => {
    const k = s.join(" ");
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Word table: every token as a prefix match, all tokens required. One-letter tokens are
 * dropped when the query has longer ones (they would match half the corpus as prefixes).
 */
export function wordsMatch(q: NormalizedQuery): string | null {
  const groups = sequences(q)
    .map((seq) => {
      const long = seq.filter((t) => [...t].length > 1);
      const use = long.length > 0 ? long : seq;
      return use.map((t) => `${quote(t)}*`).join(" ");
    })
    .filter((g) => g.length > 0);
  if (groups.length === 0) return null;
  return groups.length === 1 ? (groups[0] as string) : groups.map((g) => `(${g})`).join(" OR ");
}

/**
 * Trigram table: substring match per token, all required. The trigram tokenizer cannot
 * match strings shorter than three characters, so shorter tokens are left to the word table.
 */
export function trigramMatch(q: NormalizedQuery): string | null {
  const groups = sequences(q)
    .map((seq) => seq.filter((t) => [...t].length >= 3).map(quote).join(" "))
    .filter((g) => g.length > 0);
  if (groups.length === 0) return null;
  return groups.length === 1 ? (groups[0] as string) : groups.map((g) => `(${g})`).join(" OR ");
}
