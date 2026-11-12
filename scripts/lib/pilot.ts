// Shared helpers for the P4 pilot kit (prepare-pilot.ts, validate.ts).
import { readFileSync, existsSync } from "node:fs";
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

/** Minimal .env loader: KEY=VALUE lines, optional quotes, '#' comments. Never logs values. */
export function loadDotEnv(path = ".env"): void {
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1]!;
    let val = m[2]!.trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
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
