/**
 * Which corpus entities have a page on which site (corpus-wave-plan §3.5, §2 D8, D10).
 *
 * The answer comes from the layer's page flags (`LinkData.hasPage`), which C1.2 recomputes from
 * the visible set and the policy thresholds. Without the flags an entry is assumed to have a
 * page.
 */
import type { CorpusKind, LinkData, Route, Site } from "./types.ts";

/**
 * Whether `site` has a page for corpus entity `kind`/`id`. Quiet never has a thread page in
 * this cut. Layer flags win; otherwise true.
 */
export function hasPageOn(site: Site, kind: CorpusKind, id: string, data: LinkData = {}): boolean {
  if (site === "quiet" && kind === "thread") return false;
  return data.hasPage?.(site, kind, id) ?? true;
}

export type EntryRoute = Extract<Route, { kind: "entry" }>;

/**
 * Follows a concept merged into a topic (`conceptTopic`) to that topic: one inyan, one entry
 * (Quiet C4.1.6, Live E.1). Every other route is returned unchanged.
 */
export function resolveEntry(route: EntryRoute, data: LinkData = {}): EntryRoute {
  if (route.entry !== "concept") return route;
  const topic = data.conceptTopic?.(route.id);
  if (topic === undefined || topic === "") return route;
  return { kind: "entry", ed: route.ed, entry: "topic", id: topic };
}

/** `all/` continuation pages exist on Quiet for topics and people only. */
export function allowsAll(kind: CorpusKind): boolean {
  return kind === "topic" || kind === "person";
}
