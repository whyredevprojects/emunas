/**
 * C1.2 rules on edited copies of the mini corpus and in isolation: series synthesis cut to visible
 * parts, occasion links from the data, hub filtering by other-speaker share, policy switches
 * (thread pages, two-member pointers, `other` people), corpus redirects, the cluster-count lint,
 * legacy name forms, and the file side of the build (corpus absent, stale files, unchanged rerun).
 */
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCorpusWithAggregates, projectAndAggregate } from "../../src/aggregate/build.ts";
import type { CorpusInput } from "../../src/layer/input/load.ts";
import { nameForms } from "../../src/layer/legacy.ts";
import { resolveCorpusRedirects } from "../../src/layer/redirects.ts";
import { statedShiurCounts } from "../../src/layer/stories.ts";
import { foldTerms } from "../../src/layer/synonyms.ts";
import type {
  LayerInfo,
  LayerOccasionTopicsFile,
  LayerPeopleFile,
  LayerSeries,
  LayerShiurRefs,
  LayerThreadsFile,
  LayerTopicsFile,
} from "../../src/public/corpus-layer.ts";
import { MINI_DATA, MINI_POLICY, editJson, miniCopy, readJson, tmp } from "../helpers.ts";

const CORPUS = "derived/corpus";

function policyCopy(corpusPolicy?: unknown): string {
  const d = join(tmp(), "site-policy");
  mkdirSync(d, { recursive: true });
  cpSync(MINI_POLICY, d, { recursive: true });
  if (corpusPolicy !== undefined) writeFileSync(join(d, "corpus-policy.json"), JSON.stringify(corpusPolicy));
  return d;
}

const layerOf = (dataDir = MINI_DATA, policyDir = MINI_POLICY) => projectAndAggregate({ dataDir, policyDir });
const base = layerOf();
const visibleIds = (base.layer.files["layer.json"] as LayerInfo).counts.visibleShiurim;
const refsOf = (files: Record<string, unknown>) => Object.entries(files).filter(([k]) => k.startsWith("shiur/")).map(([, v]) => v as LayerShiurRefs);
const visible = base.shiurim.filter((s) => s.status === "full").map((s) => s.id);

describe("series synthesis", () => {
  it("is published only with a visible part; the arc keeps visible parts and lists the rest as missing", () => {
    expect(Object.keys(base.layer.files).filter((k) => k.startsWith("series/"))).toEqual([]);
    const d = miniCopy();
    const file = join(d, CORPUS, "series/emunah-en.json");
    editJson<{ arc: { shiurId: string; part: number; oneLiner: { en: string; yi: string } }[] }>(file, (s) => {
      s.arc = [
        { shiurId: visible[0]!, part: 1, oneLiner: { en: "One.", yi: "איינס." } },
        { shiurId: "en-emunah-en-01", part: 2, oneLiner: { en: "Two.", yi: "צוויי." } },
      ];
    });
    const s = layerOf(d).layer.files["series/emunah-en.json"] as LayerSeries;
    expect(s.arc).toEqual([{ shiurId: visible[0]!, part: 1, oneLiner: { en: "One.", yi: "איינס." } }]);
    // en-emunah-en-01 is part 2 of the arc; en-emunah-en-16 is not in the arc: its catalog position (2).
    expect(s.missing).toEqual([2, 2]);
    expect(s.reviewed).toBe(false);
  });
});

describe("occasion topics", () => {
  it("a topic's own parsha key wins and shows on the topic", () => {
    const d = miniCopy();
    editJson<{ id: string; parsha?: string }[]>(join(d, CORPUS, "topics.json"), (ts) => {
      ts.find((t) => t.id === "noach-mabul")!.parsha = "Noach";
    });
    const f = layerOf(d).layer.files;
    const occ = (f["occasion-topics.json"] as LayerOccasionTopicsFile).occasions;
    expect(occ).toContainEqual({ key: "noach", kind: "parsha", topicId: "noach-mabul", source: "data", share: null });
    const t = f["topics.json"] as LayerTopicsFile;
    expect(t.detail.find((x) => x.id === "noach-mabul")!.occasions).toEqual(["noach"]);
  });
});

describe("hubs", () => {
  it("leave out shiurim by another speaker (≥ maxOtherSpeakerShare) and refill by salience", () => {
    const topics = base.layer.files["topics.json"] as LayerTopicsFile;
    const withHubs = topics.detail.find((d) => d.hubs.length > 0)!;
    const victim = withHubs.hubs[0]!;
    const d = miniCopy();
    editJson<{ otherSpeakerShare: number }>(join(d, CORPUS, `shiur-tags/${victim}.json`), (t) => {
      t.otherSpeakerShare = 0.6;
    });
    const after = layerOf(d).layer.files["topics.json"] as LayerTopicsFile;
    for (const x of after.detail) expect(x.hubs).not.toContain(victim);
    const graded = after.detail.find((x) => x.id === withHubs.id)!.grades;
    expect([...graded.main, ...graded.discussed, ...graded.touched].map((r) => r.shiurId)).toContain(victim);
  });

  it("are visible, tagged and at most ten", () => {
    const topics = base.layer.files["topics.json"] as LayerTopicsFile;
    for (const x of topics.detail) {
      expect(x.hubs.length).toBeLessThanOrEqual(10);
      const graded = new Set([...x.grades.main, ...x.grades.discussed, ...x.grades.touched].map((r) => r.shiurId));
      for (const h of x.hubs) expect(graded.has(h)).toBe(true);
    }
  });
});

describe("grades", () => {
  it("split by salience 0.6 / lower / section only, each shiur once", () => {
    const topics = base.layer.files["topics.json"] as LayerTopicsFile;
    for (const x of topics.detail) {
      for (const r of x.grades.main) expect(r.salience).toBeGreaterThanOrEqual(0.6);
      for (const r of x.grades.discussed) expect(r.salience).toBeLessThan(0.6);
      for (const r of x.grades.touched) expect(r.chapters.length).toBeGreaterThan(0);
      const ids = [...x.grades.main, ...x.grades.discussed, ...x.grades.touched].map((r) => r.shiurId);
      expect(new Set(ids).size).toBe(ids.length);
    }
    expect(topics.detail.some((x) => x.grades.touched.length > 0)).toBe(true);
  });

  it("a parent counts its descendants", () => {
    const topics = base.layer.files["topics.json"] as LayerTopicsFile;
    const byId = new Map(topics.tree.map((t) => [t.id, t]));
    for (const t of topics.tree) if (t.parentId !== null) expect(byId.get(t.parentId)!.count).toBeGreaterThanOrEqual(t.count);
  });
});

describe("policy switches", () => {
  it("pageMinShiurim 2 turns two-shiur threads into pages without the inline pointer", () => {
    const f = layerOf(MINI_DATA, policyCopy({ policyVersion: 1, threads: { pageMinShiurim: 2 } })).layer.files;
    const th = (f["threads.json"] as LayerThreadsFile).threads;
    expect(th.length).toBeGreaterThan(0);
    for (const t of th) expect(t.page).toBe(true);
    for (const r of refsOf(f)) for (const i of r.insights) expect(i.other).toBeUndefined();
  });

  it('twoMember "none" leaves two-shiur threads off the shiur refs', () => {
    const f = layerOf(MINI_DATA, policyCopy({ policyVersion: 1, threads: { twoMember: "none" } })).layer.files;
    expect(refsOf(f).flatMap((r) => r.insights)).toEqual([]);
    expect(refsOf(base.layer.files).flatMap((r) => r.insights).length).toBeGreaterThan(0);
  });

  it("people.other.liveListed lists `other` people on Live (still no pages)", () => {
    const f = layerOf(MINI_DATA, policyCopy({ policyVersion: 1, people: { other: { liveListed: true } } })).layer.files;
    const others = (f["people.json"] as LayerPeopleFile).people.filter((p) => p.type === "other" && p.excluded === null);
    expect(others.length).toBeGreaterThan(0);
    for (const p of others) {
      expect(p.listed.live).toBe(true);
      expect(p.pages).toEqual({ quiet: false, live: false });
    }
  });

  it("excludeIds removes a person from every index; excludeFamily false keeps the family rule off", () => {
    const victim = "abudraham";
    const f = layerOf(MINI_DATA, policyCopy({ policyVersion: 1, people: { excludeIds: [victim], excludeFamily: false } })).layer.files;
    const ppl = (f["people.json"] as LayerPeopleFile).people;
    expect(ppl.find((p) => p.id === victim)!.excluded).toBe("owner");
    expect(ppl.find((p) => p.id === "eliyahu-shalom-wolfson")!.excluded).toBeNull();
  });

  it("the policy hash changes with the policy", () => {
    const f = layerOf(MINI_DATA, policyCopy({ policyVersion: 1, threads: { pageMinShiurim: 2 } })).layer.files;
    expect((f["layer.json"] as LayerInfo).policyHash).not.toBe((base.layer.files["layer.json"] as LayerInfo).policyHash);
  });
});

describe("corpus redirects (unit)", () => {
  const input = (redirects: Record<string, Record<string, string>>, people: { id: string; mergedInto?: string }[]): CorpusInput =>
    ({ topics: [], concepts: [], people, works: [], stories: [], teachingClusters: [], redirects }) as unknown as CorpusInput;

  it("resolves chains through mergedInto and the data file; drops cycles and dangling targets", () => {
    const r = resolveCorpusRedirects(
      input({ people: { a: "b", x: "y", y: "x", gone: "nowhere" } }, [{ id: "b", mergedInto: "c" }, { id: "c" }, { id: "y" }]),
    );
    expect(r.map.people).toEqual({ a: "c", b: "c" });
    expect(r.dropped).toEqual([
      { kind: "people", from: "gone", reason: "dangling" },
      { kind: "people", from: "x", reason: "cycle" },
      { kind: "people", from: "y", reason: "cycle" },
    ]);
  });

  it("the data file wins over a conflicting mergedInto, and the conflict is reported", () => {
    const r = resolveCorpusRedirects(input({ people: { a: "c" } }, [{ id: "a", mergedInto: "b" }, { id: "b" }, { id: "c" }]));
    expect(r.map.people).toEqual({ a: "c" });
    expect(r.dropped).toEqual([{ kind: "people", from: "a", reason: "conflict" }]);
  });
});

describe("small helpers (unit)", () => {
  it("statedShiurCounts reads numbers of shiurim in summaries", () => {
    expect(statedShiurCounts("Taught in five shiurim over the years.")).toEqual([5]);
    expect(statedShiurCounts("in 3 talks; two other shiurim add")).toEqual([3, 3]);
    expect(statedShiurCounts("The Rav teaches two ideas.")).toEqual([]);
  });

  it("nameForms splits parentheses and titles", () => {
    expect(nameForms("the Rashab (Rabbi Sholom DovBer of Lubavitch)")).toEqual(
      expect.arrayContaining(["rashab", "sholom dovber of lubavitch", "rabbi sholom dovber of lubavitch"]),
    );
    expect(nameForms("Rebbe Levi Yitzchak of Berditchev")).toContain("levi yitzchak of berditchev");
  });

  it("foldTerms folds, drops empties and deduplicates", () => {
    expect(foldTerms(["Hester Panim", "hester  panim", "", null, "הסתר פנים"])).toEqual(["hester panim", "הסתר פנים"]);
  });
});

describe("build files", () => {
  it("writes .corpus/layer/, rewrites nothing on an unchanged rerun, and removes stale files", () => {
    const out = join(tmp(), "out");
    const r1 = buildCorpusWithAggregates({ dataDir: MINI_DATA, policyDir: MINI_POLICY, outDir: out, dataSha: null });
    const layerDir = join(out, "layer");
    expect(r1.layer.files).toContain("layer.json");
    expect(r1.layer.files.filter((f) => f.startsWith("shiur/"))).toHaveLength(visibleIds);
    // Unchanged rerun: no file under .corpus/ is touched.
    const all = (dir: string): string[] =>
      readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? all(join(dir, f)) : [join(dir, f)]));
    const old = new Date("2020-01-01T00:00:00Z");
    for (const f of all(out)) utimesSync(f, old, old);
    buildCorpusWithAggregates({ dataDir: MINI_DATA, policyDir: MINI_POLICY, outDir: out, dataSha: null });
    const touched = all(out).filter((f) => statSync(f).mtimeMs !== old.getTime());
    expect(touched).toEqual([]);
    // A stale layer file is removed on the next build.
    writeFileSync(join(layerDir, "shiur/stale-shiur.json"), "{}");
    const r3 = buildCorpusWithAggregates({ dataDir: MINI_DATA, policyDir: MINI_POLICY, outDir: out, dataSha: null });
    expect(r3.layer.removed).toEqual(["shiur/stale-shiur.json"]);
    expect(existsSync(join(layerDir, "shiur/stale-shiur.json"))).toBe(false);
  });

  it("with the corpus absent the layer is off: only layer.json, enabled false", () => {
    const out = join(tmp(), "out");
    buildCorpusWithAggregates({ dataDir: MINI_DATA, policyDir: MINI_POLICY, outDir: out, dataSha: null });
    const d = miniCopy();
    rmSync(join(d, CORPUS), { recursive: true, force: true });
    const r = buildCorpusWithAggregates({ dataDir: d, policyDir: MINI_POLICY, outDir: out, dataSha: null });
    expect(r.layer.info.enabled).toBe(false);
    expect(r.layer.files).toEqual(["layer.json"]);
    expect(readdirSync(join(out, "layer"))).toEqual(["layer.json"]);
    const info = readJson<LayerInfo>(join(out, "layer/layer.json"));
    expect(info.warnings.join(" ")).toMatch(/absent/);
    expect(r.layer.removed.length).toBeGreaterThan(10);
  });
});
