/**
 * The command bar's client-side engine (tech-live §4.4 step 1; corpus-wave-plan C3.6): instant
 * suggestions and shiur-level matching with no network once its files are loaded. This module is
 * imported lazily (on first focus of the bar or on the search page), so MiniSearch and the normalize
 * alias tables stay out of the shell's first-load JavaScript.
 *
 * Inputs (all static `/data/*`, cached by the service worker); `corpus.json` is not one of them:
 * - `quick-index.<ui>.json`: a serialized MiniSearch over search-core fields, pre-folded at build time
 *   (`data-build/emit.ts`), storing each shiur's catalog title and audio language, plus `entities`:
 *   the search-core EntityDocs of the topics, concepts, people and works that have a Live page.
 * - `facets.json`: occasions, series and years (catalog-derived).
 *
 * Entity suggestions come only from the quick index's entities, keyed by corpus id, so a person
 * below the page threshold or of the `other` group is never suggested (concept-live-corpus E.1).
 * Query expansion is `normalizeQuery` with the clean synonym table built from those entities: their
 * own display fields only, never an ASR variant (F.2), so "Hashem Tov" names nobody.
 *
 * Only catalog and generated fields are ever matched or shown; nothing here can reach a transcript.
 */
import type { Ed } from "@emunas/corpus/public";
import { byUiLang, UI_LANGS, type UiLang } from "@emunas/i18n";
import { parseHebrewNumeral, parseHebrewYear } from "@emunas/normalize";
import { buildSynonymTable, foldForIndex, normalizeQuery, type NormalizedQuery, type SynonymTable } from "@emunas/search-core";
import MiniSearch, { type Query, type SearchResult } from "minisearch";
import type { FacetLabel, FacetsFile, QuickEntity, QuickEntityKind, QuickIndexFile, SeriesFile } from "./live-data.ts";

// ---------------------------------------------------------------------------------------------
// Types

export type FacetSuggestionType = "occasion" | "series";

export type Suggestion =
  | { type: FacetSuggestionType; key: string; label: FacetLabel; count: number }
  | { type: "entity"; kind: QuickEntityKind; id: string; labels: QuickEntity["labels"]; count: number }
  | { type: "series-part"; seriesKey: string; label: FacetLabel; how: "perek" | "part"; n: number; shiurId: string }
  | { type: "year"; year: number; count: number };

/** Which indexed field a shiur-level hit matched (shown next to the result). */
export type QuickField = "title" | "occasion" | "oneLiner" | "sections" | "entities";

export interface ShiurHit {
  shiurId: string;
  /** Catalog title as written; render with the shiur's language. */
  title: string;
  lang: Ed | null;
  fields: QuickField[];
  score: number;
}

/** A series named by a query ending in a number ("Tanya 12"); its parts come from `series/<id>.json`. */
export interface SeriesTarget {
  seriesKey: string;
  label: FacetLabel;
  lang: Ed;
  n: number;
}

export interface QuickSearch {
  readonly ui: UiLang;
  suggest(q: string, limit?: number): Suggestion[];
  shiurs(q: string, limit?: number): ShiurHit[];
  /** Series a "<series> <number>" query names, the interface language's own first. */
  seriesTargets(q: string): SeriesTarget[];
  /** A suggestible entity by corpus id (filter chips, result labels). */
  entity(kind: QuickEntityKind, id: string): QuickEntity | undefined;
  /** The normalized query with the clean synonym table (corpus entity expansion). */
  normalize(q: string): NormalizedQuery;
}

export interface QuickInputs {
  ui: UiLang;
  quick: QuickIndexFile;
  facets: FacetsFile | null;
}

// ---------------------------------------------------------------------------------------------
// The MiniSearch index

/** Same field names as the shipped index (`QUICK_INDEX_FIELDS` in data-build/emit.ts). */
export const QUICK_FIELDS: readonly QuickField[] = ["title", "occasion", "oneLiner", "sections", "entities"];
const BOOST: Record<QuickField, number> = { title: 3, occasion: 2.5, entities: 1.5, sections: 1.2, oneLiner: 1 };

type QuickDoc = { id: string; name: string; lang: Ed } & Record<QuickField, string>;

function loadShipped(file: QuickIndexFile): MiniSearch<QuickDoc> {
  const opts = file.options;
  if (typeof file.index !== "object" || file.index === null || !Array.isArray(opts?.fields)) {
    throw new Error("quick search: quick-index is not a MiniSearch dump");
  }
  return MiniSearch.loadJSON<QuickDoc>(JSON.stringify(file.index), {
    fields: opts.fields,
    storeFields: opts.storeFields,
    idField: opts.idField,
  });
}

/**
 * The MiniSearch query for a normalized query: any variant (alias and synonym expansions give one
 * variant per alternative name) whose terms all match; the last term of each variant matches as a
 * prefix, so results appear while the user is still typing a word.
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
// Name matching

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

/** Query forms to try against names: the folded query (not its expansions), plus the plain words as typed. */
function queryForms(raw: string, nq: NormalizedQuery): string[][] {
  return [nq.terms, plainTokens(raw)].filter((x) => x.length > 0);
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

function labelNames(l: FacetLabel | undefined): string[] {
  return l ? UI_LANGS.map((lang) => l[lang]).filter((x): x is string => typeof x === "string") : [];
}

const entityLabelNames = (l: QuickEntity["labels"]): string[] =>
  UI_LANGS.map((lang) => l[lang]).filter((x): x is string => typeof x === "string" && x !== "");

// ---------------------------------------------------------------------------------------------
// Dictionary

type DictKey = FacetSuggestionType | QuickEntityKind;

interface DictEntry {
  key: DictKey;
  sg: Suggestion & { type: FacetSuggestionType | "entity" };
  count: number;
  id: string;
  /** Display names, as tokens. Synonyms are matched through the synonym table only. */
  names: string[][];
}

/** First cut ordering among equal scores (topic-first grouping is second cut, concept-live I.10). */
const TYPE_ORDER: Record<DictKey, number> = { occasion: 0, series: 1, topic: 2, work: 3, person: 4, concept: 5 };
/** At most this many suggestions of one kind. */
const PER_TYPE = 3;

const KINDS: readonly QuickEntityKind[] = ["topic", "concept", "person", "work"];

/** The quick index's entities, read defensively (data shape may change; a bad row is skipped). */
export function readEntities(file: QuickIndexFile): QuickEntity[] {
  const raw: unknown = (file as { entities?: unknown }).entities;
  if (!Array.isArray(raw)) return [];
  const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
  const out: QuickEntity[] = [];
  for (const e of raw as unknown[]) {
    if (typeof e !== "object" || e === null) continue;
    const r = e as Record<string, unknown>;
    const kind = r["kind"];
    const id = r["id"];
    const labels = (typeof r["labels"] === "object" && r["labels"] !== null ? r["labels"] : {}) as Record<string, unknown>;
    if (typeof kind !== "string" || !(KINDS as readonly string[]).includes(kind) || typeof id !== "string" || id === "") continue;
    const l = byUiLang((lang) => str(labels[lang]));
    if (UI_LANGS.every((lang) => l[lang] === null)) continue;
    const synonyms = Array.isArray(r["synonyms"]) ? (r["synonyms"] as unknown[]).filter((s): s is string => typeof s === "string") : [];
    const count = typeof r["count"] === "number" && Number.isFinite(r["count"]) ? r["count"] : 0;
    if (count <= 0) continue;
    out.push({ kind: kind as QuickEntityKind, id, labels: l, synonyms, count });
  }
  return out;
}

function dictionary(entities: readonly QuickEntity[], facets: FacetsFile | null): DictEntry[] {
  const out: DictEntry[] = [];
  if (facets) {
    const add = (type: FacetSuggestionType, table: Record<string, { label: FacetLabel; count: number }>) => {
      for (const [key, v] of Object.entries(table)) {
        out.push({ key: type, id: key, count: v.count, sg: { type, key, label: v.label, count: v.count }, names: nameForms(labelNames(v.label)) });
      }
    };
    add("occasion", facets.occasion);
    add("series", facets.series);
  }
  for (const e of entities) {
    out.push({
      key: e.kind,
      id: e.id,
      count: e.count,
      sg: { type: "entity", kind: e.kind, id: e.id, labels: e.labels, count: e.count },
      names: nameForms(entityLabelNames(e.labels)),
    });
  }
  return out;
}

/** Occasion keys from the normalize parsha/zman tables match `facets.occasion` keys (catalog keys). */
const OCCASION_EXPANSIONS = new Set(["parsha", "occasion"]);

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
    const bare = w.replace(/["'׳״]/gu, "");
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

/** The parts of a series file for "<series> n": the part covering perek n, and part number n. */
export function seriesPartSuggestions(file: SeriesFile, target: SeriesTarget): Suggestion[] {
  const parts = [...file.parts].sort(
    (a, b) => (a.order ?? 1e9) - (b.order ?? 1e9) || (a.shiurId < b.shiurId ? -1 : a.shiurId > b.shiurId ? 1 : 0),
  );
  const out: Suggestion[] = [];
  const base = { type: "series-part" as const, seriesKey: target.seriesKey, label: target.label, n: target.n };
  const byPerek = parts.find((p) => perekNumbers(p.perek).includes(target.n));
  if (byPerek) out.push({ ...base, how: "perek", shiurId: byPerek.shiurId });
  const byOrder = parts.find((p) => p.order === target.n);
  if (byOrder) out.push({ ...base, how: "part", shiurId: byOrder.shiurId });
  return out;
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
  const { ui, facets } = inputs;
  const index = loadShipped(inputs.quick);
  const entities = readEntities(inputs.quick);
  const byKey = new Map(entities.map((e) => [`${e.kind}:${e.id}`, e]));
  // The clean synonym table: display-field terms only (D1: the default never takes ASR variants).
  // No option object is passed: the policy key would otherwise land in the client bundle, where
  // the guard post-pass rightly flags it as a forbidden key.
  const table: SynonymTable = buildSynonymTable(entities);
  const dict = dictionary(entities, facets);
  const normalize = (q: string) => normalizeQuery(q, table);

  function shiurs(q: string, limit = 20): ShiurHit[] {
    const query = quickQuery(normalize(q));
    if (!query) return [];
    const hits: SearchResult[] = index.search(query);
    return hits.slice(0, limit).map((h) => {
      const fields = [...new Set(Object.values(h.match).flat())].filter((f): f is QuickField =>
        (QUICK_FIELDS as readonly string[]).includes(f),
      );
      fields.sort((a, b) => QUICK_FIELDS.indexOf(a) - QUICK_FIELDS.indexOf(b));
      const lang: unknown = h["lang"];
      return {
        shiurId: String(h.id),
        title: typeof h["name"] === "string" ? h["name"] : String(h.id),
        lang: lang === "en" || lang === "yi" ? lang : null,
        fields,
        score: h.score,
      };
    });
  }

  function dictSuggestions(nq: NormalizedQuery): Suggestion[] {
    const boost = new Map<string, number>();
    const bump = (k: string, s: number) => boost.set(k, Math.max(boost.get(k) ?? 0, s));
    for (const x of nq.expansions) if (OCCASION_EXPANSIONS.has(x.kind)) bump(`occasion:${x.key}`, 2.5);
    // A synonym-table match suggests its entity only when it names the whole query ("hester", "the
    // besht"), not one word of a longer one ("Eliyahu Shalom" is not Eliyahu HaNavi).
    const whole = nq.folded === "" ? 0 : nq.folded.split(" ").length;
    for (const x of nq.entities) if (x.span[0] === 0 && x.span[1] === whole) bump(`${x.kind}:${x.id}`, x.match === "exact" ? 2.5 : 2);
    const alts = queryForms(nq.raw, nq);
    const scored: { e: DictEntry; s: number }[] = [];
    for (const e of dict) {
      let s = boost.get(`${e.key}:${e.id}`) ?? 0;
      for (const terms of alts) for (const name of e.names) s = Math.max(s, nameScore(name, terms));
      if (s > 0) scored.push({ e, s });
    }
    scored.sort((a, b) => b.s - a.s || TYPE_ORDER[a.e.key] - TYPE_ORDER[b.e.key] || b.e.count - a.e.count || (a.e.id < b.e.id ? -1 : 1));
    const perType = new Map<DictKey, number>();
    const out: Suggestion[] = [];
    for (const { e } of scored) {
      const n = perType.get(e.key) ?? 0;
      if (n >= PER_TYPE) continue;
      perType.set(e.key, n + 1);
      out.push(e.sg);
    }
    return out;
  }

  function seriesTargets(q: string): SeriesTarget[] {
    const tail = trailingNumber(q);
    if (!tail || !facets) return [];
    const alts = queryForms(tail.rest, normalizeQuery(tail.rest));
    const out: SeriesTarget[] = [];
    for (const [key, v] of Object.entries(facets.series)) {
      const names = nameForms(labelNames(v.label));
      if (alts.some((terms) => names.some((name) => nameScore(name, terms) > 0))) out.push({ seriesKey: key, label: v.label, lang: v.lang, n: tail.n });
    }
    // The UI language's own series first.
    return out.sort((a, b) => (a.lang === ui ? 0 : 1) - (b.lang === ui ? 0 : 1));
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
    return [...years(raw), ...dictSuggestions(normalize(raw))].slice(0, limit);
  }

  return {
    ui,
    suggest,
    shiurs,
    seriesTargets,
    entity: (kind, id) => byKey.get(`${kind}:${id}`),
    normalize,
  };
}
