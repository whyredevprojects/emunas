// Shared helpers for the pilot kit (prepare-pilot.ts, pick-pilot.ts, validate.ts).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { CompactTranscript } from "../sync-transcripts.js";
import type { Lang, Recording, Series, Shiur } from "../../src/types.js";

/** One ASR segment as stored in the transcript JSON in R2 (faster-whisper output). */
export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptJson {
  key?: string;
  duration?: number;
  model?: string;
  language?: string;
  segments: TranscriptSegment[];
}

export interface PilotRecordingMeta {
  recording: Recording;
  /** Position within the shiur (playback order). */
  order: number;
  transcriptLanguage: string | null;
  asrModel: string | null;
  durationSec: number;        // transcript duration, falling back to last segment end
  segmentCount: number;
  starts: number[];           // seconds, one per segment
  ends: number[];             // seconds, one per segment
}

/** out/pilot/<shiurId>/meta.json */
export interface PilotMeta {
  shiurId: string;
  generatedAt: string;
  shiur: Shiur;
  series: Series | null;
  /** catalog.titleOriginal split on ';' (trimmed, empties dropped); indices = catalogTopicIdx. */
  catalogTopics: string[];
  totalDurationSec: number;
  recordings: PilotRecordingMeta[];
}

/** Split a catalog title into its ';'-separated topic list. */
export function splitCatalogTopics(title: string): string[] {
  return title
    .split(/[;؛]/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

export function mmss(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function langName(lang: Lang): string {
  return lang === "yi" ? "Yiddish" : "English";
}

/** 5736 -> "5736 (1975/76)" */
export function hebrewYearLabel(y: number): string {
  const g = y - 3761;
  return `${y} (${g}/${String((g + 1) % 100).padStart(2, "0")})`;
}

const HEBREW_LETTER = /[֐-׿יִ-ﭏ]/u;
const ANY_LETTER = /\p{L}/u;

/** Share of letters that are Hebrew script (0..1); 0 when there are no letters. */
export function hebrewRatio(text: string): number {
  let heb = 0;
  let all = 0;
  for (const ch of text) {
    if (!ANY_LETTER.test(ch)) continue;
    all++;
    if (HEBREW_LETTER.test(ch)) heb++;
  }
  return all === 0 ? 0 : heb / all;
}

export function wordCount(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/u).length : 0;
}

// ---------------- transcripts (committed in the repo) ----------------

/** Compact transcripts mirrored from R2 by scripts/sync-transcripts.ts (npm run transcripts:sync). */
export const TRANSCRIPT_DIR = "data/transcripts";

/** Load data/transcripts/<recordingId>.json. No network, no credentials. */
export function loadTranscript(recordingId: string): TranscriptJson {
  const path = join(TRANSCRIPT_DIR, `${recordingId}.json`);
  if (!existsSync(path)) throw new Error(`${path} missing (run npm run transcripts:sync)`);
  const c = JSON.parse(readFileSync(path, "utf8")) as CompactTranscript;
  if (!Array.isArray(c.segments)) throw new Error(`${path}: no segments[]`);
  return {
    key: c.key,
    duration: c.duration,
    model: c.model,
    ...(c.language ? { language: c.language } : {}),
    segments: c.segments.map(([start, end, text]) => ({ start, end, text })),
  };
}
