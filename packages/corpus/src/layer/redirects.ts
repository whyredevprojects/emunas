/**
 * Retired corpus ids: `redirects.json` from the pipeline plus record-level `mergedInto`, chains
 * resolved to the final live entity. A target may be of another kind (the retired person
 * `moshiach` → the concept `mashiach`), and a chain may cross kinds. Cycles and targets that do not
 * exist are dropped and reported. A record whose id is a redirect source is retired: it leaves the
 * entity files, and references to it are followed to the surviving entity. This is an internal
 * step of the projection only: nothing about retired ids is published.
 */
import type { CorpusInput } from "./input/load.ts";
import type { RedirectKind } from "./input/schemas.ts";

/** The entity kinds the layer resolves (the contract's kinds plus teaching clusters as threads). */
export type LayerIdKind = "topics" | "concepts" | "people" | "works" | "stories" | "threads";
export const LAYER_ID_KINDS: readonly LayerIdKind[] = ["topics", "concepts", "people", "works", "stories", "threads"];

const FROM_INPUT: Readonly<Record<RedirectKind, LayerIdKind>> = {
  topics: "topics",
  concepts: "concepts",
  people: "people",
  works: "works",
  stories: "stories",
};

/** A live entity a retired id resolves to. */
export interface EntityRef {
  kind: LayerIdKind;
  id: string;
}

export interface DroppedRedirect {
  kind: LayerIdKind;
  from: string;
  reason: "cycle" | "dangling" | "conflict";
}

export interface ResolvedRedirects {
  /** kind → retired id → final live entity (sorted by retired id). */
  map: Record<LayerIdKind, Record<string, EntityRef>>;
  dropped: DroppedRedirect[];
}

type Rec = { id: string; mergedInto?: string };

function recordsOf(input: CorpusInput, kind: LayerIdKind): readonly Rec[] {
  switch (kind) {
    case "topics":
      return input.topics;
    case "concepts":
      return input.concepts;
    case "people":
      return input.people;
    case "works":
      return input.works;
    case "stories":
      return input.stories ?? [];
    case "threads":
      return input.teachingClusters ?? [];
  }
}

const node = (r: EntityRef): string => `${r.kind}\u0000${r.id}`;

export function resolveCorpusRedirects(input: CorpusInput): ResolvedRedirects {
  const exists = new Set<string>();
  const edges = new Map<string, EntityRef>();
  const dropped: DroppedRedirect[] = [];
  for (const kind of LAYER_ID_KINDS) {
    for (const r of recordsOf(input, kind)) {
      exists.add(node({ kind, id: r.id }));
      if (r.mergedInto !== undefined && r.mergedInto !== r.id) edges.set(node({ kind, id: r.id }), { kind, id: r.mergedInto });
    }
  }
  for (const [inKind, m] of Object.entries(input.redirects ?? {}) as [RedirectKind, Record<string, { kind: RedirectKind; id: string }>][]) {
    const kind = FROM_INPUT[inKind];
    for (const [from, to] of Object.entries(m)) {
      const key = node({ kind, id: from });
      const target: EntityRef = { kind: FROM_INPUT[to.kind], id: to.id };
      const prev = edges.get(key);
      if (prev !== undefined && node(prev) !== node(target)) dropped.push({ kind, from, reason: "conflict" });
      edges.set(key, target);
    }
  }
  const map = Object.fromEntries(LAYER_ID_KINDS.map((k) => [k, {}])) as Record<LayerIdKind, Record<string, EntityRef>>;
  const sources = [...edges.keys()].map((k) => {
    const [kind, id] = k.split("\u0000") as [LayerIdKind, string];
    return { kind, id };
  });
  sources.sort((a, b) => LAYER_ID_KINDS.indexOf(a.kind) - LAYER_ID_KINDS.indexOf(b.kind) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const from of sources) {
    const seen = new Set([node(from)]);
    let cur: EntityRef = from;
    let cycle = false;
    for (let next = edges.get(node(cur)); next !== undefined; next = edges.get(node(cur))) {
      if (seen.has(node(next))) {
        cycle = true;
        break;
      }
      seen.add(node(next));
      cur = next;
    }
    if (cycle) dropped.push({ kind: from.kind, from: from.id, reason: "cycle" });
    else if (!exists.has(node(cur))) dropped.push({ kind: from.kind, from: from.id, reason: "dangling" });
    else map[from.kind][from.id] = { kind: cur.kind, id: cur.id };
  }
  return { map, dropped };
}
