/**
 * Incremental Vectorize sync: one vector per (moment, language), id `<momentId>@<lang>`.
 *
 * Vectorize cannot report a stored vector's hash cheaply, so the sync keeps a state file next
 * to the embedding cache (`vec/<index>/state.json`: model, dims and `vectorId → hash`). The
 * diff is against that state: vectors whose moment hash changed (or that are new) are embedded
 * (cache first) and upserted; ids no longer wanted are deleted. A model change re-upserts
 * everything. Without a state file, the index's own id list is used for deletions when the
 * target can list ids. The state is updated batch by batch and saved even when a run fails.
 */
import type { MomentRow } from "@emunas/search-core";
import { embedCached, type BlobStore, type EmbedStats, type Embedder } from "./embed.ts";
import { toVectorUnits, utf8Bytes, VECTOR_ID_MAX_BYTES, type VectorMetadata, type VectorUnit } from "./rows.ts";

export interface VectorRecord {
  id: string;
  values: number[];
  metadata: VectorMetadata;
}

export interface VectorTarget {
  readonly name: string;
  /** Index name (the state file is per index). */
  readonly index: string;
  upsert(vectors: readonly VectorRecord[]): Promise<void>;
  deleteByIds(ids: readonly string[]): Promise<void>;
  /** All ids in the index, when the target supports listing. */
  listIds?(): Promise<string[]>;
}

export interface VectorState {
  version: 1;
  index: string;
  model: string;
  dims: number;
  vectors: Record<string, string>;
}

export const stateKey = (index: string): string => `vec/${index}/state.json`;

export async function loadState(store: BlobStore, index: string): Promise<VectorState | null> {
  const blob = await store.get(stateKey(index));
  if (blob === null) return null;
  const s = JSON.parse(new TextDecoder().decode(blob)) as VectorState;
  if (s.version !== 1 || typeof s.vectors !== "object") throw new Error(`unreadable vector state for ${index}`);
  return s;
}

export async function saveState(store: BlobStore, state: VectorState): Promise<void> {
  const sorted = Object.fromEntries(Object.keys(state.vectors).sort().map((k) => [k, state.vectors[k] as string]));
  await store.put(stateKey(state.index), new TextEncoder().encode(`${JSON.stringify({ ...state, vectors: sorted })}\n`));
}

export interface VectorPlan {
  units: VectorUnit[];
  upserts: VectorUnit[];
  deletes: string[];
  unchanged: number;
  /** Units dropped because the id exceeds 64 bytes. */
  skipped: string[];
  reason: "state" | "listed" | "empty" | "model-changed";
}

export function wantedUnits(rows: readonly MomentRow[]): { units: VectorUnit[]; skipped: string[] } {
  const units: VectorUnit[] = [];
  const skipped: string[] = [];
  for (const row of rows) {
    for (const u of toVectorUnits(row)) {
      if (utf8Bytes(u.vectorId) > VECTOR_ID_MAX_BYTES) skipped.push(u.vectorId);
      else units.push(u);
    }
  }
  return { units, skipped };
}

export function planVectors(
  rows: readonly MomentRow[],
  model: string,
  state: VectorState | null,
  listed: readonly string[] | null,
): VectorPlan {
  const { units, skipped } = wantedUnits(rows);
  const wanted = new Set(units.map((u) => u.vectorId));
  let known: Record<string, string> = {};
  let reason: VectorPlan["reason"] = "empty";
  if (state !== null && state.model === model) {
    known = state.vectors;
    reason = "state";
  } else if (state !== null) {
    // Different model: every vector is rewritten; old ids that are no longer wanted go.
    known = Object.fromEntries(Object.keys(state.vectors).map((k) => [k, ""]));
    reason = "model-changed";
  } else if (listed !== null) {
    known = Object.fromEntries(listed.map((k) => [k, ""]));
    reason = "listed";
  }
  const upserts = units.filter((u) => known[u.vectorId] !== u.hash);
  const deletes = Object.keys(known).filter((id) => !wanted.has(id)).sort();
  return { units, upserts, deletes, unchanged: units.length - upserts.length, skipped, reason };
}

export interface VectorReport {
  target: string;
  index: string;
  model: string;
  upserted: number;
  deleted: number;
  unchanged: number;
  skipped: string[];
  embed: EmbedStats;
  planBasis: VectorPlan["reason"];
  dryRun: boolean;
}

export interface SyncVectorsOptions {
  dryRun?: boolean;
  upsertBatch?: number;
  deleteBatch?: number;
  log?: (msg: string) => void;
}

export async function syncVectors(
  target: VectorTarget,
  embedder: Embedder,
  store: BlobStore,
  rows: readonly MomentRow[],
  opts: SyncVectorsOptions = {},
): Promise<VectorReport> {
  const log = opts.log ?? (() => {});
  const state = await loadState(store, target.index);
  const listed = state === null && target.listIds ? await target.listIds() : null;
  const plan = planVectors(rows, embedder.model, state, listed);
  log(
    `vectors ${target.name}: ${plan.upserts.length} to upsert, ${plan.deletes.length} to delete, ${plan.unchanged} unchanged ` +
      `(basis: ${plan.reason})${plan.skipped.length > 0 ? `, ${plan.skipped.length} skipped (id > 64 bytes)` : ""}${opts.dryRun ? " (dry run)" : ""}`,
  );
  const report: VectorReport = {
    target: target.name,
    index: target.index,
    model: embedder.model,
    upserted: 0,
    deleted: 0,
    unchanged: plan.unchanged,
    skipped: plan.skipped,
    embed: { requested: 0, cacheHits: 0, embedded: 0, modelCalls: 0 },
    planBasis: plan.reason,
    dryRun: opts.dryRun === true,
  };
  if (opts.dryRun) {
    report.upserted = plan.upserts.length;
    report.deleted = plan.deletes.length;
    return report;
  }

  const next: VectorState = {
    version: 1,
    index: target.index,
    model: embedder.model,
    dims: embedder.dims,
    vectors: plan.reason === "state" && state !== null ? { ...state.vectors } : {},
  };
  // With a model change or a listing basis, unchanged entries are none; with "state" they are kept.
  const upsertBatch = opts.upsertBatch ?? 500;
  const deleteBatch = opts.deleteBatch ?? 1000;
  try {
    // Deletes first: removing unwanted ids is always safe, and a failure part-way through the
    // upserts then leaves nothing stale behind that the state file no longer knows about.
    for (let i = 0; i < plan.deletes.length; i += deleteBatch) {
      const batch = plan.deletes.slice(i, i + deleteBatch);
      await target.deleteByIds(batch);
      for (const id of batch) delete next.vectors[id];
      report.deleted += batch.length;
    }
    for (let i = 0; i < plan.upserts.length; i += upsertBatch) {
      const batch = plan.upserts.slice(i, i + upsertBatch);
      const { vectors, stats } = await embedCached(batch.map((u) => u.text), embedder, store, { log });
      report.embed.requested += stats.requested;
      report.embed.cacheHits += stats.cacheHits;
      report.embed.embedded += stats.embedded;
      report.embed.modelCalls += stats.modelCalls;
      await target.upsert(
        batch.map((u) => ({ id: u.vectorId, values: vectors.get(u.text) as number[], metadata: u.metadata })),
      );
      for (const u of batch) next.vectors[u.vectorId] = u.hash;
      report.upserted += batch.length;
      log(`vectors ${target.name}: ${report.upserted}/${plan.upserts.length} upserted`);
    }
  } finally {
    // Entries for the old model or from a listing carry no hash we can trust; keep only what we wrote.
    if (plan.upserts.length > 0 || plan.deletes.length > 0 || state === null || state.model !== embedder.model) {
      await saveState(store, next);
    }
  }
  return report;
}

/** Metadata of every wanted vector, as NDJSON lines `{ id, metadata }` (input for the leak guard). */
export function vectorMetadataNdjson(rows: readonly MomentRow[]): string {
  const { units } = wantedUnits(rows);
  return units.map((u) => JSON.stringify({ id: u.vectorId, metadata: u.metadata })).join("\n") + (units.length > 0 ? "\n" : "");
}
