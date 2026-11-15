/**
 * Entity pages (concept-live §5.7, tech-live W14b): pure functions over `entity/{p,c,o}/<key>.json` and
 * `corpus.json`.
 *
 * One template for person, concept and occasion: name, counts, a year histogram, entities that occur
 * with it, and its moments grouped by shiur. People and concepts are the corpus layer's merged
 * entities (C2.6); a person's page is split three ways (`personGroups`).
 */
import type { CorpusFile, CorpusRow, EntityFile, MomentRef, PersonDetail, PersonStory } from "./live-data.ts";

const rowIndexes = new WeakMap<CorpusFile, Map<string, CorpusRow>>();

/** `corpus.json` rows by shiur id (cached per file object). */
export function rowsById(corpus: CorpusFile): Map<string, CorpusRow> {
  let m = rowIndexes.get(corpus);
  if (!m) {
    m = new Map(corpus.shiurim.map((r) => [r.id, r]));
    rowIndexes.set(corpus, m);
  }
  return m;
}

const firstYear = (r: Pick<CorpusRow, "years">): number => (r.years.length ? Math.min(...r.years) : Number.POSITIVE_INFINITY);

/** Rows by Hebrew year, undated last; ties keep their input order. */
export function byYear<T extends Pick<CorpusRow, "years">>(rows: readonly T[]): T[] {
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => firstYear(a.r) - firstYear(b.r) || a.i - b.i)
    .map((x) => x.r);
}

export interface PersonGroups {
  /** Shiurim citing his seforim (or a work in their family). */
  cited: CorpusRow[];
  /** Merged stories naming him, most told first. */
  stories: PersonStory[];
  /** Shiurim that list him among the people discussed. */
  discussed: CorpusRow[];
}

/**
 * The three groups of a person page (concept-live-corpus C.5): cited as a source, appears in
 * stories, discussed. Everything comes from the person's entity file (corpus-layer recounts over the
 * visible shiurim); `corpus.json` supplies the rows. A shiur id with no row is dropped.
 */
export function personGroups(entity: Pick<EntityFile, "shiurIds" | "person">, corpus: CorpusFile): PersonGroups {
  const rows = rowsById(corpus);
  const toRows = (ids: readonly string[]) => byYear(ids.flatMap((id) => rows.get(id) ?? []));
  return {
    cited: toRows(entity.person?.cited ?? []),
    stories: [...(entity.person?.stories ?? [])],
    discussed: toRows(entity.shiurIds),
  };
}

/** The person's names as the data gives them, each once, in the order Hebrew, English, Yiddish. */
export function personNames(names: { he: string; en: string; yi: string }): { lang: "he" | "en" | "yi"; text: string }[] {
  const out: { lang: "he" | "en" | "yi"; text: string }[] = [];
  for (const lang of ["he", "en", "yi"] as const) {
    const text = names[lang].trim();
    if (text !== "" && !out.some((x) => x.text === text)) out.push({ lang, text });
  }
  return out;
}

/** "Also called": display aliases that are not already one of the names. */
export function alsoCalled(person: Pick<PersonDetail, "names" | "aliases">): string[] {
  const names = new Set(Object.values(person.names).map((n) => n.trim()));
  return [...new Set(person.aliases.map((a) => a.trim()))].filter((a) => a !== "" && !names.has(a));
}

export interface ShiurMoments {
  shiurId: string;
  moments: MomentRef[];
}

/** Moments grouped by shiur, in the order the shiurim first appear. */
export function groupByShiur(moments: readonly MomentRef[]): ShiurMoments[] {
  const out: ShiurMoments[] = [];
  const at = new Map<string, ShiurMoments>();
  for (const m of moments) {
    let g = at.get(m.shiurId);
    if (!g) {
      g = { shiurId: m.shiurId, moments: [] };
      at.set(m.shiurId, g);
      out.push(g);
    }
    g.moments.push(m);
  }
  return out;
}

export interface YearBar {
  year: number;
  count: number;
}

export interface YearHistogram {
  bars: YearBar[];
  unknown: number;
  max: number;
}

/** The entity's `years` record as sorted bars plus the undated count. */
export function yearHistogram(years: Readonly<Record<string, number>>): YearHistogram {
  const bars: YearBar[] = [];
  let unknown = 0;
  for (const [k, n] of Object.entries(years)) {
    const y = Number(k);
    if (k === "unknown" || !Number.isInteger(y)) unknown += n;
    else bars.push({ year: y, count: n });
  }
  bars.sort((a, b) => a.year - b.year);
  const max = Math.max(0, unknown, ...bars.map((b) => b.count));
  return { bars, unknown, max };
}

/** Queue input for timed moments (moments without a time cannot be played and are left out). */
export function queueItems(
  moments: readonly { id: string; shiurId: string; t: number | null; end: number | null }[],
): { shiurId: string; start: number; end: number | null; momentId: string }[] {
  return moments.flatMap((m) => (m.t === null ? [] : [{ shiurId: m.shiurId, start: m.t, end: m.end, momentId: m.id }]));
}
