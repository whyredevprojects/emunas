/**
 * Corpus-layer helpers (corpus-wave-plan §3.5, §5): page lookups from the layer's page flags,
 * links that may not exist on a site, and the old addresses that must keep resolving.
 *
 * The layer shapes are taken structurally (no import of `@emunas/corpus`, so this package stays
 * dependency-free and browser-safe); `test/layer-types.test.ts` checks the real layer types fit.
 */
import { formatLive } from "./live.ts";
import { hasPageOn, resolveEntry, type EntryRoute } from "./pages.ts";
import { formatQuiet } from "./quiet.ts";
import { EDS, type CorpusKind, type Ed, type IndexName, type LegacyKind, type LinkData, type Route, type Site } from "./types.ts";
import { seg } from "./url.ts";

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

// ---------------------------------------------------------------- old addresses

/** One old address of a legacy entity. */
export interface LegacyPath {
  readonly site: Site;
  readonly ed: Ed;
  /** Root-relative path, percent-encoded as it was served. */
  readonly path: string;
  /** Live works only: `path/{chapter}` was an address of the same work too. */
  readonly chapters?: true;
}

const QUIET_LEGACY_DIR: Readonly<Record<LegacyKind, string>> = { person: "people", work: "sources", concept: "inyanim" };
const LIVE_LEGACY_SEG: Readonly<Record<LegacyKind, string>> = { person: "p", work: "seforim", concept: "c" };

function checkKey(oldKey: string): void {
  if (typeof oldKey !== "string" || oldKey === "" || oldKey.includes("/")) {
    throw new TypeError(`@emunas/links: bad legacy key: ${JSON.stringify(oldKey)}`);
  }
}

/**
 * Every address an old site key had, in both editions: Quiet `/{ed}/people/{key}/`,
 * `/{ed}/sources/{key}/`, `/{ed}/inyanim/{key}/`; Live `/{ui}/p/{key}`, `/{ui}/c/{key}`,
 * `/{ui}/seforim/{key}` (+ `/{chapter}`).
 *
 * An old Quiet `/inyanim/{key}/` whose key is a topic id with a Quiet page is that topic's page
 * now (one inyan, one entry: Quiet C4.1.6), so it is left out: it needs no redirect.
 */
export function legacyPaths(site: Site, kind: LegacyKind, oldKey: string, data: LinkData = {}): LegacyPath[] {
  checkKey(oldKey);
  const key = seg(oldKey);
  if (site === "quiet") {
    if (kind === "concept" && data.hasPage?.("quiet", "topic", oldKey) === true) return [];
    return EDS.map((ed) => ({ site, ed, path: `/${ed}/${QUIET_LEGACY_DIR[kind]}/${key}/` }));
  }
  return EDS.map((ed) =>
    kind === "work"
      ? { site, ed, path: `/${ed}/${LIVE_LEGACY_SEG[kind]}/${key}`, chapters: true as const }
      : { site, ed, path: `/${ed}/${LIVE_LEGACY_SEG[kind]}/${key}` },
  );
}

/** A redirect from an old or retired address to where it lives now. */
export interface RedirectPair {
  readonly site: Site;
  readonly ed: Ed;
  readonly from: string;
  readonly to: string;
  /** Live works only: `from/{chapter}` → `to/{chapter}`. */
  readonly chapters?: true;
}

/** The layer's `redirects.json` legacy row, structurally. */
export interface LegacyRedirectInput {
  readonly kind: LegacyKind;
  readonly oldKey: string;
  /** Whether the old key had a page; a Quiet key without one had only an index anchor. */
  readonly hadPage?: { readonly quiet?: boolean; readonly live?: boolean } | null;
  readonly target: { readonly kind: CorpusKind; readonly id: string } | null;
}

const LEGACY_INDEX: Readonly<Record<LegacyKind, IndexName>> = { person: "people", work: "sources", concept: "glossary" };

function indexPath(site: Site, ed: Ed, index: IndexName): string {
  const r: Route = { kind: "index", ed, index };
  return site === "quiet" ? formatQuiet(r) : formatLive(r);
}

function entryTarget(site: Site, ed: Ed, kind: LegacyKind, target: LegacyRedirectInput["target"], data: LinkData): string {
  if (target) {
    const href = hrefFor(site, { kind: "entry", ed, entry: target.kind, id: target.id }, data);
    if (href !== null) return href;
  }
  // Nothing matched, or no page on this site: the index page (Live: its closest listing).
  return indexPath(site, ed, LEGACY_INDEX[kind]);
}

/**
 * Redirects for one legacy row (`.corpus/layer/redirects.json` `legacy[]`): each old address
 * (`legacyPaths`) to the merged entity's address, or to the index when nothing matched. Pairs
 * whose old address is the new one (same key, same shape) are dropped. A Quiet key with
 * `hadPage.quiet === false` gives none: it only ever had an index anchor, which a server cannot
 * redirect. Live served every key through its SPA fallback, so Live rows are always mapped.
 */
export function legacyRedirects(site: Site, row: LegacyRedirectInput, data: LinkData = {}): RedirectPair[] {
  if (site === "quiet" && row.hadPage?.quiet === false) return [];
  const out: RedirectPair[] = [];
  for (const p of legacyPaths(site, row.kind, row.oldKey, data)) {
    const to = entryTarget(site, p.ed, row.kind, row.target, data);
    if (to === p.path) continue;
    out.push(p.chapters ? { site, ed: p.ed, from: p.path, to, chapters: true } : { site, ed: p.ed, from: p.path, to });
  }
  return out;
}

/**
 * Redirects for a retired corpus id (`redirects.json` `corpus`, chains already resolved by the
 * layer): the retired id's address to the live id's, in both editions. Quiet threads have no
 * address, so they give none.
 */
export function corpusRedirects(site: Site, kind: CorpusKind, fromId: string, toId: string, data: LinkData = {}): RedirectPair[] {
  checkKey(fromId);
  checkKey(toId);
  if (site === "quiet" && kind === "thread") return [];
  const out: RedirectPair[] = [];
  for (const ed of EDS) {
    const old: EntryRoute = { kind: "entry", ed, entry: kind, id: fromId };
    // The old address as it was: a page path, without data (the retired id has no flags).
    const from = site === "quiet" ? formatQuiet(old) : formatLive(old);
    const to = hrefFor(site, { kind: "entry", ed, entry: kind, id: toId }, data) ?? indexPath(site, ed, kindIndex(kind));
    if (from !== to) out.push({ site, ed, from, to });
  }
  return out;
}

function kindIndex(kind: CorpusKind): IndexName {
  switch (kind) {
    case "topic":
      return "topics";
    case "concept":
      return "glossary";
    case "person":
      return "people";
    case "work":
      return "sources";
    case "story":
      return "stories";
    case "thread":
      return "topics";
  }
}
