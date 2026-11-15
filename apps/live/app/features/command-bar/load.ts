/**
 * Lazy loading of the client-side engine (tech-live §4.4: "on focus, lazy-load quick-index.<ui>.json
 * and the entity dictionary"). The engine module, MiniSearch and the normalize tables are a separate
 * chunk; the first call starts all downloads in parallel and later calls share the same promise.
 * A failed load is not cached, so the next focus retries.
 */
import type { Ed } from "@emunas/corpus/public";
import { loadCorpus, loadFacets, loadQuickIndex } from "./live-data.ts";
import type { QuickSearch } from "./engine.ts";

const cache = new Map<Ed, Promise<QuickSearch>>();

export function loadQuickSearch(ui: Ed): Promise<QuickSearch> {
  const hit = cache.get(ui);
  if (hit) return hit;
  const p = (async () => {
    const [engine, quick, corpus, facets] = await Promise.all([
      import("./engine.ts"),
      loadQuickIndex(ui).catch(() => null),
      loadCorpus().catch(() => null),
      loadFacets().catch(() => null),
    ]);
    return engine.createQuickSearch({ ui, quick, corpus, facets });
  })();
  cache.set(ui, p);
  p.catch(() => cache.delete(ui));
  return p;
}

/** Tests: forget loaded engines (e.g. after `configureData`). */
export function clearQuickSearch(): void {
  cache.clear();
}
