import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { buildCorpusWithAggregates as buildCorpus } from "@emunas/corpus/build/aggregate";
import { buildSearchOutputs, readCorpusShiurim } from "@emunas/search-core/build";
import type { MomentRow } from "@emunas/search-core";
import { HashingEmbedder, MemoryBlobStore } from "../../../../workers/api/sync/src/local.ts";
import { chooseModel, evaluateModel, regressions, resolveExpected, type EvalQuery, type ModelResult, type QueriesFile } from "./eval.ts";
import { mean, recallAt, reciprocalRank, shiurRanking, topK } from "./metrics.ts";
import { renderReport } from "./report.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../../../..");
const QUERIES = JSON.parse(readFileSync(join(HERE, "queries.json"), "utf8")) as QueriesFile;
const dirs: string[] = [];
afterAll(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function corpusRows(dataDir: string, policyDir: string): MomentRow[] {
  const out = mkdtempSync(join(tmpdir(), "eval-test-"));
  dirs.push(out);
  buildCorpus({ dataDir, outDir: out, policyDir, dataSha: null });
  return buildSearchOutputs(readCorpusShiurim(out)).moments;
}

describe("metrics", () => {
  const rel = new Set(["a", "b", "c"]);
  it("recall@k is normalised by min(|relevant|, k)", () => {
    expect(recallAt(["a", "x", "b"], rel, 10)).toBeCloseTo(2 / 3);
    expect(recallAt(["a", "b"], rel, 2)).toBe(1);
    expect(recallAt(["x"], new Set(), 10)).toBe(0);
  });
  it("reciprocal rank of the first relevant item", () => {
    expect(reciprocalRank(["x", "y", "c"], rel)).toBeCloseTo(1 / 3);
    expect(reciprocalRank(["x"], rel)).toBe(0);
    expect(mean([1, 0, 0.5])).toBeCloseTo(0.5);
  });
  it("shiur ranking keeps the best moment's position; topK orders by score", () => {
    expect(shiurRanking(["s1", "s2", "s1", "s3"])).toEqual(["s1", "s2", "s3"]);
    expect(topK(Float32Array.from([0.1, 0.9, 0.5, 0.9, 0.2]), 3)).toEqual([1, 3, 2]);
    expect(topK(Float32Array.from([0.3, 0.1]), 5)).toEqual([0, 1]);
  });
});

describe("queries.json", () => {
  it("has 60 queries: 20 en, 20 yi, 20 cross-language, unique ids, selectors and expected ids", () => {
    const q = QUERIES.queries;
    expect(q).toHaveLength(60);
    expect(new Set(q.map((x) => x.id)).size).toBe(60);
    for (const set of ["en", "yi", "cross"] as const) expect(q.filter((x) => x.set === set)).toHaveLength(20);
    for (const x of q) {
      expect(x.q.trim().length).toBeGreaterThan(0);
      expect(Object.keys(x.select).length).toBeGreaterThan(0);
      expect(x.expected.length).toBeGreaterThan(0);
      for (const id of x.expected) expect(id).toMatch(/^(en|yi)-[a-z0-9-]+$/);
    }
    // Yiddish set is Hebrew script; English set is Latin script.
    for (const x of q.filter((y) => y.set === "yi")) expect(x.q).toMatch(/\p{Script=Hebrew}/u);
    for (const x of q.filter((y) => y.set === "en")) expect(x.q).not.toMatch(/\p{Script=Hebrew}/u);
    // Cross-language: the query's script differs from the language of the expected recordings.
    for (const x of q.filter((y) => y.set === "cross")) {
      const hebrew = /\p{Script=Hebrew}/u.test(x.q);
      expect(x.select.audio).toBe(hebrew ? "en" : "yi");
    }
  });

  it.runIf(existsSync(join(REPO, "data/derived/ingest.json")))("expected ids are what the selectors resolve to on the current data", () => {
    const rows = corpusRows(join(REPO, "data"), join(REPO, "site-policy"));
    for (const x of QUERIES.queries) {
      const now = resolveExpected(x.select, rows);
      // Data keeps arriving: frozen ids must still resolve (new shiurim may be added later).
      expect(now, x.id).toEqual(expect.arrayContaining(x.expected));
    }
  });
});

describe("evaluateModel on the mini corpus (stand-in embedder)", () => {
  const rows = corpusRows(join(REPO, "packages/corpus/test/fixtures/mini/data"), join(REPO, "packages/corpus/test/fixtures/mini/site-policy"));
  const specs: EvalQuery[] = [
    { id: "q1", set: "en", q: "Pesach seder", select: { occasion: "pesach" }, expected: [] },
    { id: "q2", set: "yi", q: "חנוכה", select: { occasion: "chanukah" }, expected: [] },
    { id: "q3", set: "cross", q: "purim", select: { occasion: "purim", audio: "yi" }, expected: [] },
  ];
  const queries = specs.map((q) => ({ ...q, expected: resolveExpected(q.select, rows) }));

  it("selectors resolve on the mini corpus", () => {
    for (const q of queries) expect(q.expected.length, q.id).toBeGreaterThan(0);
  });

  it("scores every query and reuses the embedding cache on a second run", async () => {
    const store = new MemoryBlobStore();
    const e = new HashingEmbedder(256);
    const r1 = await evaluateModel(rows, queries, e, store);
    expect(r1.queries).toHaveLength(3);
    expect(r1.summary.all.queries).toBe(3);
    for (const q of r1.queries) {
      expect(q.recall10).toBeGreaterThanOrEqual(0);
      expect(q.recall10).toBeLessThanOrEqual(1);
    }
    expect(r1.summary.all.mrr).toBeGreaterThan(0);
    const r2 = await evaluateModel(rows, queries, e, store);
    expect(r2.embed.unitsEmbedded).toBe(0);
    expect(r2.summary).toEqual(r1.summary);
  });

  it("chooses the better model, flags >5 point drops, and renders the report", async () => {
    const mk = (model: string, mrr: number, recall10: number): ModelResult => ({
      model,
      dims: 1024,
      units: 1,
      embed: { unitsEmbedded: 0, unitsFromCache: 0 },
      queries: [],
      summary: { en: { queries: 1, mrr, recall10 }, yi: { queries: 1, mrr, recall10 }, cross: { queries: 1, mrr, recall10 }, all: { queries: 3, mrr, recall10 } },
    });
    const a = mk("@cf/baai/bge-m3", 0.6, 0.5);
    const b = mk("@cf/qwen/qwen3-embedding-0.6b", 0.5, 0.5);
    expect(chooseModel([b, a])?.model).toBe("@cf/baai/bge-m3");
    expect(regressions([a], [mk("@cf/baai/bge-m3", 0.56, 0.5)])).toEqual([]);
    expect(regressions([a], [mk("@cf/baai/bge-m3", 0.54, 0.5)]).map((d) => `${d.set}:${d.metric}`)).toEqual(["en:mrr", "yi:mrr", "cross:mrr", "all:mrr"]);
    const real = renderReport({ generatedAt: "t", real: true, moments: 1, chosen: a.model, results: [a, b] });
    expect(real).toContain("Chosen embedding model: **@cf/baai/bge-m3**");
    const fake = renderReport({ generatedAt: "t", real: false, moments: 1, chosen: null, results: [a] });
    expect(fake).toContain("Stand-in run");
    expect(fake).toContain("Pending the real run");
  });
});
