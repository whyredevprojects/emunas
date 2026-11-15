/**
 * The audio table (integration-plan §3.2, §5.1 `audio-table.json`):
 * `recordingId → { size, canonicalId }`, generated from the corpus at build time
 * and bundled into each site Worker. Ids not in it are 404. Recordings with
 * `duplicateOf` map to their canonical object, which is the only one published.
 *
 * Pure and browser/Workers-safe.
 */
import { asciiFilenameBase } from "./filename.ts";
import { isAudioId } from "./paths.ts";
import { refuseSourceKey } from "./keys.ts";

export interface AudioTableEntry {
  /** Byte size of the canonical object. */
  size: number;
  /** Recording id whose object `<canonicalId>.mp3` holds the bytes (itself unless a duplicate). */
  canonicalId: string;
  /** ASCII-safe title for download filenames; absent → the recording id is used. */
  title?: string;
}

export type AudioTable = Readonly<Record<string, AudioTableEntry>>;

/**
 * What the table builder needs per recording. The pipeline's `Recording` type
 * (src/types.ts) satisfies it structurally. `audioKey` is used only to leave out
 * recordings that can never be published (non-mp3 sources); it is not copied
 * into the table.
 */
export interface AudioTableInput {
  id: string;
  sizeBytes: number;
  duplicateOf: string | null;
  audioKey?: string;
  /** Catalog title (any script); folded to ASCII for the download filename. */
  title?: string | null;
}

export type AudioTableIssue =
  | { kind: "invalid-id"; id: string }
  | { kind: "duplicate-id"; id: string }
  | { kind: "invalid-size"; id: string }
  | { kind: "missing-canonical"; id: string; duplicateOf: string }
  | { kind: "duplicate-cycle"; id: string }
  | { kind: "unpublishable-key"; id: string; reason: string };

export interface BuildAudioTableOptions {
  onIssue?: (issue: AudioTableIssue) => void;
}

const MAX_DUP_CHAIN = 16;

/**
 * Builds the table from the corpus's in-scope recordings. Never throws on bad
 * rows: a bad row is left out (→ 404 at the edge) and reported via `onIssue`.
 * Output keys are sorted, so the JSON is deterministic.
 */
export function buildAudioTable(
  recordings: readonly AudioTableInput[],
  options: BuildAudioTableOptions = {},
): AudioTable {
  const report = options.onIssue ?? (() => {});
  const byId = new Map<string, AudioTableInput>();
  for (const rec of recordings) {
    if (!isAudioId(rec.id)) {
      report({ kind: "invalid-id", id: rec.id });
      continue;
    }
    if (byId.has(rec.id)) {
      report({ kind: "duplicate-id", id: rec.id });
      continue;
    }
    byId.set(rec.id, rec);
  }

  const resolveCanonical = (rec: AudioTableInput): AudioTableInput | AudioTableIssue => {
    let cur = rec;
    for (let i = 0; i < MAX_DUP_CHAIN; i++) {
      if (cur.duplicateOf === null) return cur;
      const next = byId.get(cur.duplicateOf);
      if (!next) return { kind: "missing-canonical", id: rec.id, duplicateOf: cur.duplicateOf };
      cur = next;
    }
    return { kind: "duplicate-cycle", id: rec.id };
  };

  const out: Record<string, AudioTableEntry> = {};
  for (const id of [...byId.keys()].sort()) {
    const rec = byId.get(id);
    if (!rec) continue;
    const canonical = resolveCanonical(rec);
    if ("kind" in canonical) {
      report(canonical);
      continue;
    }
    if (canonical.audioKey !== undefined) {
      const reason = refuseSourceKey(canonical.audioKey);
      if (reason) {
        report({ kind: "unpublishable-key", id, reason });
        continue;
      }
    }
    if (!Number.isSafeInteger(canonical.sizeBytes) || canonical.sizeBytes <= 0) {
      report({ kind: "invalid-size", id });
      continue;
    }
    const entry: AudioTableEntry = { size: canonical.sizeBytes, canonicalId: canonical.id };
    const title = rec.title ? asciiFilenameBase(rec.title) : "";
    if (title) entry.title = title;
    out[id] = entry;
  }
  return out;
}

/** Own-property lookup (ids such as `constructor` must not hit the prototype). */
export function lookupAudio(table: AudioTable, id: string): AudioTableEntry | null {
  return Object.hasOwn(table, id) ? (table[id] ?? null) : null;
}
