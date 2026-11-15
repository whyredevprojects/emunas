import { describe, expect, it } from "vitest";
import { ancestorsOf, CONCEPT_FACET_DROP_ONE_IN, droppedConcepts, exploreRows, type ExploreRow } from "../entities.ts";
import { FacetEngine } from "../engine.ts";
import { LIVE_DATA_SCHEMA_VERSION, topicNodes, type ExploreEntitiesFile } from "../live-data.ts";
import { corpusFile, exploreEntitiesFile, facetsFile, syntheticRows, topicsFile } from "./synthetic.ts";

describe("Explore's entity rows", () => {
  const rows = syntheticRows({ n: 300, seed: 4, people: 40, concepts: 40, works: 40 });
  const tree = topicNodes(topicsFile(rows));
  const facets = facetsFile(rows);

  it("takes the ids from explore/entities.json and adds each topic's ancestors", () => {
    const corpus = corpusFile(rows).shiurim;
    const out = exploreRows(corpus, exploreEntitiesFile(rows), tree, facets);
    expect(out.map((r) => r.entities)).toEqual(rows.map((r) => r.entities));
    // the tree's counts include descendants, and so do the facet counts
    const counts = new FacetEngine(out).query({ sets: {}, year: null }).counts.topic;
    for (const n of tree) expect(counts[n.id] ?? 0, n.id).toBe(n.count);
  });

  it("keeps only listed ids: an unlisted person (type other), an unknown topic and a missing shiur give nothing", () => {
    const r = rows.find((x) => x.status === "full" && x.entities.people.length > 0)!;
    const file: ExploreEntitiesFile = {
      schemaVersion: LIVE_DATA_SCHEMA_VERSION,
      shiurim: { [r.id]: { topics: ["t1-2-1", "no-such-topic"], people: ["vladimir-putin", r.entities.people[0]!], concepts: ["c-unlisted"], works: [] } },
    };
    const [out] = exploreRows([r], file, tree, facets);
    expect(out!.entities).toEqual({ topics: ["t1", "t1-2", "t1-2-1"], people: [r.entities.people[0]], concepts: [], works: [] });
    const [none] = exploreRows([r], null, tree, facets);
    expect(none!.entities).toEqual({ topics: [], people: [], concepts: [], works: [] });
  });

  it("drops concepts on more than a quarter of the summarized shiurim, by rule", () => {
    const base = rows.filter((r) => r.status === "full");
    const total = base.length;
    const mk = (id: string, concepts: string[]): ExploreRow => ({ ...base[0]!, id, entities: { topics: [], people: [], concepts, works: [] } });
    const quarter = Math.floor(total / CONCEPT_FACET_DROP_ONE_IN);
    const test = base.map((r, i) => {
      const concepts: string[] = [];
      if (i < quarter) concepts.push("at-most-a-quarter");
      if (i <= quarter) concepts.push("over-a-quarter");
      if (i === 0) concepts.push("rare");
      return mk(r.id, concepts);
    });
    // n/total > 1/4 ⇔ 4n > total
    expect(quarter * CONCEPT_FACET_DROP_ONE_IN).toBeLessThanOrEqual(total);
    expect((quarter + 1) * CONCEPT_FACET_DROP_ONE_IN).toBeGreaterThan(total);
    expect(droppedConcepts(test)).toEqual(new Set(["over-a-quarter"]));
    expect(droppedConcepts([])).toEqual(new Set());
  });

  it("ancestor chains stop at unknown parents and cycles", () => {
    const a = ancestorsOf([
      { id: "a", parentId: null, level: 1, label: { en: "a", yi: "a" }, count: 1 },
      { id: "b", parentId: "a", level: 2, label: { en: "b", yi: "b" }, count: 1 },
      { id: "c", parentId: "b", level: 3, label: { en: "c", yi: "c" }, count: 1 },
      { id: "x", parentId: "y", level: 2, label: { en: "x", yi: "x" }, count: 1 },
      { id: "y", parentId: "x", level: 3, label: { en: "y", yi: "y" }, count: 1 },
      { id: "z", parentId: "gone", level: 2, label: { en: "z", yi: "z" }, count: 1 },
    ]);
    expect(a.get("c")).toEqual(["b", "a"]);
    expect(a.get("a")).toEqual([]);
    expect(a.get("x")).toEqual(["y"]);
    expect(a.get("z")).toEqual([]);
  });
});
