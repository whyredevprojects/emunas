/**
 * Pure helpers of the player engine: recording lookup on the global timeline, chapter navigation and
 * the skip plan. No DOM, no timers.
 */
import { toLocal } from "@emunas/corpus/public";
import type { AudioVersion, PlayerChapter, PlayerRecording, PlayerShiur, SkipKind, SkipRange, SkipSettings } from "./types.ts";

/** Times within this many seconds count as "reached" (timers and media clocks are not exact). */
export const EPS = 0.05;

export const MIN_RATE = 0.75;
export const MAX_RATE = 2;

/** Previous restarts the current chapter when more than this many seconds of it have played. */
export const PREV_RESTART_SECONDS = 3;

export const DEFAULT_SKIP: SkipSettings = {
  enabled: true,
  kinds: ["noise", "singing", "other_speaker", "pause"],
  minSeconds: 20,
};

export function clampRate(rate: number): number {
  if (!Number.isFinite(rate)) return 1;
  return Math.min(MAX_RATE, Math.max(MIN_RATE, rate));
}

/**
 * The playable URL of a recording (Amendment A1): `audioUrl` on the media host; null (or empty) =
 * unavailable. With `version` "cleaned" it is the AI-improved copy when the recording has one.
 */
export function recordingAudioUrl(rec: PlayerRecording, version: AudioVersion = "original"): string | null {
  if (!rec.audioUrl) return null;
  return version === "cleaned" && rec.cleanedUrl ? rec.cleanedUrl : rec.audioUrl;
}

/** Global seconds → index of the recording and seconds into it. */
export function locate(shiur: PlayerShiur, t: number): { index: number; local: number } | null {
  const loc = toLocal({ recordings: shiur.recordings }, t);
  if (!loc) return null;
  const index = shiur.recordings.findIndex((r) => r.id === loc.recordingId);
  return index < 0 ? null : { index, local: loc.t };
}

export function chaptersOf(shiur: PlayerShiur): readonly PlayerChapter[] {
  return shiur.notes?.chapters ?? [];
}

/** Index of the chapter playing at `t` (the last one starting at or before it), -1 if none. */
export function chapterIndexAt(chapters: readonly PlayerChapter[], t: number): number {
  let found = -1;
  for (let i = 0; i < chapters.length; i++) {
    if (chapters[i]!.t <= t + EPS) found = i;
    else break;
  }
  return found;
}

/** A skip range after filtering by settings and merging neighbours; `key` identifies it for undo. */
export interface PlannedSkip {
  start: number;
  end: number;
  kind: SkipKind;
  key: string;
}

/** Ranges closer than this are merged into one skip (one event, one undo). */
const MERGE_GAP = 0.5;

export function planSkips(ranges: readonly SkipRange[], settings: SkipSettings, duration: number): PlannedSkip[] {
  if (!settings.enabled) return [];
  const kinds = new Set<SkipKind>(settings.kinds);
  const picked = ranges
    .filter(([s, e, k]) => kinds.has(k) && Number.isFinite(s) && Number.isFinite(e) && e > s)
    .map(([s, e, k]) => ({ start: Math.max(0, s), end: Math.min(duration, e), kind: k }))
    .filter((r) => r.end > r.start)
    .sort((a, b) => a.start - b.start);

  const out: PlannedSkip[] = [];
  let cur: { start: number; end: number; parts: { kind: SkipKind; len: number }[] } | null = null;
  const flush = () => {
    if (!cur) return;
    if (cur.end - cur.start >= settings.minSeconds) {
      let best = cur.parts[0]!;
      for (const p of cur.parts) if (p.len > best.len) best = p;
      out.push({ start: cur.start, end: cur.end, kind: best.kind, key: `${cur.start}-${cur.end}` });
    }
    cur = null;
  };
  for (const r of picked) {
    if (cur && r.start <= cur.end + MERGE_GAP) {
      cur.end = Math.max(cur.end, r.end);
      cur.parts.push({ kind: r.kind, len: r.end - r.start });
    } else {
      flush();
      cur = { start: r.start, end: r.end, parts: [{ kind: r.kind, len: r.end - r.start }] };
    }
  }
  flush();
  return out;
}

/** The planned skip containing `t`, if any (start inclusive within EPS, end exclusive). */
export function skipContaining(plan: readonly PlannedSkip[], t: number, suppressed: ReadonlySet<string>): PlannedSkip | null {
  for (const p of plan) {
    if (suppressed.has(p.key)) continue;
    if (p.start - EPS <= t && t < p.end - EPS) return p;
  }
  return null;
}

/** The next unsuppressed skip that ends after `t` (it may already contain `t`). */
export function nextSkip(plan: readonly PlannedSkip[], t: number, suppressed: ReadonlySet<string>): PlannedSkip | null {
  for (const p of plan) {
    if (suppressed.has(p.key)) continue;
    if (p.end - EPS > t) return p;
  }
  return null;
}

/** True when a chapter lies entirely inside an active skip (navigation passes over it). */
export function chapterIsSkipped(
  ch: PlayerChapter,
  plan: readonly PlannedSkip[],
  suppressed: ReadonlySet<string>,
): boolean {
  const p = skipContaining(plan, ch.t, suppressed);
  return p !== null && p.end >= ch.end - EPS;
}

/** Target of "next chapter" from `t`; null means "past the last chapter" (end of shiur). */
export function nextChapterTarget(
  chapters: readonly PlayerChapter[],
  t: number,
  plan: readonly PlannedSkip[],
  suppressed: ReadonlySet<string>,
): number | null {
  let i = chapterIndexAt(chapters, t) + 1;
  while (i < chapters.length && chapterIsSkipped(chapters[i]!, plan, suppressed)) i++;
  const ch = chapters[i];
  return ch ? ch.t : null;
}

/**
 * Target of "previous chapter" from `t`: the current chapter's start when more than 3 s of it have
 * played, else the previous (non-skipped) chapter's start, else 0.
 */
export function prevChapterTarget(
  chapters: readonly PlayerChapter[],
  t: number,
  plan: readonly PlannedSkip[],
  suppressed: ReadonlySet<string>,
): number {
  const i = chapterIndexAt(chapters, t);
  if (i < 0) return 0;
  const cur = chapters[i]!;
  if (t - cur.t > PREV_RESTART_SECONDS) return cur.t;
  let j = i - 1;
  while (j >= 0 && chapterIsSkipped(chapters[j]!, plan, suppressed)) j--;
  const prev = chapters[j];
  return prev ? prev.t : 0;
}
