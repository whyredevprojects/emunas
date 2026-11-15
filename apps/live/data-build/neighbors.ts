/**
 * "Same idea elsewhere" (W4.4, tech-live §5.4 end, concept-live §8): for every section and insight
 * of every summarized shiur, its nearest moments in *other* shiurim by cosine similarity, and per
 * shiur the best five other shiurim (one moment each) above a threshold, written into
 * `shiur/<id>.json` `related.neighbors` by the emit. The listening room labels them as a
 * suggestion ("Suggested by similarity of the notes").
 *
 * Vectors come from one of two sources:
 *
 * - `embeddings`: the W3.10 embedding cache (`emb/<model>/<sha256(text)>.f16`, little-endian half
 *   floats), keyed by exactly the texts the Vectorize sync embeds (`toVectorUnits` of the
 *   search-core moment rows). A moment's vector is the normalized mean of its per-language
 *   vectors. Nothing is embedded here: a moment whose texts are not cached is left out (reported).
 * - `lexical`: a deterministic fallback with no model and no account: TF-IDF over the folded tokens
 *   (`@emunas/normalize` `foldTokens`) of the same texts, feature-hashed into a dense vector.
 *   Shared rare words make moments close; it has no cross-language understanding.
 *
 * Only generated text is used (section titles/summaries and insights from the public contract);
 * the output holds ids, times and scores, never text.
 *
 * A shiur's other-language twin (`twinShiurim`: the part at the same place of the same series in
 * the other audio language) is never its neighbour either: the listening room already links that
 * series, and a near-translation would crowd out real "elsewhere" moments.
 *
 * Search is brute force (no index): rows are grouped in fours, each pair of moments is scored
 * once, and the work is split over worker threads. For each moment it keeps the best moment of
 * each other shiur and the top `perMoment` such shiurim; the per-shiur list (top `perShiur`
 * distinct other shiurim) is taken from those lists, which provably contain it. Every pair is
 * computed by the same code path whatever the number of workers, ties break on row order (sorted
 * ids) and scores are rounded, so an unchanged corpus and cache give byte-identical output.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import type { PublicShiur } from "@emunas/corpus/public";
import { foldTokens } from "@emunas/normalize/fold";
import type { MomentRow } from "@emunas/search-core";
import { buildMomentRows } from "@emunas/search-core/build";
// The W3.10 sync's text composition and cache format, so this step reads exactly the vectors the
// Vectorize sync wrote (one implementation of "which text is embedded" and of the f16 blobs).
import { cacheKey, decodeF16, modelSlug } from "@emunas/api/sync/embed";
import { toVectorUnits } from "@emunas/api/sync/rows";
import type { ShiurRelated } from "../app/data/types.ts";

export type Neighbor = ShiurRelated["neighbors"][number];

/** Bump when the neighbour logic changes its output for the same input (part of the emit's buildId). */
export const NEIGHBORS_VERSION = 2;

/** Moment kinds that get neighbours and can be neighbours (tech-live §5.4). */
export const NEIGHBOR_KINDS: readonly MomentRow["kind"][] = ["section", "insight"];

export const NEIGHBOR_DEFAULTS = {
  /** Other shiurim listed per shiur in `related.neighbors`. */
  perShiur: 5,
  /** Other shiurim kept per moment (the per-shiur list is drawn from these). */
  perMoment: 5,
  /**
   * Minimum cosine similarity. Per source; the embedding value is a starting point for bge-m3
   * and must be checked against the W3.10 eval run (see README) before launch.
   */
  threshold: { embeddings: 0.75, lexical: 0.3 } as Record<NeighborSourceKind, number>,
  /** Scores in the output are rounded to this many decimals. */
  scoreDecimals: 3,
  /** Dimensions of the lexical fallback's hashed vectors. */
  lexicalDims: 1024,
  /** `auto` uses the embedding cache only when at least this share of moments has a vector. */
  minCoverage: 0.95,
} as const;

export type NeighborSourceKind = "embeddings" | "lexical";

/** One moment that takes part: a section or insight of a summarized shiur. */
export interface NeighborUnit {
  momentId: string;
  shiurId: string;
  t: number;
  /** Texts exactly as the Vectorize sync embeds them, one per language the moment has. */
  texts: string[];
}

/** Units of every full shiur, sorted by (shiurId, momentId) so row order (the tie-break) is stable. */
export function neighborUnits(shiurim: readonly PublicShiur[]): NeighborUnit[] {
  const kinds = new Set(NEIGHBOR_KINDS);
  const units: NeighborUnit[] = [];
  for (const s of shiurim) {
    for (const row of buildMomentRows(s)) {
      if (!kinds.has(row.kind)) continue;
      const texts = toVectorUnits(row).map((u) => u.text).filter((x) => x.length > 0);
      if (texts.length > 0) units.push({ momentId: row.id, shiurId: row.shiurId, t: row.t, texts });
    }
  }
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return units.sort((a, b) => cmp(a.shiurId, b.shiurId) || cmp(a.momentId, b.momentId));
}

// ---------------------------------------------------------------------------------------------
// Other-language twins

/** The same series in the other audio language, by W2.1's pairing rule (`<base>-yi` ↔ `<base>-en`). */
export function siblingSeriesId(seriesId: string): string | null {
  const m = /^(.*)-(yi|en)$/u.exec(seriesId);
  return m ? `${m[1]}-${m[2] === "yi" ? "en" : "yi"}` : null;
}

/** The pereks a part covers: `"א-ב"` → `["א", "ב"]` (quote marks and spaces dropped). */
function perekParts(perek: string): string[] {
  return perek
    .split(/[-–—]/u)
    .map((p) => p.replace(/["'״׳\s]/gu, ""))
    .filter((p) => p.length > 0);
}

export type TwinInput = Pick<PublicShiur, "id" | "series" | "perek">;

/**
 * Each shiur's other-language twins (symmetric): the parts of the sibling series (`siblingSeriesId`,
 * present in the input) at the same place. Where both parts carry a perek, "the same place" is a
 * shared perek (Tanya: `א-ב` meets `א` and `ב`); where neither does, the same `seriesOrder`; a part
 * with a perek never twins one without. Shiurim outside a series with a sibling have none.
 */
export function twinShiurim(shiurim: readonly TwinInput[]): Map<string, Set<string>> {
  const bySeries = new Map<string, TwinInput[]>();
  for (const s of shiurim) {
    if (!s.series) continue;
    const xs = bySeries.get(s.series.id) ?? [];
    xs.push(s);
    bySeries.set(s.series.id, xs);
  }
  const out = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    for (const [x, y] of [
      [a, b],
      [b, a],
    ] as const) {
      const set = out.get(x) ?? new Set<string>();
      set.add(y);
      out.set(x, set);
    }
  };
  for (const [seriesId, parts] of bySeries) {
    // Each pair of series once: the "-en" side looks at its "-yi" sibling.
    const sibling = siblingSeriesId(seriesId);
    if (sibling === null || !seriesId.endsWith("-en")) continue;
    const others = bySeries.get(sibling);
    if (!others) continue;
    for (const a of parts) {
      const pa = a.perek === null ? null : new Set(perekParts(a.perek));
      for (const b of others) {
        if (pa !== null && b.perek !== null) {
          if (perekParts(b.perek).some((p) => pa.has(p))) link(a.id, b.id);
        } else if (pa === null && b.perek === null) {
          const oa = a.series?.order ?? null;
          if (oa !== null && oa === (b.series?.order ?? null)) link(a.id, b.id);
        }
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Vector sources

export interface VectorizedUnits {
  source: NeighborSourceKind;
  /** Model id (embeddings) or a description of the lexical scheme; part of the build id. */
  model: string;
  dims: number;
  /** Units that have a vector, in input order. */
  units: NeighborUnit[];
  /** Row-major, L2-normalized, `units.length × dims`. */
  matrix: Float32Array;
  /** Units left out (no cached vector, or an empty lexical vector). */
  missing: string[];
}

/** Read-only view of a blob store: a local folder here, R2 (`R2S3Store` of the W3.10 sync) in CI. */
export interface BlobReader {
  readonly name: string;
  get(key: string): Promise<Uint8Array | null>;
}

/** The cache folder layout of the W3.10 sync's `FsBlobStore` (`<root>/emb/<model>/<hash>.f16`). */
export class DirBlobReader implements BlobReader {
  readonly name: string;
  constructor(private root: string) {
    this.name = `folder ${root}`;
  }
  async get(key: string): Promise<Uint8Array | null> {
    if (key.split("/").some((p) => p === ".." || p === "")) throw new Error(`bad cache key ${key}`);
    const p = join(this.root, key);
    return existsSync(p) ? new Uint8Array(readFileSync(p)) : null;
  }
}

/** True when `root` holds a cache folder for `model`. */
export function hasEmbeddingCache(root: string, model: string): boolean {
  return existsSync(join(root, "emb", modelSlug(model)));
}

function normalizeInto(out: Float32Array, offset: number, v: Float64Array): boolean {
  let n = 0;
  for (let k = 0; k < v.length; k++) n += (v[k] as number) * (v[k] as number);
  if (!(n > 0)) return false;
  const inv = 1 / Math.sqrt(n);
  for (let k = 0; k < v.length; k++) out[offset + k] = (v[k] as number) * inv;
  return true;
}

/**
 * Vectors from the embedding cache. A unit's vector is the normalized mean of the vectors of its
 * texts that are cached; a unit with none is `missing`. Blobs whose length differs from the first
 * one found are ignored (another model's dims).
 */
export async function vectorsFromCache(
  units: readonly NeighborUnit[],
  store: BlobReader,
  model: string,
  opts: { concurrency?: number } = {},
): Promise<VectorizedUnits> {
  const texts = [...new Set(units.flatMap((u) => u.texts))];
  const blobs = new Map<string, Uint8Array>();
  let next = 0;
  const concurrency = Math.max(1, opts.concurrency ?? 32);
  await Promise.all(
    Array.from({ length: Math.min(concurrency, texts.length) }, async () => {
      while (next < texts.length) {
        const text = texts[next++] as string;
        const b = await store.get(cacheKey(model, text));
        if (b !== null && b.byteLength > 0 && b.byteLength % 2 === 0) blobs.set(text, b);
      }
    }),
  );
  // Dims: the most common blob length (ties → smaller), so one stray blob cannot decide it.
  const lengths = new Map<number, number>();
  for (const b of blobs.values()) lengths.set(b.byteLength, (lengths.get(b.byteLength) ?? 0) + 1);
  const best = [...lengths].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
  const dims = best ? best[0] / 2 : 0;
  const kept: NeighborUnit[] = [];
  const missing: string[] = [];
  const rows: Float32Array[] = [];
  for (const u of units) {
    const sum = new Float64Array(dims);
    let n = 0;
    for (const text of u.texts) {
      const b = blobs.get(text);
      if (!b || b.byteLength !== dims * 2) continue;
      const v = decodeF16(b);
      let norm = 0;
      for (const x of v) norm += x * x;
      if (!(norm > 0)) continue;
      const inv = 1 / Math.sqrt(norm);
      for (let k = 0; k < dims; k++) sum[k] = (sum[k] as number) + (v[k] as number) * inv;
      n++;
    }
    const row = new Float32Array(dims);
    if (n > 0 && normalizeInto(row, 0, sum)) {
      kept.push(u);
      rows.push(row);
    } else missing.push(u.momentId);
  }
  return { source: "embeddings", model, dims, units: kept, matrix: stack(rows, dims), missing };
}

function stack(rows: readonly Float32Array[], dims: number): Float32Array {
  const m = new Float32Array(rows.length * dims);
  rows.forEach((r, i) => m.set(r, i * dims));
  return m;
}

/** FNV-1a (32-bit) over UTF-16 code units. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

/**
 * The lexical fallback: per unit, the folded tokens (≥ 2 characters) of all its texts; weight
 * (1 + ln tf) · ln(N / df), hashed into `dims` buckets with a hash-derived sign, L2-normalized.
 * Tokens found in a single unit cannot connect two moments and are skipped.
 */
export function lexicalVectors(units: readonly NeighborUnit[], dims: number = NEIGHBOR_DEFAULTS.lexicalDims): VectorizedUnits {
  const tfs = units.map((u) => {
    const tf = new Map<string, number>();
    for (const text of u.texts) for (const tok of foldTokens(text)) if (tok.length >= 2) tf.set(tok, (tf.get(tok) ?? 0) + 1);
    return tf;
  });
  const df = new Map<string, number>();
  for (const tf of tfs) for (const tok of tf.keys()) df.set(tok, (df.get(tok) ?? 0) + 1);
  const n = units.length;
  const kept: NeighborUnit[] = [];
  const missing: string[] = [];
  const rows: Float32Array[] = [];
  units.forEach((u, i) => {
    const v = new Float64Array(dims);
    // Sorted tokens: the float sums are taken in a fixed order.
    for (const tok of [...(tfs[i] as Map<string, number>).keys()].sort()) {
      const d = df.get(tok) as number;
      if (d < 2) continue;
      const idf = Math.log(n / d);
      if (!(idf > 0)) continue;
      const w = (1 + Math.log((tfs[i] as Map<string, number>).get(tok) as number)) * idf;
      const h = fnv1a(tok);
      const k = (h & 0x7fffffff) % dims;
      v[k] = (v[k] as number) + (h & 0x80000000 ? -w : w);
    }
    const row = new Float32Array(dims);
    if (normalizeInto(row, 0, v)) {
      kept.push(u);
      rows.push(row);
    } else missing.push(u.momentId);
  });
  return { source: "lexical", model: `lexical/tfidf-fnv1a-${dims}`, dims, units: kept, matrix: stack(rows, dims), missing };
}

// ---------------------------------------------------------------------------------------------
// Brute-force kernel (runs in worker threads; must stay self-contained: no imports, no closures)

/**
 * Scores every pair of rows of `matrix` (rows padded to a multiple of 4; padding rows have group
 * -1) whose groups differ and are not twins (`twinGroup[twinStart[g] … twinStart[g + 1])` lists the
 * groups twinned with group `g`; both empty = no twins), for the row quads `first, first + stride, …`, and keeps per row the
 * best row of each other group and the top `k` groups by (score desc, row asc). Pairs inside a
 * quad and pairs (quad row, later row) are each computed exactly once, always the same way.
 */
export function neighborKernel(
  matrix: Float32Array,
  group: Int32Array,
  dims: number,
  k: number,
  threshold: number,
  first: number,
  stride: number,
  outScore: Float64Array,
  outRow: Int32Array,
  outGroup: Int32Array,
  twinStart: Int32Array,
  twinGroup: Int32Array,
): void {
  const rows = group.length;
  const twins = (gi: number, gj: number): boolean => {
    const end = twinStart[gi + 1] as number;
    for (let x = twinStart[gi] as number; x < end; x++) if (twinGroup[x] === gj) return true;
    return false;
  };
  const better = (s: number, j: number, s2: number, j2: number): boolean => s > s2 || (s === s2 && j2 >= 0 && j < j2);
  const insert = (row: number, s: number, j: number): void => {
    const base = row * k;
    const g = group[j] as number;
    let p = -1;
    for (let x = 0; x < k; x++) {
      if (outGroup[base + x] === g) {
        p = x;
        break;
      }
    }
    if (p >= 0) {
      if (!better(s, j, outScore[base + p] as number, outRow[base + p] as number)) return;
      for (let x = p; x < k - 1; x++) {
        outScore[base + x] = outScore[base + x + 1] as number;
        outRow[base + x] = outRow[base + x + 1] as number;
        outGroup[base + x] = outGroup[base + x + 1] as number;
      }
      outScore[base + k - 1] = -Infinity;
      outRow[base + k - 1] = -1;
      outGroup[base + k - 1] = -1;
    } else if (!better(s, j, outScore[base + k - 1] as number, outRow[base + k - 1] as number)) {
      return;
    }
    let x = k - 1;
    while (x > 0 && better(s, j, outScore[base + x - 1] as number, outRow[base + x - 1] as number)) {
      outScore[base + x] = outScore[base + x - 1] as number;
      outRow[base + x] = outRow[base + x - 1] as number;
      outGroup[base + x] = outGroup[base + x - 1] as number;
      x--;
    }
    outScore[base + x] = s;
    outRow[base + x] = j;
    outGroup[base + x] = g;
  };
  const pair = (i: number, j: number, s: number): void => {
    if (s < threshold) return;
    if (twinGroup.length > 0 && twins(group[i] as number, group[j] as number)) return;
    insert(i, s, j);
    insert(j, s, i);
  };
  const quads = rows / 4;
  for (let q = first; q < quads; q += stride) {
    const r0 = q * 4;
    const a = r0 * dims;
    const b = a + dims;
    const c = b + dims;
    const d = c + dims;
    const g0 = group[r0] as number;
    const g1 = group[r0 + 1] as number;
    const g2 = group[r0 + 2] as number;
    const g3 = group[r0 + 3] as number;
    // Pairs inside the quad.
    for (let i = r0; i < r0 + 4; i++) {
      const gi = group[i] as number;
      if (gi < 0) continue;
      for (let j = i + 1; j < r0 + 4; j++) {
        const gj = group[j] as number;
        if (gj < 0 || gj === gi) continue;
        let s = 0;
        const io = i * dims;
        const jo = j * dims;
        for (let x = 0; x < dims; x++) s += (matrix[io + x] as number) * (matrix[jo + x] as number);
        pair(i, j, s);
      }
    }
    if (g0 < 0 && g1 < 0 && g2 < 0 && g3 < 0) continue;
    // The quad against every later row: one load of the column feeds four sums.
    for (let j = r0 + 4; j < rows; j++) {
      const gj = group[j] as number;
      if (gj < 0) continue;
      if (gj === g0 && gj === g1 && gj === g2 && gj === g3) continue;
      const jo = j * dims;
      let s0 = 0;
      let s1 = 0;
      let s2 = 0;
      let s3 = 0;
      for (let x = 0; x < dims; x++) {
        const v = matrix[jo + x] as number;
        s0 += (matrix[a + x] as number) * v;
        s1 += (matrix[b + x] as number) * v;
        s2 += (matrix[c + x] as number) * v;
        s3 += (matrix[d + x] as number) * v;
      }
      if (g0 >= 0 && g0 !== gj) pair(r0, j, s0);
      if (g1 >= 0 && g1 !== gj) pair(r0 + 1, j, s1);
      if (g2 >= 0 && g2 !== gj) pair(r0 + 2, j, s2);
      if (g3 >= 0 && g3 !== gj) pair(r0 + 3, j, s3);
    }
  }
}

interface KernelOut {
  score: Float64Array;
  row: Int32Array;
  group: Int32Array;
}

function emptyOut(rows: number, k: number): KernelOut {
  return {
    score: new Float64Array(rows * k).fill(-Infinity),
    row: new Int32Array(rows * k).fill(-1),
    group: new Int32Array(rows * k).fill(-1),
  };
}

const WORKER_SOURCE = `
var __name = globalThis.__name || ((f) => f);
const { parentPort, workerData: w } = require("node:worker_threads");
const kernel = ${neighborKernel.toString()};
const matrix = new Float32Array(w.matrix);
const group = new Int32Array(w.group);
const rows = group.length;
const score = new Float64Array(rows * w.k).fill(-Infinity);
const row = new Int32Array(rows * w.k).fill(-1);
const grp = new Int32Array(rows * w.k).fill(-1);
kernel(matrix, group, w.dims, w.k, w.threshold, w.first, w.stride, score, row, grp, w.twinStart, w.twinGroup);
parentPort.postMessage({ score, row, group: grp }, [score.buffer, row.buffer, grp.buffer]);
`;

function runWorker(data: {
  matrix: SharedArrayBuffer;
  group: SharedArrayBuffer;
  dims: number;
  k: number;
  threshold: number;
  first: number;
  stride: number;
  twinStart: Int32Array;
  twinGroup: Int32Array;
}): Promise<KernelOut> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_SOURCE, { eval: true, workerData: data });
    worker.once("message", (m: KernelOut) => {
      resolve(m);
      void worker.terminate();
    });
    worker.once("error", reject);
    worker.once("exit", (code) => {
      if (code !== 0) reject(new Error(`neighbour worker exited with code ${code}`));
    });
  });
}

// ---------------------------------------------------------------------------------------------
// Neighbour lists

export interface MomentNeighbor extends Neighbor {
  /** The moment of this shiur the neighbour was found for. */
  from: string;
}

export interface NeighborOptions {
  threshold: number;
  perShiur?: number;
  perMoment?: number;
  /** Worker threads; 0 or 1 = run in this thread. Default: available cores, at most 8. */
  workers?: number;
  /** shiurId → shiurim that must not be its neighbours (other-language twins, `twinShiurim`). */
  twins?: ReadonlyMap<string, ReadonlySet<string>>;
}

export interface NeighborResult {
  /** Per full shiur that has any neighbour: the `related.neighbors` list (score desc). */
  byShiur: Map<string, Neighbor[]>;
  /** Per moment: the best moment of each of its top `perMoment` other shiurim (score desc). */
  byMoment: Map<string, MomentNeighbor[]>;
  pairsScored: number;
}

const round = (x: number, d: number): number => {
  const f = 10 ** d;
  return Math.round(x * f) / f;
};

export async function computeNeighbors(v: VectorizedUnits, opts: NeighborOptions): Promise<NeighborResult> {
  const perShiur = opts.perShiur ?? NEIGHBOR_DEFAULTS.perShiur;
  const k = Math.max(opts.perMoment ?? NEIGHBOR_DEFAULTS.perMoment, perShiur);
  const n = v.units.length;
  const padded = Math.ceil(n / 4) * 4;
  const shiurIdx = new Map<string, number>();
  const groupShared = new SharedArrayBuffer(padded * 4);
  const group = new Int32Array(groupShared).fill(-1);
  v.units.forEach((u, i) => {
    if (!shiurIdx.has(u.shiurId)) shiurIdx.set(u.shiurId, shiurIdx.size);
    group[i] = shiurIdx.get(u.shiurId) as number;
  });
  // Twins as CSR over the group indices (only shiurim that have moments take part).
  const groups = shiurIdx.size;
  const twinStart = new Int32Array(groups + 1);
  const twinList: number[] = [];
  const idsByGroup = [...shiurIdx.keys()];
  for (let g = 0; g < groups; g++) {
    twinStart[g] = twinList.length;
    for (const t of [...(opts.twins?.get(idsByGroup[g] as string) ?? [])].sort()) {
      const tg = shiurIdx.get(t);
      if (tg !== undefined) twinList.push(tg);
    }
  }
  twinStart[groups] = twinList.length;
  const twinGroup = Int32Array.from(twinList);
  const matrixShared = new SharedArrayBuffer(padded * v.dims * 4);
  new Float32Array(matrixShared).set(v.matrix);
  const matrix = new Float32Array(matrixShared);

  const quads = padded / 4;
  const workers = Math.max(1, Math.min(opts.workers ?? Math.min(8, availableParallelism()), quads || 1));
  let parts: KernelOut[];
  if (workers <= 1 || n === 0) {
    const out = emptyOut(padded, k);
    neighborKernel(matrix, group, v.dims, k, opts.threshold, 0, 1, out.score, out.row, out.group, twinStart, twinGroup);
    parts = [out];
  } else {
    parts = await Promise.all(
      Array.from({ length: workers }, (_, w) =>
        runWorker({
          matrix: matrixShared,
          group: groupShared,
          dims: v.dims,
          k,
          threshold: opts.threshold,
          first: w,
          stride: workers,
          twinStart,
          twinGroup,
        }),
      ),
    );
  }

  // Merge the per-worker lists: best row per group, then top k, by (score desc, row asc).
  const before = (a: { s: number; j: number }, b: { s: number; j: number }) => b.s - a.s || a.j - b.j;
  const byMoment = new Map<string, MomentNeighbor[]>();
  const perRow: { s: number; j: number }[][] = [];
  for (let i = 0; i < n; i++) {
    const best = new Map<number, { s: number; j: number }>();
    for (const p of parts) {
      for (let x = 0; x < k; x++) {
        const j = p.row[i * k + x] as number;
        if (j < 0) continue;
        const c = { s: p.score[i * k + x] as number, j };
        const g = group[j] as number;
        const cur = best.get(g);
        if (!cur || before(c, cur) < 0) best.set(g, c);
      }
    }
    const list = [...best.values()].sort(before).slice(0, k);
    perRow.push(list);
    const u = v.units[i] as NeighborUnit;
    if (list.length > 0) {
      byMoment.set(
        u.momentId,
        list.map(({ s, j }) => {
          const t = v.units[j] as NeighborUnit;
          return { momentId: t.momentId, shiurId: t.shiurId, t: t.t, score: round(s, NEIGHBOR_DEFAULTS.scoreDecimals), from: u.momentId };
        }),
      );
    }
  }

  // Per shiur: the best pair for each other shiur over all its moments' lists, top `perShiur`.
  const byShiur = new Map<string, Neighbor[]>();
  let start = 0;
  while (start < n) {
    const sid = (v.units[start] as NeighborUnit).shiurId;
    let end = start;
    while (end < n && (v.units[end] as NeighborUnit).shiurId === sid) end++;
    const best = new Map<number, { s: number; j: number; i: number }>();
    for (let i = start; i < end; i++) {
      for (const c of perRow[i] as { s: number; j: number }[]) {
        const g = group[c.j] as number;
        const cur = best.get(g);
        if (!cur || before(c, cur) < 0 || (c.s === cur.s && c.j === cur.j && i < cur.i)) best.set(g, { ...c, i });
      }
    }
    const top = [...best.values()].sort(before).slice(0, perShiur);
    if (top.length > 0) {
      byShiur.set(
        sid,
        top.map(({ s, j }) => {
          const t = v.units[j] as NeighborUnit;
          return { momentId: t.momentId, shiurId: t.shiurId, t: t.t, score: round(s, NEIGHBOR_DEFAULTS.scoreDecimals) };
        }),
      );
    }
    start = end;
  }
  return { byShiur, byMoment, pairsScored: (n * (n - 1)) / 2 };
}

// ---------------------------------------------------------------------------------------------
// The step as the data build runs it

export type NeighborMode = "auto" | NeighborSourceKind | "off";

export interface BuildNeighborsOptions {
  mode: NeighborMode;
  /** Embedding cache: a folder in the W3.10 layout, or any reader (R2 in CI). */
  cache?: BlobReader | null;
  /** Embedding model whose cache entries are read (default `@cf/baai/bge-m3`). */
  model?: string;
  /** Override the per-source default threshold. */
  threshold?: number;
  workers?: number;
  log?: (msg: string) => void;
}

export interface NeighborsReport {
  source: NeighborSourceKind | "off";
  model: string | null;
  threshold: number | null;
  units: number;
  vectors: number;
  /** Units without a vector (ids only). */
  missing: number;
  shiurimWithNeighbors: number;
  /** Shiurim with an other-language twin (never listed as each other's neighbour). */
  shiurimWithTwins: number;
  ms: number;
  /** Why `auto` chose the lexical fallback, when it did. */
  fallbackReason?: string;
}

export interface BuiltNeighbors {
  /** shiurId → `related.neighbors`; absent = none. Empty map when off. */
  byShiur: Map<string, Neighbor[]>;
  /** Folded into the emit's buildId: changes whenever the inputs to the lists change. */
  fingerprint: string;
  report: NeighborsReport;
}

/** sha256 over the parameters and the lists themselves (sorted by shiur id). */
export function neighborsFingerprint(byShiur: ReadonlyMap<string, readonly Neighbor[]>, params: unknown): string {
  const h = createHash("sha256").update(JSON.stringify(params));
  for (const id of [...byShiur.keys()].sort()) h.update(`\n${id}\t${JSON.stringify(byShiur.get(id))}`);
  return h.digest("hex").slice(0, 16);
}

export const DEFAULT_EMBED_MODEL = "@cf/baai/bge-m3";

export async function buildNeighbors(shiurim: readonly PublicShiur[], opts: BuildNeighborsOptions): Promise<BuiltNeighbors> {
  const t0 = performance.now();
  const log = opts.log ?? (() => {});
  const units = opts.mode === "off" ? [] : neighborUnits(shiurim);
  if (opts.mode === "off") {
    return {
      byShiur: new Map(),
      fingerprint: "off",
      report: {
        source: "off",
        model: null,
        threshold: null,
        units: 0,
        vectors: 0,
        missing: 0,
        shiurimWithNeighbors: 0,
        shiurimWithTwins: 0,
        ms: 0,
      },
    };
  }
  const model = opts.model ?? DEFAULT_EMBED_MODEL;
  let vectors: VectorizedUnits | null = null;
  let fallbackReason: string | undefined;
  if (opts.mode === "embeddings" || opts.mode === "auto") {
    if (!opts.cache) {
      if (opts.mode === "embeddings") throw new Error("neighbours: --neighbors embeddings needs an embedding cache (--embeddings <dir>)");
      fallbackReason = "no embedding cache given";
    } else {
      const fromCache = await vectorsFromCache(units, opts.cache, model);
      const coverage = units.length === 0 ? 1 : fromCache.units.length / units.length;
      if (opts.mode === "embeddings") {
        if (fromCache.units.length === 0 && units.length > 0) {
          throw new Error(`neighbours: no ${model} vectors in ${opts.cache.name} for any of ${units.length} moments`);
        }
        vectors = fromCache;
      } else if (coverage >= NEIGHBOR_DEFAULTS.minCoverage) {
        vectors = fromCache;
      } else {
        fallbackReason = `${model} cache in ${opts.cache.name} covers ${(coverage * 100).toFixed(1)}% of moments (< ${NEIGHBOR_DEFAULTS.minCoverage * 100}%)`;
      }
    }
  }
  if (vectors === null) {
    if (fallbackReason) log(`neighbours: lexical fallback (${fallbackReason})`);
    vectors = lexicalVectors(units);
  }
  const threshold = opts.threshold ?? NEIGHBOR_DEFAULTS.threshold[vectors.source];
  const twins = twinShiurim(shiurim);
  const nopts: NeighborOptions = { threshold, twins };
  if (opts.workers !== undefined) nopts.workers = opts.workers;
  const result = await computeNeighbors(vectors, nopts);
  const report: NeighborsReport = {
    source: vectors.source,
    model: vectors.model,
    threshold,
    units: units.length,
    vectors: vectors.units.length,
    missing: vectors.missing.length,
    shiurimWithNeighbors: result.byShiur.size,
    shiurimWithTwins: twins.size,
    ms: Math.round(performance.now() - t0),
  };
  if (fallbackReason) report.fallbackReason = fallbackReason;
  log(
    `neighbours (${vectors.source}, ${vectors.model}, threshold ${threshold}): ${vectors.units.length} of ${units.length} moments, ` +
      `${result.byShiur.size} shiurim with neighbours in ${report.ms} ms` +
      (twins.size > 0 ? `; ${twins.size} shiurim with an other-language twin excluded` : "") +
      (vectors.missing.length > 0 ? `; ${vectors.missing.length} moments without a vector` : ""),
  );
  return {
    byShiur: result.byShiur,
    fingerprint: neighborsFingerprint(result.byShiur, [NEIGHBORS_VERSION, vectors.source, vectors.model, threshold]),
    report,
  };
}
