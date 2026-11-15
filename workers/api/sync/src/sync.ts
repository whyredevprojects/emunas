/**
 * One sync run: read `.corpus/search/moments.ndjson`, write the vector metadata file for the
 * leak guard, sync Vectorize, then D1 (whose last write is `meta.corpus_rev`, so the Worker's
 * cache key changes only once both are current).
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { MomentRow } from "@emunas/search-core";
import { readMomentsNdjson } from "./rows.ts";
import { syncD1, readSchemaVersion, type D1Report } from "./d1-sync.ts";
import { syncVectors, vectorMetadataNdjson, type VectorReport, type VectorTarget } from "./vector-sync.ts";
import type { BlobStore, Embedder } from "./embed.ts";
import type { SqlTarget } from "./sql.ts";
import type { MiniflareD1Target } from "./local.ts";

export interface SyncTargets {
  d1: SqlTarget | null;
  vectors: { target: VectorTarget; embedder: Embedder; store: BlobStore } | null;
}

export interface RunOptions {
  /** `.corpus/search/moments.ndjson`, or the rows themselves. */
  moments: string | readonly MomentRow[];
  targets: SyncTargets;
  dryRun?: boolean;
  /** Where to write `{ id, metadata }` NDJSON of every wanted vector (guard input); null = skip. */
  vectorMetaOut?: string | null;
  log?: (msg: string) => void;
}

export interface RunReport {
  moments: number;
  vectors: VectorReport | null;
  d1: D1Report | null;
}

export async function runSync(o: RunOptions): Promise<RunReport> {
  const rows = typeof o.moments === "string" ? readMomentsNdjson(o.moments) : o.moments;
  const log = o.log ?? (() => {});
  log(`moments: ${rows.length}`);
  if (o.vectorMetaOut) {
    mkdirSync(dirname(o.vectorMetaOut), { recursive: true });
    writeFileSync(o.vectorMetaOut, vectorMetadataNdjson(rows));
  }
  const dry = o.dryRun === true ? { dryRun: true } : {};
  const vectors = o.targets.vectors
    ? await syncVectors(o.targets.vectors.target, o.targets.vectors.embedder, o.targets.vectors.store, rows, { ...dry, log })
    : null;
  const d1 = o.targets.d1 ? await syncD1(o.targets.d1, rows, { ...dry, log }) : null;
  return { moments: rows.length, vectors, d1 };
}

/** Apply the search migrations to a local D1 that has none yet (local runs and tests). */
export async function migrateLocalIfEmpty(target: MiniflareD1Target, migrationsDir: string): Promise<boolean> {
  if ((await readSchemaVersion(target)) !== null) return false;
  if (!existsSync(migrationsDir)) throw new Error(`migrations folder not found: ${migrationsDir}`);
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => join(migrationsDir, f));
  await target.applyMigrationFiles(files);
  return true;
}
