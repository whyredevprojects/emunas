/**
 * Local targets (no Cloudflare account): D1 through Miniflare, the same way
 * `wrangler d1 execute --local` opens it (so `wrangler dev` sees what the sync wrote), a
 * folder for the embedding cache, a file-backed stand-in for Vectorize and a deterministic
 * stand-in for Workers AI.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { foldTokens } from "@emunas/normalize/fold";
import type { BlobStore, Embedder } from "./embed.ts";
import { splitSql, type SqlTarget, type SqlValue, type Stmt } from "./sql.ts";
import type { VectorRecord, VectorTarget } from "./vector-sync.ts";

// ------------------------------------------------------------------------------- D1 (Miniflare)

/** Structural subset of the D1 binding Miniflare returns. */
interface D1Like {
  prepare(sql: string): { bind(...values: unknown[]): D1StmtLike } & D1StmtLike;
  batch(statements: D1StmtLike[]): Promise<unknown>;
}
interface D1StmtLike {
  all<T>(): Promise<{ results: T[] }>;
}

export interface LocalD1Options {
  /** Persist root as for `wrangler --persist-to` (default `<workers/api>/.wrangler/state`); null = in memory. */
  persistTo: string | null;
  /** The D1 database id (wrangler uses `database_id` from wrangler.jsonc for the local file). */
  databaseId: string;
  /** Statements per transaction. */
  maxStatements?: number;
}

export class MiniflareD1Target implements SqlTarget {
  readonly name: string;
  private mf: Miniflare;
  private db: Promise<D1Like>;
  private maxStatements: number;

  constructor(opts: LocalD1Options) {
    this.name = `local D1 ${opts.databaseId}${opts.persistTo === null ? " (memory)" : ""}`;
    this.maxStatements = opts.maxStatements ?? 2000;
    this.mf = new Miniflare(
      convertV4MiniflareOptions({
        modules: true,
        script: "",
        ...(opts.persistTo === null ? {} : { resourcePersistencePath: join(opts.persistTo, "v3") }),
        d1Databases: { DATABASE: opts.databaseId },
      }),
    );
    this.db = this.mf.getD1Database("DATABASE") as unknown as Promise<D1Like>;
  }

  async all<T extends Record<string, unknown>>(sql: string, params: SqlValue[] = []): Promise<T[]> {
    const db = await this.db;
    const { results } = await db.prepare(sql).bind(...params).all<T>();
    return results;
  }

  /** Each call of up to `maxStatements` statements is one transaction (D1 batch). */
  async write(groups: readonly (readonly Stmt[])[]): Promise<void> {
    const db = await this.db;
    let cur: D1StmtLike[] = [];
    for (const g of groups) {
      if (cur.length > 0 && cur.length + g.length > this.maxStatements) {
        await db.batch(cur);
        cur = [];
      }
      for (const s of g) cur.push(db.prepare(s.sql).bind(...s.params));
    }
    if (cur.length > 0) await db.batch(cur);
  }

  /** Apply every `*.sql` file in a migrations folder (tests and `--migrate` on a fresh local DB). */
  async applyMigrationFiles(files: readonly string[]): Promise<void> {
    const db = await this.db;
    for (const f of files) {
      const statements = splitSql(readFileSync(f, "utf8"));
      await db.batch(statements.map((s) => db.prepare(s)));
    }
  }

  async close(): Promise<void> {
    await this.mf.dispose();
  }
}

// ------------------------------------------------------------------------------- blob store

export class FsBlobStore implements BlobStore {
  readonly name: string;
  constructor(private root: string) {
    this.name = `folder ${root}`;
  }
  private path(key: string): string {
    if (key.split("/").some((p) => p === ".." || p === "")) throw new Error(`bad cache key ${key}`);
    return join(this.root, key);
  }
  async get(key: string): Promise<Uint8Array | null> {
    const p = this.path(key);
    return existsSync(p) ? new Uint8Array(readFileSync(p)) : null;
  }
  async put(key: string, data: Uint8Array): Promise<void> {
    const p = this.path(key);
    mkdirSync(dirname(p), { recursive: true });
    const tmp = `${p}.tmp-${process.pid}`;
    writeFileSync(tmp, data);
    renameSync(tmp, p);
  }
}

export class MemoryBlobStore implements BlobStore {
  readonly name = "memory";
  readonly blobs = new Map<string, Uint8Array>();
  gets = 0;
  puts = 0;
  async get(key: string): Promise<Uint8Array | null> {
    this.gets++;
    return this.blobs.get(key) ?? null;
  }
  async put(key: string, data: Uint8Array): Promise<void> {
    this.puts++;
    this.blobs.set(key, data);
  }
}

// ------------------------------------------------------------------------------- Vectorize stand-ins

/** In-memory Vectorize: records every call. */
export class MemoryVectorIndex implements VectorTarget {
  readonly name: string;
  readonly vectors = new Map<string, VectorRecord>();
  upsertCalls = 0;
  upsertedTotal = 0;
  deleteCalls = 0;
  deletedTotal = 0;
  constructor(readonly index = "emunas-moments", private dims: number | null = null) {
    this.name = `memory index ${index}`;
  }
  async upsert(vectors: readonly VectorRecord[]): Promise<void> {
    this.upsertCalls++;
    for (const v of vectors) {
      if (this.dims !== null && v.values.length !== this.dims) throw new Error(`dims ${v.values.length} != ${this.dims}`);
      this.vectors.set(v.id, { id: v.id, values: [...v.values], metadata: { ...v.metadata } });
    }
    this.upsertedTotal += vectors.length;
  }
  async deleteByIds(ids: readonly string[]): Promise<void> {
    this.deleteCalls++;
    for (const id of ids) this.vectors.delete(id);
    this.deletedTotal += ids.length;
  }
  async listIds(): Promise<string[]> {
    return [...this.vectors.keys()].sort();
  }
}

/**
 * File-backed Vectorize stand-in for local runs: keeps `id → { metadata, sha256 of the values }`
 * in a JSON file (not the values themselves, which would be hundreds of MB), enough to see what a
 * run would write.
 */
export class FileVectorIndex implements VectorTarget {
  readonly name: string;
  private data: Record<string, { metadata: VectorRecord["metadata"]; values: string; dims: number }>;
  constructor(private file: string, readonly index: string) {
    this.name = `local index file ${file}`;
    this.data = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as typeof this.data) : {};
  }
  private save(): void {
    mkdirSync(dirname(this.file), { recursive: true });
    const sorted = Object.fromEntries(Object.keys(this.data).sort().map((k) => [k, this.data[k]]));
    writeFileSync(this.file, JSON.stringify(sorted));
  }
  async upsert(vectors: readonly VectorRecord[]): Promise<void> {
    for (const v of vectors) {
      const h = createHash("sha256").update(Float32Array.from(v.values)).digest("hex").slice(0, 16);
      this.data[v.id] = { metadata: v.metadata, values: h, dims: v.values.length };
    }
    this.save();
  }
  async deleteByIds(ids: readonly string[]): Promise<void> {
    for (const id of ids) delete this.data[id];
    this.save();
  }
  async listIds(): Promise<string[]> {
    return Object.keys(this.data).sort();
  }
  size(): number {
    return Object.keys(this.data).length;
  }
}

// ------------------------------------------------------------------------------- Workers AI stand-in

/**
 * Deterministic stand-in for an embedding model: L2-normalized bag of hashed character
 * trigrams of the folded tokens. Texts that share words are close; there is no cross-language
 * understanding, so eval numbers from it say nothing about bge-m3 or qwen3.
 */
export class HashingEmbedder implements Embedder {
  readonly maxBatch = 64;
  calls = 0;
  textsEmbedded = 0;
  constructor(readonly dims = 1024, readonly model = `fake/hashing-trigram-${dims}`) {}

  vector(text: string): number[] {
    const v = new Array<number>(this.dims).fill(0);
    for (const tok of foldTokens(text)) {
      const padded = ` ${tok} `;
      const chars = [...padded];
      for (let i = 0; i + 3 <= chars.length; i++) {
        // FNV-1a over the trigram's code points; the top bit picks the sign.
        let h = 0x811c9dc5;
        for (const ch of chars.slice(i, i + 3)) h = Math.imul(h ^ (ch.codePointAt(0) as number), 0x01000193) >>> 0;
        const idx = (h & 0x7fffffff) % this.dims;
        v[idx] = (v[idx] ?? 0) + (h & 0x80000000 ? -1 : 1);
      }
    }
    const norm = Math.hypot(...v) || 1;
    return v.map((x) => x / norm);
  }

  async embed(texts: readonly string[]): Promise<number[][]> {
    this.calls++;
    this.textsEmbedded += texts.length;
    return texts.map((t) => this.vector(t));
  }
}
