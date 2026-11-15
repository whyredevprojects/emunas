/**
 * Embeddings with a content-addressed cache: `emb/<model>/<sha256(text)>.f16` (little-endian
 * IEEE half floats) in R2 `emunas-site-build` for CI, or a local folder. Only texts whose
 * vector is not cached are sent to the model, so re-running costs nothing and the eval and
 * the neighbours step (W4.4) can reuse the same vectors.
 *
 * Vectors are stored and used as f16-rounded values everywhere (fresh or cached), so an
 * upsert is the same whether its vector came from the model or from the cache.
 */
import { createHash } from "node:crypto";

export interface Embedder {
  /** Model id, e.g. `@cf/baai/bge-m3`. */
  readonly model: string;
  readonly dims: number;
  /** Texts per model call. */
  readonly maxBatch: number;
  embed(texts: readonly string[]): Promise<number[][]>;
}

export interface BlobStore {
  readonly name: string;
  get(key: string): Promise<Uint8Array | null>;
  put(key: string, data: Uint8Array): Promise<void>;
}

// ------------------------------------------------------------------------------- f16

const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);

/** Float32 → IEEE 754 binary16 bits, round to nearest even. */
export function toHalf(value: number): number {
  f32[0] = value;
  const x = u32[0] as number;
  const sign = (x >>> 16) & 0x8000;
  const exp = (x >>> 23) & 0xff;
  let mant = x & 0x7fffff;
  if (exp === 0xff) return sign | 0x7c00 | (mant !== 0 ? 0x200 : 0); // inf / NaN
  const e = exp - 127 + 15;
  if (e >= 0x1f) return sign | 0x7c00; // overflow → inf
  if (e <= 0) {
    if (e < -10) return sign; // underflow → ±0
    mant |= 0x800000;
    const shift = 14 - e;
    let half = mant >>> shift;
    const rem = mant & ((1 << shift) - 1);
    const mid = 1 << (shift - 1);
    if (rem > mid || (rem === mid && (half & 1) === 1)) half++;
    return sign | half;
  }
  let half = (e << 10) | (mant >>> 13);
  const rem = mant & 0x1fff;
  // A carry out of the mantissa bumps the exponent, which is the correct rounding (up to inf).
  if (rem > 0x1000 || (rem === 0x1000 && (half & 1) === 1)) half++;
  return sign | half;
}

/** IEEE 754 binary16 bits → number. */
export function fromHalf(h: number): number {
  const sign = h & 0x8000 ? -1 : 1;
  const exp = (h >>> 10) & 0x1f;
  const mant = h & 0x3ff;
  if (exp === 0) return sign * mant * 2 ** -24;
  if (exp === 0x1f) return mant === 0 ? sign * Infinity : NaN;
  return sign * (1 + mant / 1024) * 2 ** (exp - 15);
}

export function encodeF16(values: readonly number[]): Uint8Array {
  const out = new Uint8Array(values.length * 2);
  const view = new DataView(out.buffer);
  values.forEach((v, i) => view.setUint16(i * 2, toHalf(v), true));
  return out;
}

export function decodeF16(bytes: Uint8Array): number[] {
  if (bytes.byteLength % 2 !== 0) throw new Error("f16 blob has an odd length");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Array<number>(bytes.byteLength / 2);
  for (let i = 0; i < out.length; i++) out[i] = fromHalf(view.getUint16(i * 2, true));
  return out;
}

/** Round-trip through f16 (what the cache stores). */
export function roundF16(values: readonly number[]): number[] {
  return values.map((v) => fromHalf(toHalf(v)));
}

// ------------------------------------------------------------------------------- cache

/** `@cf/baai/bge-m3` → `baai--bge-m3`. */
export function modelSlug(model: string): string {
  return model.replace(/^@cf\//, "").replaceAll("/", "--").replace(/[^A-Za-z0-9._-]/g, "_");
}

export function textHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function cacheKey(model: string, text: string): string {
  return `emb/${modelSlug(model)}/${textHash(text)}.f16`;
}

export interface EmbedStats {
  requested: number;
  cacheHits: number;
  embedded: number;
  modelCalls: number;
}

async function pool<T>(items: readonly T[], concurrency: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i] as T);
    }
  });
  await Promise.all(workers);
}

export interface EmbedOptions {
  /** Parallel cache reads/writes. */
  concurrency?: number;
  log?: (msg: string) => void;
}

/**
 * Vectors for `texts` (deduplicated), from the cache where present, else from the model (and
 * then written to the cache). Returns text → f16-rounded vector.
 */
export async function embedCached(
  texts: readonly string[],
  embedder: Embedder,
  store: BlobStore,
  opts: EmbedOptions = {},
): Promise<{ vectors: Map<string, number[]>; stats: EmbedStats }> {
  const concurrency = opts.concurrency ?? 16;
  const unique = [...new Set(texts)];
  const vectors = new Map<string, number[]>();
  const missing: string[] = [];
  await pool(unique, concurrency, async (text) => {
    const blob = await store.get(cacheKey(embedder.model, text));
    if (blob !== null && blob.byteLength === embedder.dims * 2) vectors.set(text, decodeF16(blob));
    else missing.push(text);
  });
  missing.sort();
  const stats: EmbedStats = { requested: unique.length, cacheHits: unique.length - missing.length, embedded: 0, modelCalls: 0 };
  for (let i = 0; i < missing.length; i += embedder.maxBatch) {
    const batch = missing.slice(i, i + embedder.maxBatch);
    const out = await embedder.embed(batch);
    stats.modelCalls++;
    if (out.length !== batch.length) throw new Error(`${embedder.model}: ${out.length} vectors for ${batch.length} texts`);
    const writes: [string, Uint8Array][] = [];
    batch.forEach((text, j) => {
      const v = out[j] as number[];
      if (v.length !== embedder.dims) throw new Error(`${embedder.model}: vector of ${v.length} dims, expected ${embedder.dims}`);
      const bytes = encodeF16(v);
      vectors.set(text, decodeF16(bytes));
      writes.push([cacheKey(embedder.model, text), bytes]);
    });
    await pool(writes, concurrency, ([k, b]) => store.put(k, b));
    stats.embedded += batch.length;
    opts.log?.(`embed ${embedder.model}: ${Math.min(missing.length, i + embedder.maxBatch)}/${missing.length} new`);
  }
  return { vectors, stats };
}
