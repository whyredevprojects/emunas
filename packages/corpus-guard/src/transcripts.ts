/**
 * Transcript access for the leak check. This package and
 * packages/corpus/src/transcript-gate.ts are the only places allowed to read
 * the transcript folder (integration-plan §0.3). Nothing read here is ever
 * written anywhere: transcripts become interned token ids in memory and are
 * compared, and reports carry ids and lengths only.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { concatWithBreaks, type Vocabulary } from "./shingles.ts";
import { tokenize } from "./tokenize.ts";

/** Default location relative to the repo root (CLI default; CI passes it explicitly). */
export const DEFAULT_TRANSCRIPTS_DIR = "data/transcripts";

const RECORDING_ID = /^[a-z0-9][a-z0-9-]*$/;

/** Segment texts of one compact transcript file, tolerant of `[start, end, text]` tuples and `{ text }` objects. */
export function segmentTexts(json: unknown): string[] {
  if (typeof json !== "object" || json === null) return [];
  const segs = (json as { segments?: unknown }).segments;
  if (!Array.isArray(segs)) return [];
  const out: string[] = [];
  for (const s of segs) {
    if (Array.isArray(s)) {
      const t = s[2];
      if (typeof t === "string") out.push(t);
    } else if (typeof s === "object" && s !== null) {
      const t = (s as { text?: unknown }).text;
      if (typeof t === "string") out.push(t);
    }
  }
  return out;
}

export class TranscriptStore {
  readonly dir: string;
  readonly vocab: Vocabulary;
  private readonly cache = new Map<string, Int32Array | null>();
  private readonly cacheLimit: number;

  constructor(dir: string, vocab: Vocabulary, opts: { cacheLimit?: number } = {}) {
    this.dir = dir;
    this.vocab = vocab;
    this.cacheLimit = opts.cacheLimit ?? 0;
  }

  /** Recording ids that have a transcript file. */
  listRecordingIds(): string[] {
    if (!existsSync(this.dir)) return [];
    return readdirSync(this.dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.slice(0, -".json".length))
      .filter((id) => RECORDING_ID.test(id))
      .sort();
  }

  /**
   * Token ids of one recording, segments joined in order (a run may cross a
   * segment boundary: ASR segment cuts are arbitrary). Null when missing/unreadable.
   */
  tokens(recordingId: string): Int32Array | null {
    if (!RECORDING_ID.test(recordingId)) return null;
    const hit = this.cache.get(recordingId);
    if (hit !== undefined) return hit;
    const file = join(this.dir, `${recordingId}.json`);
    let result: Int32Array | null = null;
    if (existsSync(file)) {
      try {
        const json: unknown = JSON.parse(readFileSync(file, "utf8"));
        const ids: number[] = [];
        for (const text of segmentTexts(json)) for (const t of tokenize(text)) ids.push(this.vocab.intern(t));
        result = Int32Array.from(ids);
      } catch {
        result = null;
      }
    }
    if (this.cacheLimit > 0) {
      if (this.cache.size >= this.cacheLimit) {
        const first = this.cache.keys().next();
        if (!first.done) this.cache.delete(first.value);
      }
      this.cache.set(recordingId, result);
    }
    return result;
  }

  /** Token stream of several recordings with BREAK between them; ids of missing recordings are returned separately. */
  stream(recordingIds: readonly string[]): { tokens: Int32Array; missing: string[] } {
    const parts: Int32Array[] = [];
    const missing: string[] = [];
    for (const id of recordingIds) {
      const t = this.tokens(id);
      if (t === null) missing.push(id);
      else parts.push(t);
    }
    return { tokens: concatWithBreaks(parts), missing };
  }
}
