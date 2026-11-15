/**
 * "Same idea elsewhere" (W4.4): the brute-force kernel against a naive reference, never a
 * same-shiur neighbour, the threshold, determinism across worker counts and runs, the embedding
 * cache reader (W3.10 layout) and the lexical fallback, the emit wiring on the mini corpus, and the
 * CI time budget projected to the full-corpus size.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { cacheKey, encodeF16 } from "@emunas/api/sync/embed";
import type { ShiurFile } from "../app/data/types.ts";
import { readCorpusInput } from "./corpus-input.ts";
import { emitLiveData } from "./emit.ts";
import {
  NEIGHBOR_DEFAULTS,
  DirBlobReader,
  buildNeighbors,
  computeNeighbors,
  lexicalVectors,
  neighborUnits,
  siblingSeriesId,
  twinShiurim,
  vectorsFromCache,
  type BlobReader,
  type NeighborUnit,
  type TwinInput,
  type VectorizedUnits,
} from "./neighbors.ts";
import { validateFile } from "./schemas.ts";
import { GENERATED_AT, MINI_DATA, MINI_POLICY, buildCorpusTo, tmp } from "./test-helpers.ts";

/** Deterministic PRNG (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * `shiurim` shiurim with 1–`maxPer` moments each; vectors are noisy copies of a few shared topic
 * directions, so there are real near neighbours across shiurim (and inside them).
 */
function synthetic(shiurim: number, maxPer: number, dims: number, seed = 1): VectorizedUnits {
  const r = rng(seed);
  const topics = Array.from({ length: 12 }, () => Array.from({ length: dims }, () => r() - 0.5));
  const units: NeighborUnit[] = [];
  const rows: number[][] = [];
  for (let s = 0; s < shiurim; s++) {
    const n = 1 + Math.floor(r() * maxPer);
    for (let m = 0; m < n; m++) {
      const topic = topics[Math.floor(r() * topics.length)] as number[];
      const v = topic.map((x) => x + (r() - 0.5) * 0.9);
      const norm = Math.hypot(...v);
      rows.push(v.map((x) => x / norm));
      units.push({ momentId: `s${String(s).padStart(4, "0")}~i${m}`, shiurId: `s${String(s).padStart(4, "0")}`, t: m * 10, texts: [] });
    }
  }
  const matrix = new Float32Array(units.length * dims);
  rows.forEach((row, i) => matrix.set(row, i * dims));
  return { source: "embeddings", model: "test", dims, units, matrix, missing: [] };
}

/** The obvious O(n²) implementation the kernel must agree with. */
function reference(v: VectorizedUnits, threshold: number, perShiur: number, twins: ReadonlyMap<string, ReadonlySet<string>> = new Map()) {
  const n = v.units.length;
  const dot = (i: number, j: number) => {
    let s = 0;
    for (let x = 0; x < v.dims; x++) s += (v.matrix[i * v.dims + x] as number) * (v.matrix[j * v.dims + x] as number);
    return s;
  };
  const byShiur = new Map<string, { shiurId: string; momentId: string; s: number; j: number }[]>();
  for (let i = 0; i < n; i++) {
    const ui = v.units[i] as NeighborUnit;
    const list = byShiur.get(ui.shiurId) ?? [];
    for (let j = 0; j < n; j++) {
      const uj = v.units[j] as NeighborUnit;
      if (uj.shiurId === ui.shiurId || twins.get(ui.shiurId)?.has(uj.shiurId)) continue;
      const s = dot(Math.min(i, j), Math.max(i, j));
      if (s < threshold) continue;
      const cur = list.find((x) => x.shiurId === uj.shiurId);
      if (!cur) list.push({ shiurId: uj.shiurId, momentId: uj.momentId, s, j });
      else if (s > cur.s || (s === cur.s && j < cur.j)) Object.assign(cur, { momentId: uj.momentId, s, j });
    }
    byShiur.set(ui.shiurId, list);
  }
  const out = new Map<string, { momentId: string; shiurId: string; score: number }[]>();
  for (const [sid, list] of byShiur) {
    const top = list.sort((a, b) => b.s - a.s || a.j - b.j).slice(0, perShiur);
    if (top.length > 0) out.set(sid, top.map((x) => ({ momentId: x.momentId, shiurId: x.shiurId, score: Math.round(x.s * 1000) / 1000 })));
  }
  return out;
}

const strip = (m: Map<string, { momentId: string; shiurId: string; score: number }[]>) =>
  new Map([...m].map(([k, xs]) => [k, xs.map(({ momentId, shiurId, score }) => ({ momentId, shiurId, score }))]));

describe("computeNeighbors (kernel)", () => {
  const v = synthetic(60, 7, 48);
  const threshold = 0.55;

  it("agrees with the naive reference, in this thread and with workers", async () => {
    const expected = reference(v, threshold, NEIGHBOR_DEFAULTS.perShiur);
    expect(expected.size).toBeGreaterThan(30);
    const one = await computeNeighbors(v, { threshold, workers: 1 });
    expect(strip(one.byShiur)).toEqual(expected);
    const three = await computeNeighbors(v, { threshold, workers: 3 });
    expect(three.byShiur).toEqual(one.byShiur);
    expect(three.byMoment).toEqual(one.byMoment);
  });

  it("never lists the same shiur, lists each other shiur once, respects the threshold and the cap", async () => {
    const r = await computeNeighbors(v, { threshold, workers: 2 });
    for (const [sid, list] of r.byShiur) {
      expect(list.length).toBeLessThanOrEqual(NEIGHBOR_DEFAULTS.perShiur);
      expect(list.every((n) => n.shiurId !== sid)).toBe(true);
      expect(new Set(list.map((n) => n.shiurId)).size).toBe(list.length);
      expect(list.every((n) => n.score >= threshold)).toBe(true);
      expect(list.map((n) => n.score)).toEqual([...list.map((n) => n.score)].sort((a, b) => b - a));
    }
    for (const [mid, list] of r.byMoment) {
      const sid = mid.split("~")[0];
      expect(list.every((n) => n.shiurId !== sid && n.from === mid)).toBe(true);
    }
  });

  it("finds nothing when every moment is from one shiur, or when the threshold is above 1", async () => {
    const same: VectorizedUnits = { ...v, units: v.units.map((u) => ({ ...u, shiurId: "only" })) };
    expect((await computeNeighbors(same, { threshold: -1, workers: 2 })).byShiur.size).toBe(0);
    expect((await computeNeighbors(v, { threshold: 1.01, workers: 1 })).byShiur.size).toBe(0);
    const empty: VectorizedUnits = { ...v, units: [], matrix: new Float32Array(0) };
    expect((await computeNeighbors(empty, { threshold: 0, workers: 4 })).byShiur.size).toBe(0);
  });

  it("identical vectors tie-break on row order, so the result does not depend on the worker split", async () => {
    const dims = 8;
    const units: NeighborUnit[] = ["a", "b", "c", "d", "e", "f", "g"].map((s) => ({ momentId: `${s}~s0`, shiurId: s, t: 1, texts: [] }));
    const matrix = new Float32Array(units.length * dims);
    for (let i = 0; i < units.length; i++) matrix[i * dims] = 1;
    const tie: VectorizedUnits = { source: "lexical", model: "t", dims, units, matrix, missing: [] };
    const r1 = await computeNeighbors(tie, { threshold: 0.5, workers: 1 });
    const r2 = await computeNeighbors(tie, { threshold: 0.5, workers: 2 });
    expect(r1.byShiur).toEqual(r2.byShiur);
    expect(r1.byShiur.get("a")?.map((n) => n.shiurId)).toEqual(["b", "c", "d", "e", "f"]);
    expect(r1.byShiur.get("g")?.map((n) => n.shiurId)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("never lists a shiur's twin, and otherwise agrees with the reference (any worker split)", async () => {
    // Twin every shiur with its strongest neighbour, so the exclusion changes the lists.
    const plain = await computeNeighbors(v, { threshold, workers: 1 });
    const twins = new Map<string, Set<string>>();
    const link = (a: string, b: string) => {
      twins.set(a, (twins.get(a) ?? new Set()).add(b));
      twins.set(b, (twins.get(b) ?? new Set()).add(a));
    };
    for (const [sid, list] of plain.byShiur) if (list[0]) link(sid, list[0].shiurId);
    expect(twins.size).toBeGreaterThan(10);
    const one = await computeNeighbors(v, { threshold, workers: 1, twins });
    expect(strip(one.byShiur)).toEqual(reference(v, threshold, NEIGHBOR_DEFAULTS.perShiur, twins));
    expect(one.byShiur).not.toEqual(plain.byShiur);
    const four = await computeNeighbors(v, { threshold, workers: 4, twins });
    expect(four.byShiur).toEqual(one.byShiur);
    expect(four.byMoment).toEqual(one.byMoment);
    for (const [sid, list] of one.byShiur) for (const n of list) expect(twins.get(sid)?.has(n.shiurId) ?? false).toBe(false);
    for (const [mid, list] of one.byMoment) {
      const sid = mid.split("~")[0] as string;
      for (const n of list) expect(twins.get(sid)?.has(n.shiurId) ?? false).toBe(false);
    }
  });

  it("stays within the CI budget (< 3 min) projected to 18,000 moments × 1,024 dims", async () => {
    const dims = 1024;
    const v2 = synthetic(400, 11, dims, 7);
    const n = v2.units.length;
    const t0 = performance.now();
    await computeNeighbors(v2, { threshold: 0.5 });
    const ms = performance.now() - t0;
    // Work grows with the number of pairs.
    const projected = ms * ((18_000 * 17_999) / (n * (n - 1)));
    expect(projected).toBeLessThan(180_000);
  });
});

describe("other-language twins", () => {
  const part = (id: string, series: string | null, order: number | null, perek: string | null = null): TwinInput => ({
    id,
    series: series === null ? null : { id: series, order, count: 9 },
    perek,
  });

  it("pairs series by the W2.1 rule", () => {
    expect(siblingSeriesId("emunah-yi")).toBe("emunah-en");
    expect(siblingSeriesId("tanya-en")).toBe("tanya-yi");
    expect(siblingSeriesId("current-bachurim-5773")).toBeNull();
  });

  it("matches the same order, or a shared perek; symmetric; nothing without a sibling series", () => {
    const t = twinShiurim([
      part("yi-emunah-1-01", "emunah-yi", 1),
      part("yi-emunah-1-02", "emunah-yi", 2),
      part("en-emunah-en-01", "emunah-en", 1),
      part("en-emunah-en-03", "emunah-en", 3),
      part("yi-tanya-1-01", "tanya-yi", 2, "א"),
      part("yi-tanya-1-06", "tanya-yi", 7, "ב"),
      part("yi-tanya-1-09", "tanya-yi", 10, "ג"),
      part("yi-tanya-2-01", "tanya-yi", 1, "הקדמה"),
      part("en-tanya-en-03", "tanya-en", 3, "א-ב"),
      part("en-tanya-en-07", "tanya-en", 7, "ג"),
      part("en-tanya-en-99", "tanya-en", 1, null),
      part("yi-shonos-01", null, null),
      part("x-current-01", "current-bachurim-5773", 1),
    ]);
    const of = (id: string) => [...(t.get(id) ?? [])].sort();
    expect(of("yi-emunah-1-01")).toEqual(["en-emunah-en-01"]);
    expect(of("en-emunah-en-01")).toEqual(["yi-emunah-1-01"]);
    expect(of("yi-emunah-1-02")).toEqual([]);
    expect(of("en-emunah-en-03")).toEqual([]);
    expect(of("en-tanya-en-03")).toEqual(["yi-tanya-1-01", "yi-tanya-1-06"]);
    expect(of("yi-tanya-1-09")).toEqual(["en-tanya-en-07"]);
    // A part with a perek never twins one without, whatever the order.
    expect(of("yi-tanya-2-01")).toEqual([]);
    expect(of("en-tanya-en-99")).toEqual([]);
    expect(of("yi-shonos-01")).toEqual([]);
    expect(of("x-current-01")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------

const corpusDir = buildCorpusTo(MINI_DATA, MINI_POLICY);
const input = readCorpusInput(corpusDir);
const units = neighborUnits(input.shiurim);

describe("neighbour units and vector sources (mini corpus)", () => {
  it("units are the sections and insights of full shiurim, sorted, with the sync's texts", () => {
    expect(units.length).toBeGreaterThan(50);
    const full = new Set(input.shiurim.filter((s) => s.status === "full").map((s) => s.id));
    for (const u of units) {
      expect(full.has(u.shiurId)).toBe(true);
      expect(u.momentId.startsWith(`${u.shiurId}~`)).toBe(true);
      expect(u.momentId).toMatch(/~(s|i)\d+$/);
      expect(u.texts.length).toBeGreaterThan(0);
    }
    const keys = units.map((u) => `${u.shiurId} ${u.momentId}`);
    expect(keys).toEqual([...keys].sort());
  });

  it("lexical vectors are unit length and deterministic", () => {
    const a = lexicalVectors(units);
    const b = lexicalVectors(units);
    expect(a.matrix).toEqual(b.matrix);
    for (let i = 0; i < a.units.length; i++) {
      let s = 0;
      for (let x = 0; x < a.dims; x++) s += (a.matrix[i * a.dims + x] as number) ** 2;
      expect(Math.abs(s - 1)).toBeLessThan(1e-5);
    }
  });

  it("reads the W3.10 embedding cache layout; moments without cached texts are left out", async () => {
    const dims = 16;
    const model = "@cf/test/model";
    const root = tmp();
    const r = rng(3);
    // Cache every text except those of the first unit.
    const skipped = new Set(units[0]?.texts);
    for (const text of new Set(units.flatMap((u) => u.texts))) {
      if (skipped.has(text)) continue;
      const p = join(root, cacheKey(model, text));
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, encodeF16(Array.from({ length: dims }, () => r() - 0.5)));
    }
    const v = await vectorsFromCache(units, new DirBlobReader(root), model);
    expect(v.dims).toBe(dims);
    expect(v.missing).toEqual([units[0]?.momentId]);
    expect(v.units.length).toBe(units.length - 1);
    const again = await vectorsFromCache(units, new DirBlobReader(root), model);
    expect(again.matrix).toEqual(v.matrix);
  });

  it("auto falls back to lexical without a cache or with a thin one; embeddings mode needs a cache", async () => {
    const none = await buildNeighbors(input.shiurim, { mode: "auto", cache: null, workers: 1 });
    expect(none.report.source).toBe("lexical");
    expect(none.report.fallbackReason).toMatch(/no embedding cache/);
    const emptyStore: BlobReader = { name: "empty", get: async () => null };
    const thin = await buildNeighbors(input.shiurim, { mode: "auto", cache: emptyStore, workers: 1 });
    expect(thin.report.source).toBe("lexical");
    expect(thin.report.fallbackReason).toMatch(/covers 0\.0%/);
    await expect(buildNeighbors(input.shiurim, { mode: "embeddings", cache: null })).rejects.toThrow(/needs an embedding cache/);
    await expect(buildNeighbors(input.shiurim, { mode: "embeddings", cache: emptyStore })).rejects.toThrow(/no .* vectors/);
    const off = await buildNeighbors(input.shiurim, { mode: "off" });
    expect(off.byShiur.size).toBe(0);
  });

  it("auto uses a complete cache", async () => {
    const dims = 8;
    const model = "@cf/test/full";
    const blobs = new Map<string, Uint8Array>();
    const r = rng(5);
    for (const text of new Set(units.flatMap((u) => u.texts))) {
      blobs.set(cacheKey(model, text), encodeF16(Array.from({ length: dims }, () => r() - 0.5)));
    }
    const store: BlobReader = { name: "memory", get: async (k) => blobs.get(k) ?? null };
    const b = await buildNeighbors(input.shiurim, { mode: "auto", cache: store, model, threshold: 0, workers: 2 });
    expect(b.report.source).toBe("embeddings");
    expect(b.report.vectors).toBe(units.length);
    expect(b.byShiur.size).toBeGreaterThan(0);
  });
});

describe("emit with neighbours (mini corpus, lexical)", async () => {
  const built = await buildNeighbors(input.shiurim, { mode: "lexical", workers: 2 });
  const files = emitLiveData(input, { generatedAt: GENERATED_AT, neighbors: built });
  const shiurFiles = [...files].filter(([f]) => f.startsWith("shiur/")).map(([, b]) => b as ShiurFile);
  const byId = new Map(shiurFiles.map((s) => [s.id, s]));

  it("fills related.neighbors for some shiurim, and every file still validates", () => {
    expect(built.byShiur.size).toBeGreaterThan(5);
    expect(shiurFiles.filter((s) => s.related.neighbors.length > 0).length).toBe(built.byShiur.size);
    for (const [f, body] of files) expect(validateFile(f, body)).toBeNull();
  });

  it("never points into the same shiur or its twin; every neighbour is a real section or insight at its time", () => {
    const twins = twinShiurim(input.shiurim);
    for (const s of shiurFiles) {
      for (const n of s.related.neighbors) {
        expect(n.shiurId).not.toBe(s.id);
        expect(twins.get(s.id)?.has(n.shiurId) ?? false).toBe(false);
        const target = byId.get(n.shiurId);
        expect(target?.status).toBe("full");
        const moments = [...(target?.notes?.chapters ?? []), ...(target?.notes?.insights ?? [])];
        const m = moments.find((x) => x.id === n.momentId);
        expect(m).toBeDefined();
        expect(n.t).toBe(m?.t);
        expect(n.score).toBeGreaterThanOrEqual(NEIGHBOR_DEFAULTS.threshold.lexical);
        expect(n.score).toBeLessThanOrEqual(1.0001);
      }
      if (s.status !== "full") expect(s.related.neighbors).toEqual([]);
    }
  });

  it("is deterministic: an unchanged corpus gives the same lists, fingerprint and build id", async () => {
    const again = await buildNeighbors(readCorpusInput(corpusDir).shiurim, { mode: "lexical", workers: 3 });
    expect(again.byShiur).toEqual(built.byShiur);
    expect(again.fingerprint).toBe(built.fingerprint);
    const files2 = emitLiveData(input, { generatedAt: GENERATED_AT, neighbors: again });
    expect(JSON.stringify([...files2])).toBe(JSON.stringify([...files]));
  });

  it("the neighbour lists change the build id; without them the lists are empty", () => {
    const plain = emitLiveData(input, { generatedAt: GENERATED_AT });
    const id = (fs: typeof files) => (fs.get("build.json") as { buildId: string }).buildId;
    expect(id(plain)).not.toBe(id(files));
    for (const [f, b] of plain) if (f.startsWith("shiur/")) expect((b as ShiurFile).related.neighbors).toEqual([]);
  });
});
