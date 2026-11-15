/**
 * Corpus-layer helpers (corpus-wave-plan §3.5): page lookups from the layer's page flags, and
 * links that may not exist on a site.
 *
 * The layer shapes are taken structurally (no import of `@emunas/corpus`, so this package stays
 * dependency-free and browser-safe); `test/layer-types.test.ts` checks the real layer types fit.
 */
import { formatLive } from "./live.ts";
import { hasPageOn, resolveEntry } from "./pages.ts";
import { formatQuiet } from "./quiet.ts";
import type { CorpusKind, LinkData, Route, Site } from "./types.ts";

// ---------------------------------------------------------------- page lookups from the layer

interface Flags {
  readonly quiet?: boolean;
  readonly live?: boolean;
}

interface WithPages {
  readonly id: string;
  readonly pages?: Flags | null;
}

/** The parts of `.corpus/layer/*.json` that page lookups read. Every file is optional. */
export interface LayerPagesInput {
  readonly topics?: { readonly tree: readonly WithPages[] } | null;
  readonly concepts?: { readonly concepts: readonly (WithPages & { readonly mergedIntoTopic?: string | null })[] } | null;
  readonly people?: { readonly people: readonly WithPages[] } | null;
  readonly works?: { readonly works: readonly WithPages[] } | null;
  readonly stories?: { readonly stories: readonly WithPages[] } | null;
  readonly threads?: { readonly threads: readonly { readonly id: string; readonly page?: boolean }[] } | null;
}

export type LayerLinkData = Required<Pick<LinkData, "hasPage" | "conceptTopic">>;

function flagMap(rows: readonly WithPages[] | undefined): Map<string, Flags> | null {
  if (!Array.isArray(rows)) return null;
  const out = new Map<string, Flags>();
  for (const r of rows) if (r && typeof r.id === "string") out.set(r.id, r.pages ?? {});
  return out;
}

/**
 * `hasPage` and `conceptTopic` from the layer files. A kind whose file is absent answers
 * `undefined` (not known: the formatters fall back); an id missing from a present file has no
 * page. Flags are read defensively: a missing flag is false.
 */
export function pageLookupFromLayer(layer: LayerPagesInput): LayerLinkData {
  const maps: Readonly<Record<Exclude<CorpusKind, "thread">, Map<string, Flags> | null>> = {
    topic: flagMap(layer.topics?.tree),
    concept: flagMap(layer.concepts?.concepts),
    person: flagMap(layer.people?.people),
    work: flagMap(layer.works?.works),
    story: flagMap(layer.stories?.stories),
  };
  let threads: Map<string, boolean> | null = null;
  if (Array.isArray(layer.threads?.threads)) {
    threads = new Map();
    for (const t of layer.threads.threads) if (t && typeof t.id === "string") threads.set(t.id, t.page === true);
  }
  const merged = new Map<string, string>();
  for (const c of layer.concepts?.concepts ?? []) {
    if (c && typeof c.id === "string" && typeof c.mergedIntoTopic === "string" && c.mergedIntoTopic !== "") {
      merged.set(c.id, c.mergedIntoTopic);
    }
  }
  return {
    hasPage(site, kind, id) {
      if (kind === "thread") {
        if (site === "quiet") return false;
        return threads === null ? undefined : threads.get(id) === true;
      }
      const map = maps[kind];
      if (map === null) return undefined;
      return map.get(id)?.[site] === true;
    },
    conceptTopic: (id) => merged.get(id),
  };
}

// ---------------------------------------------------------------- links that may not exist

/**
 * A same-site path for `route`, or null when the route is a corpus entry without a page on that
 * site. Quiet never returns null (an entry without a page links to its index anchor, a thread to
 * the edition home's `#indexes`); Live returns null for an entry below its threshold (no link).
 */
export function hrefFor(site: Site, route: Route, data: LinkData = {}): string | null {
  if (site === "quiet") return formatQuiet(route, data);
  if (route.kind === "entry") {
    const r = resolveEntry(route, data);
    if (!hasPageOn("live", r.entry, r.id, data)) return null;
  }
  return formatLive(route, data);
}
