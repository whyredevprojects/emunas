/**
 * The corpus synonym table for `normalizeQuery` (corpus-wave-plan §3.6). Pure and browser-safe.
 *
 * Built from EntityDocs (or anything with the same `kind`/`id`/`labels`/`synonyms`/`count`), whose
 * synonyms come from the layer's synonyms.json only: the entities' own display fields (labels,
 * names, titles, transliterations, display aliases). There is no input for ASR variants or
 * alias map keys, and `asrVariants` may only be passed as `false` (D1): anything else throws.
 *
 * Matching over folded query spans:
 *  - **exact**: the span equals one of the entity's terms;
 *  - **prefix**: the span is the first whole tokens of one of the entity's labels (not of its
 *    aliases, which are too broad for that), e.g. `hester` → the topic labelled "Hester Panim and
 *    Suffering". Spans made only of function words, or shorter than three letters, never prefix-match.
 */
import { fold } from "@emunas/normalize";
import type { EntityDocKind, EntityDocLabels } from "./types.ts";

/** What a table entry needs from an EntityDoc. */
export interface SynonymSource {
  kind: EntityDocKind;
  id: string;
  labels: EntityDocLabels;
  synonyms: readonly string[];
  count: number;
}

export interface SynonymEntry {
  kind: EntityDocKind;
  id: string;
  /** Folded labels (he, en, yi), deduplicated: the canonical forms offered as expansions. */
  forms: string[];
  count: number;
}

export interface SynonymTable {
  readonly entries: readonly SynonymEntry[];
  /** Folded term → entry indices. */
  readonly exact: ReadonlyMap<string, readonly number[]>;
  /** Folded label prefix (whole tokens) → entry indices. */
  readonly prefix: ReadonlyMap<string, readonly number[]>;
}

export interface SynonymTableOptions {
  /** D1 (`corpus-policy.json` `search.asrVariants`). Only `false` is accepted. */
  asrVariants?: false;
}

/** Longest prefix (in tokens) indexed; matches `normalizeQuery`'s longest span. */
export const MAX_PREFIX_TOKENS = 5;

/** Words that never start a prefix match on their own (folded). */
const FUNCTION_WORDS = new Set([
  "the",
  "a",
  "an",
  "of",
  "and",
  "in",
  "on",
  "to",
  "for",
  "as",
  "with",
  "rabbi",
  "rav",
  "reb",
  "rebbe",
  "der",
  "di",
  "dos",
  "un",
  "fun",
  "דער",
  "די",
  "דאס",
  "און",
  "פון",
  "רבי",
  "ר",
  "של",
  "ה",
  "ו",
]);

export function isFunctionWord(token: string): boolean {
  return FUNCTION_WORDS.has(token);
}

/**
 * A folded term and, when it starts with function words ("the Baal Shem Tov", "דער …"), the same
 * term without them, so `baal shem tov` meets "the Baal Shem Tov". Derived from the display term
 * itself; nothing is added that the entity does not display.
 */
export function termKeys(term: string): string[] {
  const toks = term.split(" ").filter((t) => t !== "");
  let i = 0;
  while (i < toks.length - 1 && FUNCTION_WORDS.has(toks[i]!)) i++;
  const full = toks.join(" ");
  const bare = toks.slice(i).join(" ");
  return i > 0 && prefixable(toks.slice(i)) ? [full, bare] : [full];
}

function prefixable(tokens: readonly string[]): boolean {
  if (tokens.every((t) => FUNCTION_WORDS.has(t))) return false;
  return tokens.join("").length >= 3;
}

/** Build the table (see module doc). Throws when asked for ASR variants. */
export function buildSynonymTable(sources: Iterable<SynonymSource>, opts: SynonymTableOptions = {}): SynonymTable {
  const asr: unknown = (opts as { asrVariants?: unknown }).asrVariants;
  if (asr !== undefined && asr !== false) {
    throw new Error("search synonyms: asrVariants must be false (corpus-policy search.asrVariants, D1)");
  }
  const entries: SynonymEntry[] = [];
  const exact = new Map<string, number[]>();
  const prefix = new Map<string, number[]>();
  const add = (m: Map<string, number[]>, k: string, i: number) => {
    const l = m.get(k);
    if (l === undefined) m.set(k, [i]);
    else if (!l.includes(i)) l.push(i);
  };
  for (const s of sources) {
    const forms: string[] = [];
    for (const l of [s.labels.he, s.labels.en, s.labels.yi]) {
      const f = l === null ? "" : fold(l);
      if (f !== "" && !forms.includes(f)) forms.push(f);
    }
    const i = entries.length;
    entries.push({ kind: s.kind, id: s.id, forms, count: s.count });
    for (const t of [...forms, ...s.synonyms.map((x) => fold(x))]) if (t !== "") for (const k of termKeys(t)) add(exact, k, i);
    for (const f of forms.flatMap(termKeys)) {
      const toks = f.split(" ");
      for (let n = 1; n < toks.length && n <= MAX_PREFIX_TOKENS; n++) {
        const head = toks.slice(0, n);
        if (prefixable(head)) add(prefix, head.join(" "), i);
      }
    }
  }
  return { entries, exact, prefix };
}

export type EntityMatchKind = "exact" | "prefix";

export interface EntityMatch {
  entry: SynonymEntry;
  match: EntityMatchKind;
}

/** At most this many entities per matched span (exact first, then by visible count). */
export const MAX_ENTITY_MATCHES = 8;

/** Entities a folded span names (empty when none). */
export function matchSpan(table: SynonymTable, span: string): EntityMatch[] {
  const seen = new Set<number>();
  const out: EntityMatch[] = [];
  const take = (ids: readonly number[] | undefined, match: EntityMatchKind) => {
    const sorted = [...(ids ?? [])].filter((i) => !seen.has(i));
    sorted.sort((a, b) => table.entries[b]!.count - table.entries[a]!.count || (table.entries[a]!.id < table.entries[b]!.id ? -1 : 1));
    for (const i of sorted) {
      seen.add(i);
      out.push({ entry: table.entries[i]!, match });
    }
  };
  take(table.exact.get(span), "exact");
  if (prefixable(span.split(" "))) take(table.prefix.get(span), "prefix");
  return out.slice(0, MAX_ENTITY_MATCHES);
}
