/**
 * The public transcript file as the Live client reads it: `/data/transcript/<recordingId>.json`, a
 * byte-for-byte copy of `.corpus/transcript/<recordingId>.json` written by the transcript gate
 * (packages/corpus/src/transcript-gate.ts, `PublicTranscriptFile`). Browser-safe, no dependencies.
 */
export interface TranscriptFile {
  schemaVersion: 1;
  recordingId: string;
  quality: "reviewed" | "high-asr";
  lang: string | null;
  /** Identity of the approved transcription. */
  version: string;
  /** `[start, end, text]`, recording-local seconds. */
  cues: [number, number, string][];
}

export const TRANSCRIPT_TAB = "transcript" as const;

const RECORDING_ID = /^[a-z0-9][a-z0-9-]*$/;

/** Path of a recording's public file, or null for an id that is not a plain path segment. */
export function transcriptPath(recordingId: string): string | null {
  return RECORDING_ID.test(recordingId) ? `/data/transcript/${recordingId}.json` : null;
}

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/** The file when it has exactly the public shape for `recordingId`, else null. */
export function parseTranscriptFile(body: unknown, recordingId: string): TranscriptFile | null {
  if (!isRecord(body)) return null;
  if (body["schemaVersion"] !== 1 || body["recordingId"] !== recordingId) return null;
  const quality = body["quality"];
  if (quality !== "reviewed" && quality !== "high-asr") return null;
  const lang = body["lang"];
  if (lang !== null && typeof lang !== "string") return null;
  const version = body["version"];
  if (typeof version !== "string") return null;
  const raw = body["cues"];
  if (!Array.isArray(raw)) return null;
  const cues: [number, number, string][] = [];
  for (const c of raw) {
    if (!Array.isArray(c) || c.length !== 3) return null;
    const [s, e, t] = c as unknown[];
    if (typeof s !== "number" || typeof e !== "number" || typeof t !== "string" || !(s >= 0) || !(e >= s)) return null;
    cues.push([s, e, t]);
  }
  return { schemaVersion: 1, recordingId, quality, lang, version, cues };
}

/** A cue placed on the shiur's global timeline. */
export interface GlobalCue {
  recordingId: string;
  t: number;
  end: number;
  text: string;
}

/** Cues of every loaded file, in shiur order, at global seconds (`offset + local`). */
export function globalCues(
  recordings: readonly { id: string; offset: number }[],
  files: ReadonlyMap<string, TranscriptFile>,
): GlobalCue[] {
  const out: GlobalCue[] = [];
  for (const r of recordings) {
    const f = files.get(r.id);
    if (!f) continue;
    for (const [s, e, text] of f.cues) out.push({ recordingId: r.id, t: r.offset + s, end: r.offset + e, text });
  }
  return out;
}

/** Index of the cue playing at `now` (last cue with t ≤ now < end), or -1. */
export function activeCue(cues: readonly GlobalCue[], now: number | null): number {
  if (now === null) return -1;
  let found = -1;
  for (let i = 0; i < cues.length; i++) {
    const c = cues[i]!;
    if (c.t <= now && now < c.end) found = i;
    if (c.t > now) break;
  }
  return found;
}
