/**
 * Lazy loading of the client-side engine (tech-live §4.4: "on focus, lazy-load quick-index.<ui>.json
 * and the entity dictionary"). The engine module, MiniSearch and the normalize tables are a separate
 * chunk; the first call starts the downloads in parallel and later calls share the same promise. A
 * failed load is not cached, so the next focus retries.
 *
 * The engine needs `quick-index.<ui>.json` and `facets.json` only. `corpus.json` is never loaded
 * here: the search page loads it itself, on the search route only (corpus-wave-plan §4).
 */
import type { Ed } from "@emunas/corpus/public";
import { loadFacets, loadQuickIndex, loadSeries, type SeriesFile } from "./live-data.ts";
import type { QuickSearch } from "./engine.ts";

const cache = new Map<Ed, Promise<QuickSearch>>();
const seriesCache = new Map<string, Promise<SeriesFile>>();

export function loadQuickSearch(ui: Ed): Promise<QuickSearch> {
  const hit = cache.get(ui);
  if (hit) return hit;
  const p = (async () => {
    const [engine, quick, facets] = await Promise.all([
      import("./engine.ts"),
      loadQuickIndex(ui),
      loadFacets().catch(() => null),
    ]);
    return engine.createQuickSearch({ ui, quick, facets });
  })();
  cache.set(ui, p);
  p.catch(() => cache.delete(ui));
  return p;
}

/** One series file for "Tanya 12" suggestions, fetched once per series (a failure is retried later). */
export function loadSeriesParts(seriesId: string): Promise<SeriesFile> {
  const hit = seriesCache.get(seriesId);
  if (hit) return hit;
  const p = loadSeries(seriesId);
  seriesCache.set(seriesId, p);
  p.catch(() => seriesCache.delete(seriesId));
  return p;
}

/** Tests: forget loaded engines and series files (e.g. after `configureData`). */
export function clearQuickSearch(): void {
  cache.clear();
  seriesCache.clear();
}
