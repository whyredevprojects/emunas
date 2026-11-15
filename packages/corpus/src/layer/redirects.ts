/**
 * Retired corpus ids (corpus-wave-plan §5): `redirects.json` from the pipeline plus record-level
 * `mergedInto`, chains resolved to the final live id. Cycles and targets that do not exist are
 * dropped and reported. A record whose id is a redirect source is retired: it leaves the entity
 * files and only its redirect remains.
 */
import type { LayerRedirectKind } from "../public/corpus-layer.ts";
import type { CorpusInput } from "./input/load.ts";
import type { RedirectKind } from "./input/schemas.ts";

export const LAYER_REDIRECT_KINDS: readonly LayerRedirectKind[] = ["topics", "concepts", "people", "works", "stories", "threads"];

const INPUT_KIND: Readonly<Record<LayerRedirectKind, RedirectKind>> = {
  topics: "topics",
  concepts: "concepts",
  people: "people",
  works: "works",
  stories: "stories",
  threads: "teachingClusters",
};

export interface DroppedRedirect {
  kind: LayerRedirectKind;
  from: string;
  reason: "cycle" | "dangling" | "conflict";
}

export interface ResolvedRedirects {
  /** kind → retired id → final live id (sorted by retired id). */
  map: Record<LayerRedirectKind, Record<string, string>>;
  dropped: DroppedRedirect[];
}

type Rec = { id: string; mergedInto?: string };

function recordsOf(input: CorpusInput, kind: LayerRedirectKind): readonly Rec[] {
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

export function resolveCorpusRedirects(input: CorpusInput): ResolvedRedirects {
  const map = {} as Record<LayerRedirectKind, Record<string, string>>;
  const dropped: DroppedRedirect[] = [];
  for (const kind of LAYER_REDIRECT_KINDS) {
    const recs = recordsOf(input, kind);
    const ids = new Set(recs.map((r) => r.id));
    const edges = new Map<string, string>();
    for (const r of recs) if (r.mergedInto !== undefined && r.mergedInto !== r.id) edges.set(r.id, r.mergedInto);
    for (const [from, to] of Object.entries(input.redirects?.[INPUT_KIND[kind]] ?? {})) {
      const prev = edges.get(from);
      if (prev !== undefined && prev !== to) dropped.push({ kind, from, reason: "conflict" });
      edges.set(from, to);
    }
    const out: Record<string, string> = {};
    for (const from of [...edges.keys()].sort()) {
      const seen = new Set([from]);
      let cur = from;
      let cycle = false;
      for (let next = edges.get(cur); next !== undefined; next = edges.get(cur)) {
        if (seen.has(next)) {
          cycle = true;
          break;
        }
        seen.add(next);
        cur = next;
      }
      if (cycle) dropped.push({ kind, from, reason: "cycle" });
      else if (!ids.has(cur)) dropped.push({ kind, from, reason: "dangling" });
      else out[from] = cur;
    }
    map[kind] = out;
  }
  return { map, dropped };
}
