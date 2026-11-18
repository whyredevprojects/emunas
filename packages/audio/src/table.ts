/**
 * The audio table (integration-plan §5.1 `audio-table.json`, Amendment A1):
 * `recordingId → { url, canonicalId, playable, size }`, built from the corpus recordings at build
 * time. A recording with `duplicateOf` maps to its canonical recording and shares its URL. A
 * recording whose canonical key is not playable (not `.mp3`, or refused) gets `playable: false`
 * and `url: null`, unless the key is in `mp3Siblings` (site-policy/audio-transcoded.json): then the
 * URL points at the MP3 transcode next to it and `size` is 0 (unknown).
 *
 * Every playable entry also gets `cleanedUrl`, the URL of the AI-improved copy at
 * `fixed/sidon/<served key>` (`cleanedKey`), unless its served key is in `rejected`
 * (`site-policy/audio-cleaned.json`): then `cleanedUrl` is null. A duplicate shares its canonical's
 * `cleanedUrl`, as it does `url`.
 *
 * The bucket key (`audioKey`) is read to build the URL and is never copied into the table.
 *
 * Pure and browser/Workers-safe.
 */
import { cleanedKey } from "./cleaned.ts";
import { mediaUrl, normalizeMediaOrigin, type MediaUrl } from "./media.ts";
import { servedKey, unplayableReason, type UnplayableReason } from "./playable.ts";

interface AudioTableEntryBase {
  /** Recording whose object holds the bytes (itself unless a duplicate). */
  canonicalId: string;
  /** Byte size of the canonical object (0 when unknown). */
  size: number;
}

export type AudioTableEntry =
  | (AudioTableEntryBase & { playable: true; url: MediaUrl; cleanedUrl: MediaUrl | null })
  | (AudioTableEntryBase & { playable: false; url: null; cleanedUrl: null });

export type AudioTable = Readonly<Record<string, AudioTableEntry>>;

/**
 * What the builder needs per recording. The pipeline's `Recording` type (src/types.ts) satisfies it
 * structurally.
 */
export interface AudioTableInput {
  id: string;
  audioKey: string;
  sizeBytes: number;
  duplicateOf: string | null;
}

export type AudioTableIssue =
  | { kind: "duplicate-id"; id: string }
  | { kind: "missing-canonical"; id: string; duplicateOf: string }
  | { kind: "duplicate-cycle"; id: string }
  | { kind: "invalid-size"; id: string }
  | { kind: "unplayable"; id: string; reason: UnplayableReason };

export interface BuildAudioTableOptions {
  /** Media origin, e.g. `https://media.<domain>`; validated by `normalizeMediaOrigin`. */
  origin: string;
  /**
   * Ids to emit (e.g. the in-scope recordings). All given recordings are still used to resolve
   * `duplicateOf`, so a duplicate can point at a canonical outside this set. Default: every id.
   */
  only?: Iterable<string>;
  onIssue?: (issue: AudioTableIssue) => void;
  /**
   * Original (non-mp3) bucket keys that have an MP3 transcode next to them
   * (`site-policy/audio-transcoded.json` `mp3Siblings`). Default: none.
   */
  mp3Siblings?: Iterable<string>;
  /**
   * Served keys whose AI-improved copy was rejected after review (`site-policy/audio-cleaned.json`
   * `rejected[].key`): those entries get `cleanedUrl: null`. Default: none (every playable
   * recording links its improved copy).
   */
  rejected?: Iterable<string>;
}

const MAX_DUP_CHAIN = 16;

/**
 * Builds the table. Never throws on bad rows (only on an invalid origin): a broken duplicate chain
 * or an unplayable key gives `playable: false`; everything is reported via `onIssue`. Output keys
 * are sorted, so the JSON is deterministic.
 */
export function buildAudioTable(recordings: readonly AudioTableInput[], options: BuildAudioTableOptions): AudioTable {
  const origin = normalizeMediaOrigin(options.origin);
  const report = options.onIssue ?? (() => {});
  const transcoded: ReadonlySet<string> = new Set(options.mp3Siblings ?? []);
  const rejected: ReadonlySet<string> = new Set(options.rejected ?? []);
  const byId = new Map<string, AudioTableInput>();
  for (const rec of recordings) {
    if (byId.has(rec.id)) {
      report({ kind: "duplicate-id", id: rec.id });
      continue;
    }
    byId.set(rec.id, rec);
  }
  const wanted = options.only ? [...new Set(options.only)] : [...byId.keys()];

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
  for (const id of wanted.sort()) {
    const rec = byId.get(id);
    if (!rec) continue; // unknown id: the caller reports missing recordings itself
    const canonical = resolveCanonical(rec);
    if ("kind" in canonical) {
      report(canonical);
      out[id] = { canonicalId: id, size: 0, playable: false, url: null, cleanedUrl: null };
      continue;
    }
    let size = canonical.sizeBytes;
    if (!Number.isSafeInteger(size) || size < 0) {
      report({ kind: "invalid-size", id });
      size = 0;
    }
    const key = servedKey(canonical.audioKey, transcoded);
    if (key === null) {
      report({ kind: "unplayable", id, reason: unplayableReason(canonical.audioKey) ?? "not-mp3" });
      out[id] = { canonicalId: canonical.id, size, playable: false, url: null, cleanedUrl: null };
      continue;
    }
    // The transcode's byte size is not in the ingest: 0 means unknown.
    if (key !== canonical.audioKey) size = 0;
    const cleanedUrl = rejected.has(key) ? null : mediaUrl(cleanedKey(key), origin);
    out[id] = { canonicalId: canonical.id, size, playable: true, url: mediaUrl(key, origin), cleanedUrl };
  }
  return out;
}

/** Own-property lookup (ids such as `constructor` must not hit the prototype). */
export function lookupAudio(table: AudioTable, id: string): AudioTableEntry | null {
  return Object.hasOwn(table, id) ? (table[id] ?? null) : null;
}
