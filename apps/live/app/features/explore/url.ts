/**
 * Explore's URL state (tech-live §1: `/:ui/explore?…facets…&lens=…&unit=…`). Everything the page
 * shows is in the query string, so a shared link reproduces the view and back/forward walk through
 * filter changes.
 *
 * - Facet selections are repeated parameters (`p=a&p=b`), sorted and de-duplicated, so a key may
 *   contain any character. Fixed vocabularies (kind, duration, …) drop unknown values.
 * - The shiur-language facet *is* the shell's audio filter (`audio=yi|en`, `settings.ts`), so the
 *   choice made in Explore carries over to Today and the rest of the site.
 * - Defaults are omitted (`lens=list`, `unit=shiurim`, `sort=catalog`, all moment kinds).
 * - Parameters Explore does not own (`read`, …) are left untouched by `exploreToQuery`.
 *
 * `parseExploreQuery(exploreToQuery(s))` equals `s` for every normalized state, and
 * `exploreToQuery(parseExploreQuery(q))` is the canonical form of `q` (tested).
 */
import type { Category } from "@emunas/corpus/public";
import type { EntityKind, MomentKind } from "./live-data.ts";
import { DURATION_BUCKETS, SET_FACETS, type ExploreFilters, type SetFacet, type YearFilter } from "./model.ts";

export const LENSES = ["list", "luach", "years", "connections"] as const;
export type Lens = (typeof LENSES)[number];

export const UNITS = ["shiurim", "moments"] as const;
export type Unit = (typeof UNITS)[number];

export const SORTS = ["catalog", "year"] as const;
export type Sort = (typeof SORTS)[number];

/** Moment kinds in display order. */
export const MOMENT_KINDS: readonly MomentKind[] = ["s", "i", "st", "q", "tk", "kp"];

export const CATEGORIES: readonly Category[] = ["parsha", "zman", "set", "shonos", "simcha", "purim", "misc", "current"];

export interface ConnectionsCenter {
  kind: EntityKind;
  key: string;
}

export interface ExploreState {
  filters: ExploreFilters;
  lens: Lens;
  unit: Unit;
  sort: Sort;
  /** Moment kinds shown in the moments unit; empty = all. */
  kinds: readonly MomentKind[];
  /** The entity the Connections lens is centred on. */
  center: ConnectionsCenter | null;
}

export const DEFAULT_STATE: ExploreState = {
  filters: { sets: {}, year: null },
  lens: "list",
  unit: "shiurim",
  sort: "catalog",
  kinds: [],
  center: null,
};

/** Query parameter per facet (`lang` is the shell's `audio`). */
export const FACET_PARAM: Readonly<Record<SetFacet, string>> = {
  lang: "audio",
  category: "kind",
  occasion: "o",
  series: "series",
  work: "w",
  person: "p",
  concept: "c",
  duration: "dur",
  stories: "stories",
  ai: "ai",
  catalogued: "src",
};

/** Allowed values for facets with a fixed vocabulary; data-keyed facets accept any non-empty value. */
const VOCAB: Partial<Record<SetFacet, readonly string[]>> = {
  lang: ["en", "yi"],
  category: CATEGORIES,
  duration: DURATION_BUCKETS,
  stories: ["yes", "no"],
  ai: ["full", "catalog-only"],
  catalogued: ["catalogued", "uncatalogued"],
};

const EXPLORE_PARAMS = [...Object.values(FACET_PARAM), "y", "lens", "unit", "sort", "mk", "center"];

function oneOf<T extends string>(list: readonly T[], v: string | null, fallback: T): T {
  return v !== null && (list as readonly string[]).includes(v) ? (v as T) : fallback;
}

function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}

/** Accepts `5730`, `5730-5740` (either order) or `undated`. */
export function parseYear(v: string | null): YearFilter | null {
  if (v === null) return null;
  if (v === "undated") return { kind: "undated" };
  const m = /^(\d{4})(?:-(\d{4}))?$/u.exec(v);
  if (!m) return null;
  const a = Number(m[1]);
  const b = m[2] === undefined ? a : Number(m[2]);
  return { kind: "range", from: Math.min(a, b), to: Math.max(a, b) };
}

export function formatYear(y: YearFilter): string {
  if (y.kind === "undated") return "undated";
  return y.from === y.to ? String(y.from) : `${y.from}-${y.to}`;
}

const ENTITY_KINDS: readonly EntityKind[] = ["p", "c", "o"];

export function parseCenter(v: string | null): ConnectionsCenter | null {
  if (v === null) return null;
  const i = v.indexOf(":");
  if (i < 0) return null;
  const kind = v.slice(0, i);
  const key = v.slice(i + 1);
  if (!(ENTITY_KINDS as readonly string[]).includes(kind) || key === "") return null;
  return { kind: kind as EntityKind, key };
}

function parseSet(q: URLSearchParams, facet: SetFacet): string[] {
  const param = FACET_PARAM[facet];
  if (facet === "lang") {
    // Same rules as the shell (`parseSettingsQuery`): `audio=yi,en` means both, i.e. no filter.
    const raw = q.get(param);
    if (raw === null) return [];
    const langs = sortedUnique(raw.split(",").map((s) => s.trim()).filter((s) => s === "en" || s === "yi"));
    return langs.length === 1 ? langs : [];
  }
  const vocab = VOCAB[facet];
  const values = q.getAll(param).filter((v) => v !== "" && (vocab === undefined || vocab.includes(v)));
  return sortedUnique(values);
}

export function parseExploreQuery(search: string | URLSearchParams): ExploreState {
  const q = typeof search === "string" ? new URLSearchParams(search) : search;
  const sets: Partial<Record<SetFacet, readonly string[]>> = {};
  for (const facet of SET_FACETS) {
    const v = parseSet(q, facet);
    if (v.length > 0) sets[facet] = v;
  }
  const kinds = sortedKinds(q.getAll("mk").filter((k): k is MomentKind => (MOMENT_KINDS as readonly string[]).includes(k)));
  return {
    filters: { sets, year: parseYear(q.get("y")) },
    lens: oneOf(LENSES, q.get("lens"), "list"),
    unit: oneOf(UNITS, q.get("unit"), "shiurim"),
    sort: oneOf(SORTS, q.get("sort"), "catalog"),
    // all kinds selected = no kind filter
    kinds: kinds.length === MOMENT_KINDS.length ? [] : kinds,
    center: parseCenter(q.get("center")),
  };
}

function sortedKinds(kinds: Iterable<MomentKind>): MomentKind[] {
  const set = new Set(kinds);
  return MOMENT_KINDS.filter((k) => set.has(k));
}

/**
 * Writes the state into a copy of `base`, replacing every Explore parameter and keeping the rest.
 * Values are canonicalized (sorted, de-duplicated) on the way out.
 */
export function exploreToQuery(state: ExploreState, base: URLSearchParams = new URLSearchParams()): URLSearchParams {
  const q = new URLSearchParams(base);
  for (const p of EXPLORE_PARAMS) q.delete(p);
  const add = (k: string, v: string) => q.append(k, v);
  for (const facet of SET_FACETS) {
    const values = sortedUnique(state.filters.sets[facet] ?? []);
    if (facet === "lang") {
      if (values.length === 1) add(FACET_PARAM.lang, values[0]!);
      continue;
    }
    for (const v of values) add(FACET_PARAM[facet], v);
  }
  if (state.filters.year) add("y", formatYear(state.filters.year));
  if (state.lens !== "list") add("lens", state.lens);
  if (state.unit !== "shiurim") add("unit", state.unit);
  if (state.sort !== "catalog") add("sort", state.sort);
  const kinds = sortedKinds(state.kinds);
  if (kinds.length > 0 && kinds.length < MOMENT_KINDS.length) for (const k of kinds) add("mk", k);
  if (state.center) add("center", `${state.center.kind}:${state.center.key}`);
  return q;
}

/** `/:ui/explore` with a state (for links from entity pages, e.g. the Connections lens). */
export function exploreHref(ui: string, state: Partial<ExploreState> = {}): string {
  const q = exploreToQuery({ ...DEFAULT_STATE, ...state }).toString();
  return `/${ui}/explore${q === "" ? "" : `?${q}`}`;
}

/** The Connections lens centred on an entity (entity pages link here, concept-live §5.7). */
export function connectionsHref(ui: string, kind: EntityKind, key: string): string {
  return exploreHref(ui, { lens: "connections", center: { kind, key } });
}

/** A copy of the filters with one facet's selection replaced (empty removes it). */
export function withSet(filters: ExploreFilters, facet: SetFacet, values: readonly string[]): ExploreFilters {
  const sets = { ...filters.sets };
  if (values.length === 0) delete sets[facet];
  else sets[facet] = sortedUnique(values);
  return { ...filters, sets };
}

/** Toggles one value in a facet. */
export function toggleValue(filters: ExploreFilters, facet: SetFacet, value: string): ExploreFilters {
  const cur = filters.sets[facet] ?? [];
  return withSet(filters, facet, cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value]);
}
