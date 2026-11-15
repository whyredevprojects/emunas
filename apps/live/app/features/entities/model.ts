/**
 * Entity pages (concept-live §5.7, tech-live W14b): pure functions over `entity/{p,c,o}/<key>.json`,
 * `corpus.json` and `stories.json`.
 *
 * One template for person, concept and occasion: name, counts, a year histogram, entities that occur
 * with it, and its moments grouped by shiur. A person's page is split three ways:
 * - cited as a source: shiurim that cite the person's own sefer (the work with the person's key, e.g.
 *   Rashi, the Chasam Sofer, the Bnei Yissaschar);
 * - in stories: the stories whose people include the person (`stories[].peopleKeys`);
 * - discussed: shiurim that list the person among the people discussed (`entities.people`).
 */
import type { CorpusFile, CorpusRow, EntityFile, MomentRef, StoryRow } from "./live-data.ts";

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

export interface PersonSplit {
  cited: CorpusRow[];
  inStories: StoryRow[];
  discussed: CorpusRow[];
}

/** Splits a person's appearances into cited / in stories / discussed (see the module comment). */
export function personSplit(
  key: string,
  entity: Pick<EntityFile, "shiurIds">,
  corpus: CorpusFile,
  stories: readonly StoryRow[],
): PersonSplit {
  const rows = rowsById(corpus);
  const cited = byYear(corpus.shiurim.filter((r) => r.entities.works.includes(key)));
  const inStories = stories.filter((s) => s.peopleKeys.includes(key));
  const storyShiurim = new Set(inStories.map((s) => s.shiurId));
  const discussed = entity.shiurIds.flatMap((id) => {
    const r = rows.get(id);
    if (!r) return [];
    // Listed among the people; or in the entity's shiurim for no other visible reason (never dropped).
    return r.entities.people.includes(key) || !storyShiurim.has(id) ? [r] : [];
  });
  return { cited, inStories, discussed };
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
