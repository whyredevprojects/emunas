/**
 * Rows for "Continue" (concept-live §5.1) without a corpus-wide file (corpus-wave-plan §4, C1.7):
 * the heard shiurim's own files, then, per series in progress, the parts after the furthest heard
 * one (`related.next`), loaded until a part that is not finished. Only runs when the personal store
 * has progress, so a first visit loads nothing here.
 */
import { MAX_CONTINUE, MAX_NEXT_HOPS, type ContinueRow } from "./model.ts";
import type { ProgressRecord } from "./personal.ts";
import { loadShiur, type ShiurFile } from "./live-data.ts";

/** The row Continue shows for a shiur file. */
export function continueRowOf(s: ShiurFile): ContinueRow {
  const ol = s.notes?.summary.oneLiner ?? null;
  return {
    id: s.id,
    lang: s.lang,
    title: s.catalog.titleOriginal,
    oneLiner: ol,
    duration: s.duration,
    years: [...s.years],
    status: s.status,
    series: s.series ? { id: s.series.id, order: s.series.order } : null,
    next: s.series ? s.related.next : null,
  };
}

/** How many of the most recent progress records are looked at. */
export const CONTINUE_LOOKBACK = 3 * MAX_CONTINUE;

export async function loadContinueRows(
  progress: readonly ProgressRecord[],
  load: (id: string) => Promise<ShiurFile> = (id) => loadShiur(id),
): Promise<Map<string, ContinueRow>> {
  const rows = new Map<string, ContinueRow>();
  const get = async (id: string): Promise<ContinueRow | null> => {
    const hit = rows.get(id);
    if (hit) return hit;
    try {
      const r = continueRowOf(await load(id));
      rows.set(id, r);
      return r;
    } catch {
      return null; // a missing file just leaves the item out
    }
  };
  const recent = [...progress]
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))
    .slice(0, CONTINUE_LOOKBACK);
  await Promise.all(recent.map((p) => get(p.shiurId)));
  const done = new Set(progress.filter((p) => p.completed).map((p) => p.shiurId));
  const furthest = new Map<string, ContinueRow>();
  for (const r of rows.values()) {
    if (!r.series) continue;
    const prev = furthest.get(r.series.id);
    if (!prev || (r.series.order ?? -Infinity) > (prev.series?.order ?? -Infinity)) furthest.set(r.series.id, r);
  }
  await Promise.all(
    [...furthest.values()].map(async (r) => {
      let id = r.next;
      for (let hop = 0; id !== null && hop <= MAX_NEXT_HOPS; hop++) {
        const next = await get(id);
        if (!next || !done.has(id)) return;
        id = next.next;
      }
    }),
  );
  return rows;
}
