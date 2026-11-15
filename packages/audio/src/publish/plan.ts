/**
 * Publish plan: which private-bucket objects get copied to `emunas-audio`
 * (integration-plan §3.2). Pure; computed only from the pipeline's ingest output.
 *
 * - A recording is in scope when an in-scope shiur lists it.
 * - Only canonical recordings (`duplicateOf === null`) are copied, as
 *   `<recordingId>.mp3`. An in-scope duplicate pulls in its canonical.
 * - Source keys that are not `.mp3`, start with `transcripts/`, or look odd are
 *   refused and listed, never copied.
 * - Keys only ever come from ingest; nothing here accepts a key from a client.
 */
import { isAudioId } from "../paths.ts";
import { publicObjectKey, refuseSourceKey, type KeyRefusal } from "../keys.ts";

/** The parts of the pipeline's `IngestOutput` (src/types.ts) the planner reads. */
export interface IngestLike {
  shiurim: readonly { id: string; inScope: boolean; recordingIds: readonly string[] }[];
  recordings: readonly { id: string; audioKey: string; sizeBytes: number; duplicateOf: string | null }[];
}

export interface PublishItem {
  id: string;
  sourceKey: string;
  destKey: string;
  sizeBytes: number;
}

export interface RefusedItem {
  id: string;
  sourceKey: string;
  reason: KeyRefusal | "invalid-id";
}

export interface PublishPlan {
  srcBucket: string;
  dstBucket: string;
  /** Sorted by id. */
  items: PublishItem[];
  /** Sorted by id. */
  refused: RefusedItem[];
  /** In-scope duplicates and the canonical recording they resolve to. */
  duplicates: { id: string; canonicalId: string }[];
  /** Recording ids referenced by in-scope shiurim but missing from ingest.recordings (or with a broken duplicate chain). */
  missing: string[];
  counts: {
    inScopeShiurim: number;
    /** Distinct recordings referenced by in-scope shiurim. */
    inScopeRecordings: number;
    /** Of those, with `duplicateOf === null`. */
    inScopeCanonical: number;
    /** Canonical recordings added only because an in-scope duplicate points at them. */
    canonicalViaDuplicate: number;
    toCopy: number;
    refused: number;
    duplicates: number;
    missing: number;
  };
}

export interface PlanOptions {
  srcBucket?: string;
  dstBucket?: string;
}

export const DEFAULT_SRC_BUCKET = "emunas";
export const DEFAULT_DST_BUCKET = "emunas-audio";

export function buildPublishPlan(ingest: IngestLike, options: PlanOptions = {}): PublishPlan {
  const srcBucket = options.srcBucket ?? DEFAULT_SRC_BUCKET;
  const dstBucket = options.dstBucket ?? DEFAULT_DST_BUCKET;
  if (srcBucket === dstBucket) throw new Error("Source and destination buckets must differ");

  const recById = new Map(ingest.recordings.map((r) => [r.id, r] as const));
  const inScopeShiurim = ingest.shiurim.filter((s) => s.inScope);
  const referenced = new Set(inScopeShiurim.flatMap((s) => s.recordingIds));

  const canonicalIds = new Set<string>();
  const duplicates: { id: string; canonicalId: string }[] = [];
  const missing: string[] = [];
  let inScopeCanonical = 0;

  for (const id of referenced) {
    const rec = recById.get(id);
    if (!rec) {
      missing.push(id);
      continue;
    }
    if (rec.duplicateOf === null) {
      inScopeCanonical++;
      canonicalIds.add(id);
      continue;
    }
    // Follow the chain to the canonical recording (bounded).
    let cur = rec;
    let ok = false;
    for (let i = 0; i < 16; i++) {
      if (cur.duplicateOf === null) {
        ok = true;
        break;
      }
      const next = recById.get(cur.duplicateOf);
      if (!next) break;
      cur = next;
    }
    if (!ok) {
      missing.push(id);
      continue;
    }
    duplicates.push({ id, canonicalId: cur.id });
    canonicalIds.add(cur.id);
  }
  const canonicalViaDuplicate = [...canonicalIds].filter((id) => !referenced.has(id)).length;

  const items: PublishItem[] = [];
  const refused: RefusedItem[] = [];
  for (const id of [...canonicalIds].sort()) {
    const rec = recById.get(id);
    if (!rec) continue;
    if (!isAudioId(id)) {
      refused.push({ id, sourceKey: rec.audioKey, reason: "invalid-id" });
      continue;
    }
    const reason = refuseSourceKey(rec.audioKey);
    if (reason) {
      refused.push({ id, sourceKey: rec.audioKey, reason });
      continue;
    }
    items.push({ id, sourceKey: rec.audioKey, destKey: publicObjectKey(id), sizeBytes: rec.sizeBytes });
  }

  duplicates.sort((a, b) => a.id.localeCompare(b.id));
  missing.sort();
  return {
    srcBucket,
    dstBucket,
    items,
    refused,
    duplicates,
    missing,
    counts: {
      inScopeShiurim: inScopeShiurim.length,
      inScopeRecordings: referenced.size,
      inScopeCanonical,
      canonicalViaDuplicate,
      toCopy: items.length,
      refused: refused.length,
      duplicates: duplicates.length,
      missing: missing.length,
    },
  };
}

function formatBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GiB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MiB`;
  return `${n} B`;
}

/** Human-readable plan, one line per recording, then a summary. */
export function formatPlan(plan: PublishPlan): string {
  const lines: string[] = [];
  lines.push(`audio-publish plan: ${plan.srcBucket} -> ${plan.dstBucket}`);
  for (const it of plan.items) lines.push(`copy    ${it.id}  <-  ${it.sourceKey}  (${it.sizeBytes} B)`);
  for (const r of plan.refused) lines.push(`REFUSE  ${r.id}  (${r.reason})  ${r.sourceKey}`);
  for (const d of plan.duplicates) lines.push(`dup     ${d.id}  ->  ${d.canonicalId}`);
  for (const m of plan.missing) lines.push(`MISSING ${m}`);
  const total = plan.items.reduce((s, it) => s + it.sizeBytes, 0);
  const c = plan.counts;
  lines.push("");
  lines.push(`in-scope shiurim:                     ${c.inScopeShiurim}`);
  lines.push(`in-scope recordings (referenced):     ${c.inScopeRecordings}`);
  lines.push(`  with duplicateOf null:              ${c.inScopeCanonical}`);
  lines.push(`  duplicates (served by canonical):   ${c.duplicates}`);
  lines.push(`canonical added via duplicates:       ${c.canonicalViaDuplicate}`);
  lines.push(`to copy:                              ${c.toCopy} (${formatBytes(total)})`);
  lines.push(`refused:                              ${c.refused}`);
  lines.push(`missing from ingest.recordings:       ${c.missing}`);
  return lines.join("\n");
}
