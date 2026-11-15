/**
 * Vectorize sync with in-memory stand-ins for Vectorize, Workers AI and the R2 embedding cache.
 * Acceptance: a second run writes 0 vectors; one changed shiur re-embeds and upserts only its
 * vectors; the cache means a rebuilt index needs no model calls.
 */
import { describe, expect, it } from "vitest";
import type { MomentRow } from "@emunas/search-core";
import { cacheKey, decodeF16, embedCached, encodeF16, fromHalf, modelSlug, roundF16, toHalf } from "../src/embed.ts";
import { HashingEmbedder, MemoryBlobStore, MemoryVectorIndex } from "../src/local.ts";
import { loadState, stateKey, syncVectors, vectorMetadataNdjson, wantedUnits } from "../src/vector-sync.ts";
import { toVectorUnits } from "../src/rows.ts";
import { miniMoments, rehash } from "./helpers.ts";

function setup(dims = 32) {
  return { index: new MemoryVectorIndex("emunas-moments-staging", dims), ai: new HashingEmbedder(dims), store: new MemoryBlobStore() };
}

describe("f16 cache encoding", () => {
  it("round-trips representable values exactly and rounds others to nearest", () => {
    for (const v of [0, 1, -1, 0.5, 2 ** -14, 65504, -2.5]) expect(fromHalf(toHalf(v))).toBe(v);
    expect(fromHalf(toHalf(1e6))).toBe(Infinity);
    expect(Math.abs(fromHalf(toHalf(0.1)) - 0.1)).toBeLessThan(1e-4);
    expect(fromHalf(toHalf(2 ** -20))).toBeCloseTo(2 ** -20, 9); // subnormal
    const vals = Array.from({ length: 100 }, (_, i) => Math.sin(i) / 7);
    expect(decodeF16(encodeF16(vals))).toEqual(roundF16(vals));
    expect(encodeF16(vals).byteLength).toBe(200);
  });

  it("cache keys are emb/<model>/<sha256>.f16", () => {
    expect(modelSlug("@cf/baai/bge-m3")).toBe("baai--bge-m3");
    expect(cacheKey("@cf/qwen/qwen3-embedding-0.6b", "x")).toMatch(/^emb\/qwen--qwen3-embedding-0\.6b\/[0-9a-f]{64}\.f16$/);
  });

  it("embedCached calls the model only for texts not in the cache", async () => {
    const { ai, store } = setup();
    const a = await embedCached(["a b", "c d", "a b"], ai, store);
    expect(a.stats).toMatchObject({ requested: 2, cacheHits: 0, embedded: 2, modelCalls: 1 });
    const b = await embedCached(["a b", "e f"], ai, store);
    expect(b.stats).toMatchObject({ requested: 2, cacheHits: 1, embedded: 1 });
    expect(b.vectors.get("a b")).toEqual(a.vectors.get("a b"));
    expect(store.blobs.has(cacheKey(ai.model, "e f"))).toBe(true);
  });
});

describe("Vectorize sync", () => {
  it("first run upserts one vector per (moment, language) except write-up paragraphs", async () => {
    const { index, ai, store } = setup();
    const rows = miniMoments();
    const units = rows.flatMap(toVectorUnits);
    const r = await syncVectors(index, ai, store, rows);
    expect(r).toMatchObject({ upserted: units.length, deleted: 0, planBasis: "listed", skipped: [] });
    expect(index.vectors.size).toBe(units.length);
    expect([...index.vectors.keys()].some((id) => id.includes("~w"))).toBe(false);
    const sample = index.vectors.get(units[0]!.vectorId)!;
    expect(sample.metadata).toEqual(units[0]!.metadata);
    expect(sample.values).toHaveLength(32);
    const state = await loadState(store, index.index);
    expect(Object.keys(state!.vectors)).toHaveLength(units.length);
    expect(store.blobs.has(stateKey(index.index))).toBe(true);
  });

  it("a second run with no data change writes 0 vectors and calls no model", async () => {
    const { index, ai, store } = setup();
    await syncVectors(index, ai, store, miniMoments());
    const calls = { upserts: index.upsertCalls, deletes: index.deleteCalls, ai: ai.calls, puts: store.puts };
    const r = await syncVectors(index, ai, store, miniMoments());
    expect(r).toMatchObject({ upserted: 0, deleted: 0, planBasis: "state" });
    expect(r.embed.modelCalls).toBe(0);
    expect({ upserts: index.upsertCalls, deletes: index.deleteCalls, ai: ai.calls, puts: store.puts }).toEqual(calls);
  });

  it("one changed shiur upserts only its vectors; a removed shiur's vectors are deleted", async () => {
    const { index, ai, store } = setup();
    const rows = miniMoments();
    await syncVectors(index, ai, store, rows);
    const target = rows.find((r) => r.kind === "insight")!.shiurId;
    const changed: MomentRow[] = rows.map((r) =>
      r.shiurId === target && r.kind === "insight" ? rehash({ ...r, title_en: `${r.title_en} (revised)` }) : r,
    );
    const expectIds = changed.filter((r) => r.shiurId === target && r.kind === "insight").flatMap(toVectorUnits).map((u) => u.vectorId);
    const before = index.upsertedTotal;
    const embeddedBefore = ai.textsEmbedded;
    const r = await syncVectors(index, ai, store, changed);
    expect(r.upserted).toBe(expectIds.length);
    expect(index.upsertedTotal - before).toBe(expectIds.length);
    // Only the English text changed: the Yiddish vectors are re-upserted (new hash in metadata)
    // but come from the cache.
    expect(ai.textsEmbedded - embeddedBefore).toBe(expectIds.filter((id) => id.endsWith("@en")).length);
    for (const id of expectIds) expect(index.vectors.get(id)!.metadata.hash).toBe(changed.find((x) => id.startsWith(`${x.id}@`))!.hash);

    const gone = "yi-zmanim-lvl-01";
    const goneIds = [...index.vectors.keys()].filter((id) => id.startsWith(`${gone}~`));
    expect(goneIds.length).toBeGreaterThan(0);
    const r2 = await syncVectors(index, ai, store, changed.filter((x) => x.shiurId !== gone));
    expect(r2).toMatchObject({ upserted: 0, deleted: goneIds.length });
    expect([...index.vectors.keys()].some((id) => id.startsWith(`${gone}~`))).toBe(false);
  });

  it("a lost state file falls back to the index's id list, and the cache spares the model", async () => {
    const { index, ai, store } = setup();
    const rows = miniMoments();
    await syncVectors(index, ai, store, rows);
    index.vectors.set("stale~s0@en", { id: "stale~s0@en", values: new Array(32).fill(0), metadata: index.vectors.values().next().value!.metadata });
    store.blobs.delete(stateKey(index.index));
    const calls = ai.calls;
    const r = await syncVectors(index, ai, store, rows);
    expect(r.planBasis).toBe("listed");
    expect(r.deleted).toBe(1);
    expect(r.embed.embedded).toBe(0);
    expect(ai.calls).toBe(calls);
    expect(index.vectors.has("stale~s0@en")).toBe(false);
  });

  it("a model change rewrites every vector", async () => {
    const { index, store } = setup();
    const rows = miniMoments();
    await syncVectors(index, new HashingEmbedder(32, "fake/a"), store, rows);
    const r = await syncVectors(index, new HashingEmbedder(32, "fake/b"), store, rows);
    expect(r.planBasis).toBe("model-changed");
    expect(r.upserted).toBe(wantedUnits(rows).units.length);
    expect((await loadState(store, index.index))!.model).toBe("fake/b");
  });

  it("ids over 64 bytes are skipped and reported, not sent", async () => {
    const { index, ai, store } = setup();
    const row = miniMoments().find((r) => r.kind === "section")!;
    const longShiur = `yi-${"x".repeat(60)}`;
    const long = rehash({ ...row, id: `${longShiur}~s0`, shiurId: longShiur });
    const r = await syncVectors(index, ai, store, [row, long]);
    expect(r.skipped).toEqual([`${longShiur}~s0@en`, `${longShiur}~s0@yi`]);
    expect([...index.vectors.keys()].sort()).toEqual([`${row.id}@en`, `${row.id}@yi`]);
  });

  it("a dry run sends nothing and saves no state", async () => {
    const { index, ai, store } = setup();
    const r = await syncVectors(index, ai, store, miniMoments(), { dryRun: true });
    expect(r.upserted).toBeGreaterThan(0);
    expect(index.upsertCalls + ai.calls + store.puts).toBe(0);
  });

  it("state survives a failing upsert: what was written is remembered", async () => {
    const { ai, store } = setup();
    const index = new MemoryVectorIndex("idx", 32);
    let n = 0;
    const flaky = Object.assign(Object.create(index) as MemoryVectorIndex, {
      upsert: async (v: Parameters<MemoryVectorIndex["upsert"]>[0]) => {
        if (n++ === 1) throw new Error("boom");
        return index.upsert(v);
      },
    });
    const rows = miniMoments();
    await expect(syncVectors(flaky, ai, store, rows, { upsertBatch: 50 })).rejects.toThrow("boom");
    expect(Object.keys((await loadState(store, "idx"))!.vectors)).toHaveLength(50);
    const r = await syncVectors(index, ai, store, rows, { upsertBatch: 50 });
    expect(r.upserted).toBe(wantedUnits(rows).units.length - 50);
  });

  it("vector metadata NDJSON holds ids and contract metadata only", () => {
    const lines = vectorMetadataNdjson(miniMoments()).trim().split("\n").map((l) => JSON.parse(l) as Record<string, unknown>);
    for (const l of lines) {
      expect(Object.keys(l).sort()).toEqual(["id", "metadata"]);
      expect(Object.keys(l["metadata"] as object).every((k) => ["shiurId", "t", "hash", "audio_lang", "kind", "category", "year"].includes(k))).toBe(true);
    }
  });
});
