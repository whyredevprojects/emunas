/**
 * C1.2 acceptance on today's data/ (corpus-wave-plan §7 C1.2). Figures are derived from the data
 * where they can grow; the fixed ones (78 sameAs topics, the sugar-sled redirect, shabbos-tefilah-en)
 * are the ones the plan names.
 */
import { existsSync, readdirSync, statSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCorpusWithAggregates, projectAndAggregate } from "../../src/aggregate/build.ts";
import { toJson } from "../../src/build/build.ts";
import { finishLayer, loadLayerInput, prepareLayer } from "../../src/layer/build.ts";
import type {
  LayerConceptsFile,
  LayerInfo,
  LayerOccasionTopicsFile,
  LayerPeopleFile,
  LayerStoriesFile,
  LayerTopicsFile,
} from "../../src/public/corpus-layer.ts";
import { REAL_DATA, REAL_POLICY, readJson, tmp } from "../helpers.ts";
import { aliasViolations, countViolations, forbiddenKeys, referencedShiurIds } from "./helpers.ts";

type Json = Record<string, unknown>;
const corpusDir = join(REAL_DATA, "derived/corpus");
const manifest = readJson<{ entries: { shiurId: string; status: string }[] }>(join(REAL_DATA, "derived/manifest.json"));
const corpusIndex = readJson<{ shiurIds: string[] }>(join(corpusDir, "index.json"));
const dataTopics = readJson<Json[]>(join(corpusDir, "topics.json"));

const p = projectAndAggregate({ dataDir: REAL_DATA, policyDir: REAL_POLICY });
const files = p.layer.files;
const inCorpus = new Set(corpusIndex.shiurIds);
const V = new Set(p.shiurim.filter((s) => s.status === "full" && inCorpus.has(s.id)).map((s) => s.id));
const needsReview = manifest.entries.filter((e) => e.status === "needs_review").map((e) => e.shiurId);

describe("corpus layer on real data", () => {
  it("(1) no count exceeds the visible recount, and nothing references a shiur outside V", () => {
    expect((files["layer.json"] as LayerInfo).counts.visibleShiurim).toBe(V.size);
    expect(countViolations(files, V)).toEqual([]);
    expect(referencedShiurIds(files).filter((r) => !V.has(r.shiurId))).toEqual([]);
  });

  it("(2) the needs_review shiurim appear in no layer file", () => {
    expect(needsReview.length).toBeGreaterThan(0);
    for (const [name, content] of Object.entries(files)) {
      const text = JSON.stringify(content);
      for (const id of needsReview) {
        expect(text.includes(`"${id}"`) || text.includes(`"${id}~`), `${id} in ${name}`).toBe(false);
        expect(name.includes(id)).toBe(false);
      }
    }
  });

  it("(3) every sameAs topic resolves (75 today) and no concept merged into a topic has a page", () => {
    const withSameAs = dataTopics.filter((t) => t["sameAs"] !== undefined);
    expect(withSameAs.length).toBeGreaterThanOrEqual(75);
    const tree = (files["topics.json"] as LayerTopicsFile).tree;
    const resolved = tree.filter((t) => t.sameAs !== null);
    expect(resolved.map((t) => t.id).sort()).toEqual(withSameAs.map((t) => String(t["id"])).sort());
    const concepts = (files["concepts.json"] as LayerConceptsFile).concepts;
    for (const t of resolved) {
      if (t.sameAs?.conceptId === undefined) continue;
      const c = concepts.find((x) => x.id === t.sameAs!.conceptId)!;
      expect(c.mergedIntoTopic).toBe(t.id);
      expect(c.pages).toEqual({ quiet: false, live: false });
    }
    expect(concepts.filter((c) => c.mergedIntoTopic !== null && (c.pages.quiet || c.pages.live))).toEqual([]);
  });

  it("(4) retired ids are resolved internally: the merged story and the people moved to concepts are gone, their survivors stay", () => {
    const stories = (files["stories.json"] as LayerStoriesFile).stories.map((s) => s.id);
    expect(stories).not.toContain("the-sanzer-rav-and-the-business-competitor");
    expect(stories).toContain("the-divrei-chaim-and-the-man-who-shamed");
    const people = (files["people.json"] as LayerPeopleFile).people.map((x) => x.id);
    for (const id of ["moshiach", "kohen-gadol", "kamtza-and-bar-kamtza", "chaggai-zechariah-malachi"]) expect(people).not.toContain(id);
    expect((files["concepts.json"] as LayerConceptsFile).concepts.map((c) => c.id)).toContain("mashiach");
    expect(Object.keys(files)).not.toContain("redirects.json");
    expect((files["layer.json"] as LayerInfo).counts.retiredIds).toBeGreaterThanOrEqual(29);
  });

  it("(5) every published alias and synonym is in its entity's display-field set", () => {
    expect(aliasViolations(files, REAL_DATA)).toEqual([]);
  });

  it("(6) no layer file carries asrVariants, heardAs*, startSeg or endSeg", () => {
    expect(forbiddenKeys(files)).toEqual([]);
    for (const content of Object.values(files)) expect(JSON.stringify(content)).not.toMatch(/"(?:asrVariants|heardAs\w*|startSeg|endSeg)"/);
  });

  it("(7) shabbos-tefilah-en has no series synthesis output", () => {
    expect(Object.keys(files)).not.toContain("series/shabbos-tefilah-en.json");
    expect(Object.keys(files).filter((k) => k.startsWith("series/")).length).toBeGreaterThan(10);
  });

  it("(8) the layer adds under 10 s to corpus:build", () => {
    const t0 = performance.now();
    const prepared = prepareLayer(loadLayerInput({ dataDir: REAL_DATA, policyDir: REAL_POLICY }), p);
    finishLayer(prepared);
    expect(performance.now() - t0).toBeLessThan(10_000);
  });

  it("(9) a rerun with unchanged input rewrites no file; (10) the other .corpus outputs are unchanged by the layer", () => {
    const out = join(tmp(), "with-layer");
    buildCorpusWithAggregates({ dataDir: REAL_DATA, policyDir: REAL_POLICY, outDir: out, dataSha: null });
    const all = (dir: string): string[] =>
      readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? all(join(dir, f)) : [join(dir, f)]));
    const old = new Date("2020-01-01T00:00:00Z");
    for (const f of all(out)) utimesSync(f, old, old);
    buildCorpusWithAggregates({ dataDir: REAL_DATA, policyDir: REAL_POLICY, outDir: out, dataSha: null });
    expect(all(out).filter((f) => statSync(f).mtimeMs !== old.getTime())).toEqual([]);

    expect(existsSync(join(out, "layer/layer.json"))).toBe(true);
  });

  it("aggregate works.json carries the merged work id", () => {
    const works = p.aggregates.files.works.works;
    const withId = works.filter((w) => typeof w.workId === "string");
    expect(withId.length).toBeGreaterThan(works.length / 2);
    const layerWorks = new Set((files["works.json"] as { works: { id: string }[] }).works.map((w) => w.id));
    for (const w of withId) expect(layerWorks.has(w.workId as string)).toBe(true);
    expect(works.find((w) => w.key === "tanya")?.workId).toBe("tanya");
  });

  it("links occasions from the topics' own parsha/zman keys first (D11), the most specific topic winning", () => {
    const occ = (files["occasion-topics.json"] as LayerOccasionTopicsFile).occasions;
    expect(occ.find((o) => o.kind === "parsha" && o.key === "noach")).toMatchObject({ topicId: "noach-mabul", source: "data" });
    expect(occ.filter((o) => o.source === "data").length).toBeGreaterThan(40);
    // A parsha only a sefer topic lists goes to the sefer, not to the level-1 parsha topic.
    const tree = (files["topics.json"] as LayerTopicsFile).tree;
    for (const o of occ.filter((x) => x.source === "data")) expect(tree.find((t) => t.id === o.topicId)?.level).toBeGreaterThan(1);
    for (const o of occ) if (o.source === "derived") expect(o.share!).toBeGreaterThanOrEqual(0.5);
  });

  it("matches the Quiet addendum's worked example (hashgacha pratis: three grades)", () => {
    const t = files["topics.json"] as LayerTopicsFile;
    const d = t.detail.find((x) => x.id === "hashgacha-pratis")!;
    expect(d.grades.main.length + d.grades.discussed.length + d.grades.touched.length).toBe(t.tree.find((x) => x.id === "hashgacha-pratis")!.count);
    expect(d.grades.main.length).toBeGreaterThan(0);
    expect(d.grades.touched.length).toBeGreaterThan(0);
  });

  it("is deterministic", () => {
    const again = finishLayer(prepareLayer(loadLayerInput({ dataDir: REAL_DATA, policyDir: REAL_POLICY }), p));
    expect(toJson(again.files)).toBe(toJson(files));
  });
});
