/**
 * Explore's entity facets on the corpus layer (concept-live-corpus D "Explore", G.2), pure.
 *
 * - The entity ids of each shiur come from Explore's own file, `explore/entities.json` (merged corpus
 *   ids: topics, people, concepts, works), loaded when Explore opens. A shiur without an entry has
 *   no entity values.
 * - Only ids Live lists are kept: people, concepts and works with a label in `facets.json` (never a
 *   person of type `other`, never an excluded or below-threshold entity) and topics in the tree.
 * - A shiur tagged with a topic also counts for that topic's ancestors, so picking a level-1 topic
 *   finds every shiur under it (the tree's counts include descendants the same way).
 * - Concepts on more than a quarter of the summarized shiurim filter nothing and are dropped from the
 *   facet list by rule (`droppedConcepts`), never by a list.
 */
import type { CorpusRow, ExploreEntitiesFile, FacetsFile, TopicNode } from "./live-data.ts";

export interface ExploreEntities {
  topics: string[];
  people: string[];
  concepts: string[];
  works: string[];
}

/** A corpus row with Explore's entity ids in place of the corpus.json copy. */
export type ExploreRow = Omit<CorpusRow, "entities"> & { entities: ExploreEntities };

/** Concepts above this share of the summarized shiurim are dropped from the facet list (D10, Live D). */
export const CONCEPT_FACET_DROP_ONE_IN = 4;

const strings = (x: unknown): string[] => (Array.isArray(x) ? x.filter((v): v is string => typeof v === "string" && v !== "") : []);

/** Topic id → its ancestors (root last), from the tree; cycles and unknown parents end the chain. */
export function ancestorsOf(tree: readonly TopicNode[]): Map<string, string[]> {
  const parent = new Map(tree.map((n) => [n.id, n.parentId]));
  const out = new Map<string, string[]>();
  for (const n of tree) {
    const chain: string[] = [];
    for (let p = n.parentId; p !== null && parent.has(p) && !chain.includes(p) && p !== n.id; p = parent.get(p) ?? null) chain.push(p);
    out.set(n.id, chain);
  }
  return out;
}

export function exploreRows(
  rows: readonly CorpusRow[],
  file: ExploreEntitiesFile | null,
  tree: readonly TopicNode[],
  facets: Pick<FacetsFile, "person" | "concept" | "work">,
): ExploreRow[] {
  const ancestors = ancestorsOf(tree);
  const listed = (record: Record<string, unknown> | undefined) => (id: string) => record !== undefined && Object.hasOwn(record, id);
  const person = listed(facets.person);
  const concept = listed(facets.concept);
  const work = listed(facets.work);
  const byShiur = file?.shiurim ?? {};
  return rows.map((r) => {
    const e = Object.hasOwn(byShiur, r.id) ? byShiur[r.id] : undefined;
    const topics = new Set<string>();
    for (const id of strings(e?.topics)) {
      const up = ancestors.get(id);
      if (!up) continue;
      topics.add(id);
      for (const a of up) topics.add(a);
    }
    return {
      ...r,
      entities: {
        topics: [...topics].sort(),
        people: [...new Set(strings(e?.people).filter(person))].sort(),
        concepts: [...new Set(strings(e?.concepts).filter(concept))].sort(),
        works: [...new Set(strings(e?.works).filter(work))].sort(),
      },
    };
  });
}

/** Concept ids on more than 1/`oneIn` of the summarized shiurim (dropped from the facet list). */
export function droppedConcepts(rows: readonly ExploreRow[], oneIn: number = CONCEPT_FACET_DROP_ONE_IN): Set<string> {
  const total = rows.filter((r) => r.status === "full").length;
  const count = new Map<string, number>();
  for (const r of rows) for (const c of r.entities.concepts) count.set(c, (count.get(c) ?? 0) + 1);
  const out = new Set<string>();
  for (const [c, n] of count) if (n * oneIn > total) out.add(c);
  return out;
}
