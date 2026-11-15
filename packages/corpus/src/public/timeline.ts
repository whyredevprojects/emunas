/**
 * Timeline math shared by both players (C5): global seconds ↔ recording-local seconds.
 * Pure and browser-safe.
 */

export interface TimelineRecording {
  id: string;
  offset: number;
  duration: number;
}

export interface Timeline {
  recordings: readonly TimelineRecording[];
}

export interface LocalTime {
  recordingId: string;
  /** Seconds into that recording. */
  t: number;
}

/** Total length in seconds. */
export function timelineDuration(tl: Timeline): number {
  const last = tl.recordings[tl.recordings.length - 1];
  return last ? last.offset + last.duration : 0;
}

/**
 * Global seconds → recording + local seconds. A time on a boundary belongs to the later recording.
 * Times before 0 clamp to the first recording's start, times past the end to the last recording's end.
 * Returns null only for a timeline without recordings.
 */
export function toLocal(tl: Timeline, t: number): LocalTime | null {
  const recs = tl.recordings;
  const first = recs[0];
  if (!first) return null;
  const g = Number.isFinite(t) ? Math.max(0, t) : 0;
  for (let i = recs.length - 1; i >= 0; i--) {
    const r = recs[i]!;
    if (g >= r.offset) {
      return { recordingId: r.id, t: round3(Math.min(g - r.offset, r.duration)) };
    }
  }
  return { recordingId: first.id, t: 0 };
}

/** Recording + local seconds → global seconds; null for an unknown recording id. */
export function toGlobal(tl: Timeline, recordingId: string, t: number): number | null {
  const r = tl.recordings.find((x) => x.id === recordingId);
  if (!r) return null;
  const local = Number.isFinite(t) ? Math.min(Math.max(0, t), r.duration) : 0;
  return round3(r.offset + local);
}

/** Cumulative offsets for durations in playback order. */
export function offsetsFor(durations: readonly number[]): number[] {
  const out: number[] = [];
  let acc = 0;
  for (const d of durations) {
    out.push(round3(acc));
    acc += d;
  }
  return out;
}

/** Times are published with millisecond precision. */
export function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}
