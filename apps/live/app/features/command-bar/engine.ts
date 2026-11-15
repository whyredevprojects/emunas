/**
 * The command bar's client-side engine (tech-live §4.4 step 1): instant suggestions and shiur-level
 * matching with no network once its files are loaded. This module is imported lazily (on first focus
 * of the bar or on the search page), so MiniSearch and the normalize alias tables stay out of the
 * shell's first-load JavaScript.
 *
 * Inputs (all static `/data/*`, cached by the service worker):
 * - `quick-index.<ui>.json`: a serialized MiniSearch over search-core fields, pre-folded at build time
 *   (W3.6, `data-build/emit.ts`). If it cannot be loaded (missing, or not a MiniSearch dump, e.g. the
 *   dev fixtures), an equivalent index is built here from `corpus.json` + `facets.json`.
 * - `corpus.json`: shiur rows for display (title, one-liner, audio language, years, series, perek).
 * - `facets.json`: the entity dictionary (occasions, works, people, concepts, series, years).
 *
 * Only catalog and generated fields are ever matched or shown; nothing here can reach a transcript.
 */
import type { Ed, L } from "@emunas/corpus/public";
import { parseHebrewNumeral, parseHebrewYear } from "@emunas/normalize";
import { foldForIndex, normalizeQuery, type NormalizedQuery } from "@emunas/search-core";
import MiniSearch, { type Query, type SearchResult } from "minisearch";
import type { CorpusFile, CorpusRow, FacetLabel, FacetsFile, QuickIndexFile } from "./live-data.ts";

// ---------------------------------------------------------------------------------------------
// Types

export type EntitySuggestionType = "occasion" | "work" | "person" | "concept" | "series";

export type Suggestion =
  | { type: EntitySuggestionType; key: string; label: FacetLabel; count: number }
  | { type: "series-part"; seriesKey: string; label: FacetLabel; how: "perek" | "part"; n: number; shiurId: string }
  | { type: "year"; year: number; count: number };

/** Which indexed field a shiur-level hit matched (shown next to the result). */
export type QuickField = "title" | "occasion" | "oneLiner" | "sections" | "entities";

export interface ShiurHit {
  shiurId: string;
  /** Catalog title as written; render with the shiur's language. */
  title: string;
  lang: Ed | null;
  oneLiner: L | null;
  years: number[];
  fields: QuickField[];
  score: number;
}

export interface QuickSearch {
  readonly ui: Ed;
  /** Whether the shipped quick index was used (false: rebuilt from corpus.json). */
  readonly shippedIndex: boolean;
  suggest(q: string, limit?: number): Suggestion[];
  shiurs(q: string, limit?: number): ShiurHit[];
  row(shiurId: string): CorpusRow | undefined;
}

export interface QuickInputs {
  ui: Ed;
  quick: QuickIndexFile | null;
  corpus: CorpusFile | null;
  facets: FacetsFile | null;
}

// ---------------------------------------------------------------------------------------------
// The MiniSearch index

/** Same field names as the shipped index (`QUICK_INDEX_FIELDS` in data-build/emit.ts). */
export const QUICK_FIELDS: readonly QuickField[] = ["title", "occasion", "oneLiner", "sections", "entities"];
const BOOST: Record<QuickField, number> = { title: 3, occasion: 2.5, entities: 1.5, sections: 1.2, oneLiner: 1 };

type QuickDoc = { id: string; name: string } & Record<QuickField, string>;

function loadShipped(file: QuickIndexFile | null): MiniSearch<QuickDoc> | null {
  if (!file || typeof file.index !== "object" || file.index === null) return null;
  const opts = file.options;
  if (!Array.isArray(opts?.fields) || !opts.fields.every((f) => typeof f === "string")) return null;
  try {
    return MiniSearch.loadJSON<QuickDoc>(JSON.stringify(file.index), {
      fields: opts.fields,
      storeFields: opts.storeFields,
      idField: opts.idField,
    });
  } catch {
    return null;
  }
}

const fold = (xs: readonly (string | null | undefined)[]): string =>
  xs
    .flatMap((x) => (x ? [foldForIndex(x)] : []))
    .filter((x) => x.length > 0)
    .join("\n");

function labelNames(l: FacetLabel | undefined): string[] {
  return l ? [l.en, l.yi, l.he].filter((x): x is string => typeof x === "string") : [];
}

/** The fallback index: the same fields, from the files the shell already uses. */
function buildFromCorpus(corpus: CorpusFile, facets: FacetsFile | null, ui: Ed): MiniSearch<QuickDoc> {
  const ms = new MiniSearch<QuickDoc>({ fields: [...QUICK_FIELDS], storeFields: ["name"], idField: "id" });
  const occ = (k: string | null) => (k && facets ? labelNames(facets.occasion[k]?.label) : k ? [k] : []);
  ms.addAll(
    corpus.shiurim.map((r) => ({
      id: r.id,
      name: r.title,
      title: fold([r.title, r.heading]),
      occasion: fold([...occ(r.parsha), ...occ(r.zman)]),
      oneLiner: fold([r.oneLiner?.[ui]]),
      sections: "",
      entities: fold([
        ...r.entities.works.flatMap((k) => labelNames(facets?.work[k]?.label)),
        ...r.entities.people.flatMap((k) => labelNames(facets?.person[k]?.label)),
        ...r.entities.concepts.flatMap((k) => labelNames(facets?.concept[k]?.label)),
      ]),
    })),
  );
  return ms;
}

/**
 * The MiniSearch query for a normalized query: any variant (alias expansions give one variant per
 * alternative name) whose terms all match; the last term of each variant matches as a prefix, so
 * results appear while the user is still typing a word.
 */
export function quickQuery(nq: NormalizedQuery): Query | null {
  const variants = nq.variants.filter((v) => v.trim().length > 0);
  if (variants.length === 0) return null;
  return {
    combineWith: "OR",
    queries: variants.map((v) => ({
      queries: [v],
      combineWith: "AND",
      prefix: (_term: string, i: number, terms: string[]) => i === terms.length - 1,
      fuzzy: (term: string) => ([...term].length >= 6 ? 0.15 : false),
      boost: { ...BOOST },
    })),
  };
}

// ---------------------------------------------------------------------------------------------
// Entity suggestions

interface EntityEntry {
  type: EntitySuggestionType;
  key: string;
  label: FacetLabel;
  count: number;
  /** Folded names, each as tokens. */
  names: string[][];
}

/** Plain lower-case words (no transliteration folding), so a partial "Lag" still prefixes "Lag BaOmer". */
function plainTokens(s: string): string[] {
  return s
    .normalize("NFC")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 0);
}

/** Each name as folded tokens and as plain tokens (deduplicated). */
function nameForms(names: readonly string[]): string[][] {
  const out = new Map<string, string[]>();
  for (const n of names) {
    for (const toks of [foldForIndex(n).split(" ").filter((t) => t.length > 0), plainTokens(n)]) {
      if (toks.length > 0) out.set(toks.join(" "), toks);
    }
  }
  return [...out.values()];
}

/** Query forms to try against names: every normalized variant, plus the plain words as typed. */
function queryForms(raw: string, nq: NormalizedQuery): string[][] {
  return [...nq.variants.map((v) => v.split(" ").filter((t) => t.length > 0)), plainTokens(raw)].filter((x) => x.length > 0);
}

const TYPE_ORDER: Record<EntitySuggestionType, number> = { occasion: 0, series: 1, work: 2, person: 3, concept: 4 };

function entries(facets: FacetsFile | null): EntityEntry[] {
  if (!facets) return [];
  const out: EntityEntry[] = [];
  const add = (type: EntitySuggestionType, table: Record<string, { label: FacetLabel; count: number }>) => {
    for (const [key, v] of Object.entries(table)) {
      out.push({ type, key, label: v.label, count: v.count, names: nameForms([...labelNames(v.label), key.replace(/-/g, " ")]) });
    }
  };
  add("occasion", facets.occasion);
  add("series", facets.series);
  add("work", facets.work);
  add("person", facets.person);
  add("concept", facets.concept);
  return out;
}

/** 3 = a name equals the query, 2 = a name starts with it, 1 = every term prefixes some word, 0 = no match. */
function nameScore(name: readonly string[], terms: readonly string[]): number {
  if (terms.length === 0) return 0;
  const q = terms.join(" ");
  const n = name.join(" ");
  if (n === q) return 3;
  if (n.startsWith(q)) return 2;
  return terms.every((t) => name.some((w) => w.startsWith(t))) ? 1 : 0;
}

const EXPANSION_TYPE: Record<string, EntitySuggestionType> = {
  parsha: "occasion",
  occasion: "occasion",
  work: "work",
  person: "person",
  concept: "concept",
};

// ---------------------------------------------------------------------------------------------
// "Tanya 12" and years

/** Perek numbers in a catalog perek string (`י"א וי"ב` → [11, 12]; `5` → [5]). */
export function perekNumbers(perek: string | null): number[] {
  if (!perek) return [];
  const out: number[] = [];
  for (const raw of perek.split(/[\s,\-–־]+/u)) {
    const w = raw.trim();
    if (w.length === 0) continue;
    if (/^[0-9]{1,3}$/.test(w)) {
      out.push(Number(w));
      continue;
    }
    // A Hebrew numeral never starts with ו followed by more letters, so a leading ו there is "and".
    const bare = w.replace(/["'\u05F3\u05F4]/gu, "");
    const conj = bare.length > 1 && bare.startsWith("ו");
    // Perek numerals are at most three letters (קנ"ד); a longer word (הקדמה) is a word, not a number.
    if ((conj ? bare.length - 1 : bare.length) > 3) continue;
    const n = conj ? parseHebrewNumeral(w.slice(1)) : parseHebrewNumeral(w);
    if (n !== null) out.push(n);
  }
  return out;
}

/** A number typed at the end of a query: digits or a Hebrew numeral with geresh/gershayim. */
function trailingNumber(raw: string): { n: number; rest: string } | null {
  const m = /^(.*\S)\s+(\S+)$/u.exec(raw.trim());
  if (!m || m[1] === undefined || m[2] === undefined) return null;
  const tok = m[2];
  if (/^[0-9]{1,3}$/.test(tok)) return { n: Number(tok), rest: m[1] };
  if (/^[א-ת]{1,3}$|^[א-ת]+["'׳״][א-ת]*$/u.test(tok)) {
    const n = parseHebrewNumeral(tok);
    if (n !== null && n > 0 && n < 1000) return { n, rest: m[1] };
  }
  return null;
}

/** Candidate Hebrew years for one typed token: 5736, תשל"ו, 1976 (civil → both overlapping years). */
export function yearCandidates(tok: string): number[] {
  const t = tok.trim();
  if (/^5[0-9]{3}$/.test(t)) return [Number(t)];
  if (/^(19|20)[0-9]{2}$/.test(t)) return [Number(t) + 3760, Number(t) + 3761];
  if (/^[א-ת'"׳״]{3,8}$/u.test(t) && /[הקרשת]/u.test(t)) {
    const y = parseHebrewYear(t);
    if (y !== null && y >= 5600 && y <= 5900) return [y];
  }
  return [];
}

// ---------------------------------------------------------------------------------------------
// The engine

export function createQuickSearch(inputs: QuickInputs): QuickSearch {
  const { ui, corpus, facets } = inputs;
  const shipped = loadShipped(inputs.quick);
  if (!shipped && !corpus) throw new Error("quick search: neither quick-index nor corpus.json is available");
  const index = shipped ?? buildFromCorpus(corpus as CorpusFile, facets, ui);
  const rows = new Map<string, CorpusRow>((corpus?.shiurim ?? []).map((r) => [r.id, r]));
  const dict = entries(facets);

  function shiurs(q: string, limit = 20): ShiurHit[] {
    const nq = normalizeQuery(q);
    const query = quickQuery(nq);
    if (!query) return [];
    const hits: SearchResult[] = index.search(query);
    return hits.slice(0, limit).map((h) => {
      const id = String(h.id);
      const row = rows.get(id);
      const fields = [...new Set(Object.values(h.match).flat())].filter((f): f is QuickField =>
        (QUICK_FIELDS as readonly string[]).includes(f),
      );
      fields.sort((a, b) => QUICK_FIELDS.indexOf(a) - QUICK_FIELDS.indexOf(b));
      return {
        shiurId: id,
        title: row?.title ?? (typeof h["name"] === "string" ? h["name"] : id),
        lang: row?.lang ?? null,
        oneLiner: row?.oneLiner ?? null,
        years: row?.years ?? [],
        fields,
        score: h.score,
      };
    });
  }

  function entitySuggestions(nq: NormalizedQuery): (Suggestion & { type: EntitySuggestionType })[] {
    const scored: { e: EntityEntry; s: number }[] = [];
    const expanded = new Set(nq.expansions.map((x) => `${EXPANSION_TYPE[x.kind] ?? x.kind}:${x.key}`));
    const altTerms = queryForms(nq.raw, nq);
    for (const e of dict) {
      let s = 0;
      for (const terms of altTerms) for (const name of e.names) s = Math.max(s, nameScore(name, terms));
      if (expanded.has(`${e.type}:${e.key}`)) s = Math.max(s, 2.5);
      if (s > 0) scored.push({ e, s });
    }
    scored.sort(
      (a, b) => b.s - a.s || TYPE_ORDER[a.e.type] - TYPE_ORDER[b.e.type] || b.e.count - a.e.count || (a.e.key < b.e.key ? -1 : 1),
    );
    return scored.map(({ e }) => ({ type: e.type, key: e.key, label: e.label, count: e.count }));
  }

  function seriesParts(raw: string): Suggestion[] {
    const tail = trailingNumber(raw);
    if (!tail || !corpus || !facets) return [];
    const alts = queryForms(tail.rest, normalizeQuery(tail.rest));
    const out: Suggestion[] = [];
    for (const [key, v] of Object.entries(facets.series)) {
      const names = nameForms([...labelNames(v.label), key.replace(/-/g, " ")]);
      const hit = alts.some((terms) => names.some((name) => nameScore(name, terms) > 0));
      if (!hit) continue;
      const parts = corpus.shiurim
        .filter((r) => r.series?.id === key)
        .sort((a, b) => (a.series?.order ?? 1e9) - (b.series?.order ?? 1e9) || (a.id < b.id ? -1 : 1));
      const byPerek = parts.find((r) => perekNumbers(r.perek).includes(tail.n));
      if (byPerek) out.push({ type: "series-part", seriesKey: key, label: v.label, how: "perek", n: tail.n, shiurId: byPerek.id });
      const byOrder = parts.find((r) => r.series?.order === tail.n);
      if (byOrder) out.push({ type: "series-part", seriesKey: key, label: v.label, how: "part", n: tail.n, shiurId: byOrder.id });
    }
    // The UI language's own series first.
    return out.sort((a, b) => {
      const la = a.type === "series-part" ? (facets.series[a.seriesKey]?.lang === ui ? 0 : 1) : 0;
      const lb = b.type === "series-part" ? (facets.series[b.seriesKey]?.lang === ui ? 0 : 1) : 0;
      return la - lb;
    });
  }

  function years(raw: string): Suggestion[] {
    if (!facets) return [];
    const out: Suggestion[] = [];
    for (const tok of raw.split(/\s+/u)) {
      for (const y of yearCandidates(tok)) {
        const f = facets.year[String(y)];
        if (f && f.count > 0 && !out.some((s) => s.type === "year" && s.year === y)) out.push({ type: "year", year: y, count: f.count });
      }
    }
    return out;
  }

  function suggest(q: string, limit = 8): Suggestion[] {
    const raw = q.trim();
    if (raw.length === 0) return [];
    const nq = normalizeQuery(raw);
    const out: Suggestion[] = [...seriesParts(raw), ...years(raw)];
    const perType = new Map<string, number>();
    for (const s of entitySuggestions(nq)) {
      const n = perType.get(s.type) ?? 0;
      if (n >= 3) continue;
      perType.set(s.type, n + 1);
      out.push(s);
    }
    return out.slice(0, limit);
  }

  return {
    ui,
    shippedIndex: shipped !== null,
    suggest,
    shiurs,
    row: (id) => rows.get(id),
  };
}
