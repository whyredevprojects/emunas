/** Strict parsing of /api/search and /api/similar query strings. Unknown parameters are rejected. */
import { BadRequest, UNKNOWN_PARAMETER } from "./http.ts";
import { isKind, isLang, MODES, type Kind, type Lang, type Mode } from "./contract.ts";

export const MAX_Q_LENGTH = 200;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 50;
export const MAX_LIST_VALUES = 10;

/** Keys from @emunas/normalize are ASCII slugs; series and category ids follow the same shape. */
const KEY_RE = /^[a-z0-9][a-z0-9-]{0,119}$/;
/** Moment ids: <shiurId>~<kind><idx>[.<n>...][.<lang>] */
const MOMENT_RE = /^[a-z0-9][a-z0-9-]{0,119}~[a-z]{1,3}[0-9]{1,5}(\.[0-9]{1,5}){0,3}(\.(en|yi))?$/;

export interface SearchFilters {
  audio: Lang[];
  kind: Kind[];
  category: string[];
  occasion: string[];
  series: string[];
  work: string[];
  person: string[];
  concept: string[];
  yearFrom: number | null;
  yearTo: number | null;
}

export interface SearchParams {
  q: string;
  ui: Lang;
  mode: Mode;
  limit: number;
  cursor: string | null;
  filters: SearchFilters;
}

const SEARCH_KEYS = new Set([
  "q", "ui", "audio", "kind", "category", "occasion", "series", "yearFrom", "yearTo",
  "work", "person", "concept", "mode", "limit", "cursor",
]);

function single(sp: URLSearchParams, name: string): string | null {
  const all = sp.getAll(name);
  if (all.length > 1) throw new BadRequest(name);
  return all[0] ?? null;
}

function list(sp: URLSearchParams, name: string, valid: (v: string) => boolean): string[] {
  const raw = single(sp, name);
  if (raw === null || raw === "") return [];
  const values = [...new Set(raw.split(",").map((v) => v.trim()).filter((v) => v.length > 0))];
  if (values.length > MAX_LIST_VALUES || !values.every(valid)) throw new BadRequest(name);
  return values.sort();
}

function intParam(sp: URLSearchParams, name: string, min: number, max: number): number | null {
  const raw = single(sp, name);
  if (raw === null || raw === "") return null;
  if (!/^[0-9]{1,6}$/.test(raw)) throw new BadRequest(name);
  const n = Number(raw);
  if (n < min || n > max) throw new BadRequest(name);
  return n;
}

const isKey = (v: string) => KEY_RE.test(v);

export function isMomentId(v: string): boolean {
  return MOMENT_RE.test(v);
}

export function parseSearchParams(sp: URLSearchParams): SearchParams {
  for (const key of sp.keys()) if (!SEARCH_KEYS.has(key)) throw new BadRequest(UNKNOWN_PARAMETER);

  const rawQ = single(sp, "q") ?? "";
  const q = rawQ.normalize("NFC").replace(/\s+/gu, " ").trim();
  if (q.length === 0 || q.length > MAX_Q_LENGTH || /\p{Cc}/u.test(q)) throw new BadRequest("q");

  const ui = single(sp, "ui") ?? "en";
  if (!isLang(ui)) throw new BadRequest("ui");

  const mode = single(sp, "mode") ?? "hybrid";
  if (!(MODES as readonly string[]).includes(mode)) throw new BadRequest("mode");

  const limit = intParam(sp, "limit", 1, MAX_LIMIT) ?? DEFAULT_LIMIT;
  const cursor = single(sp, "cursor");
  if (cursor !== null && !/^[A-Za-z0-9_-]{1,200}$/.test(cursor)) throw new BadRequest("cursor");

  const yearFrom = intParam(sp, "yearFrom", 1, 999_999);
  const yearTo = intParam(sp, "yearTo", 1, 999_999);
  if (yearFrom !== null && yearTo !== null && yearFrom > yearTo) throw new BadRequest("yearTo");

  return {
    q,
    ui,
    mode: mode as Mode,
    limit,
    cursor,
    filters: {
      audio: list(sp, "audio", isLang) as Lang[],
      kind: list(sp, "kind", isKind) as Kind[],
      category: list(sp, "category", isKey),
      occasion: list(sp, "occasion", isKey),
      series: list(sp, "series", isKey),
      work: list(sp, "work", isKey),
      person: list(sp, "person", isKey),
      concept: list(sp, "concept", isKey),
      yearFrom,
      yearTo,
    },
  };
}

export interface SimilarParams {
  moment: string;
  limit: number;
}

export function parseSimilarParams(sp: URLSearchParams): SimilarParams {
  for (const key of sp.keys()) if (key !== "moment" && key !== "limit") throw new BadRequest(UNKNOWN_PARAMETER);
  const moment = single(sp, "moment");
  if (moment === null || !isMomentId(moment)) throw new BadRequest("moment");
  const limit = intParam(sp, "limit", 1, MAX_LIMIT) ?? 10;
  return { moment, limit };
}

/** Canonical string of everything that affects a search result page (cache key part). */
export function canonicalSearchKey(p: SearchParams): string {
  const f = p.filters;
  const parts: [string, string][] = [
    ["q", p.q],
    ["ui", p.ui],
    ["mode", p.mode],
    ["limit", String(p.limit)],
    ["cursor", p.cursor ?? ""],
    ["audio", f.audio.join(",")],
    ["kind", f.kind.join(",")],
    ["category", f.category.join(",")],
    ["occasion", f.occasion.join(",")],
    ["series", f.series.join(",")],
    ["work", f.work.join(",")],
    ["person", f.person.join(",")],
    ["concept", f.concept.join(",")],
    ["yearFrom", f.yearFrom === null ? "" : String(f.yearFrom)],
    ["yearTo", f.yearTo === null ? "" : String(f.yearTo)],
  ];
  return new URLSearchParams(parts).toString();
}
