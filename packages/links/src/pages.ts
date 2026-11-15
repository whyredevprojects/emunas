/**
 * Which corpus entities have a page on which site (corpus-wave-plan §3.5, §2 D8, D10).
 *
 * The answer comes from the layer's page flags (`LinkData.hasPage`), which C1.2 recomputes from
 * the visible set and the policy thresholds. Without the flags (pages that are not on the layer
 * yet) Quiet falls back to the legacy shiur-count thresholds, and anything else is assumed to
 * have a page, so a link degrades to a page that may be thin but never to a guess that 404s on
 * the index.
 */
import type { CorpusKind, EntityKind, LinkData, Route, Site } from "./types.ts";

/** Legacy Quiet thresholds (≥2 shiurim, concepts ≥3; integration-plan §2.2): the fallback only. */
export const ENTITY_PAGE_THRESHOLD: Readonly<Record<EntityKind, number>> = { work: 2, person: 2, concept: 3 };

/** True when Quiet has a page of its own for this entity (unknown count: assume yes). */
export function quietHasEntityPage(entity: EntityKind, count: number | undefined): boolean {
  return count === undefined || count >= ENTITY_PAGE_THRESHOLD[entity];
}

function isEntityKind(kind: CorpusKind): kind is EntityKind {
  return kind === "work" || kind === "person" || kind === "concept";
}

/**
 * Whether `site` has a page for corpus entity `kind`/`id`. Quiet never has a thread page in
 * this cut. Layer flags win; then (Quiet, people/works/concepts) the legacy count threshold;
 * otherwise true.
 */
export function hasPageOn(site: Site, kind: CorpusKind, id: string, data: LinkData = {}): boolean {
  if (site === "quiet" && kind === "thread") return false;
  const flag = data.hasPage?.(site, kind, id);
  if (flag !== undefined) return flag;
  if (site === "quiet" && isEntityKind(kind)) {
    const count = data.entityCount?.(kind, id);
    if (count !== undefined) return quietHasEntityPage(kind, count);
  }
  return true;
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
