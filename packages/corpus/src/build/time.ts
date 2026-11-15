/**
 * Time model (C5, C6): segment indices → global seconds. Global time of a recording-local second is
 * `offset(recording) + local`, offsets being cumulative durations in playback order.
 *
 *  - Item time: min over its evidence segs of `starts[seg]` → t; `ends[max seg]` → end.
 *  - Recording for an item: `evidence.recordingId` → the section's recording (write-up paragraphs)
 *    → the only recording.
 *  - Out-of-range segs are ignored; with none left the item has no time (t = end = null) and a
 *    warning is reported. The item itself stays.
 */
import { round3 } from "../public/timeline.ts";

export interface RecTime {
  id: string;
  order: number;
  offset: number;
  duration: number;
  starts: readonly number[];
  ends: readonly number[];
}

export interface Span {
  t: number;
  end: number;
}

export type SpanResult = { ok: true; span: Span } | { ok: false; reason: string };

export class TimeModel {
  readonly recs: readonly RecTime[];
  private readonly byId: Map<string, RecTime>;

  constructor(recs: readonly RecTime[]) {
    this.recs = recs;
    this.byId = new Map(recs.map((r) => [r.id, r]));
  }

  get duration(): number {
    const last = this.recs[this.recs.length - 1];
    return last ? round3(last.offset + last.duration) : 0;
  }

  rec(id: string): RecTime | undefined {
    return this.byId.get(id);
  }

  /** Clamp a local time into the recording and make it global. */
  global(rec: RecTime, local: number): number {
    return round3(rec.offset + Math.min(Math.max(0, local), rec.duration));
  }

  /** Pick the recording for an item: explicit id → fallback (section's) → the only recording. */
  pick(recordingId: string | undefined, fallback?: string): RecTime | string {
    if (recordingId !== undefined) return this.rec(recordingId) ?? `recording ${recordingId} is not part of the shiur`;
    if (fallback !== undefined) return this.rec(fallback) ?? `recording ${fallback} is not part of the shiur`;
    if (this.recs.length === 1) return this.recs[0]!;
    return "no recording given on a multi-recording shiur";
  }

  span(recordingId: string | undefined, segs: readonly number[], fallback?: string): SpanResult {
    const rec = this.pick(recordingId, fallback);
    if (typeof rec === "string") return { ok: false, reason: rec };
    const valid = segs.filter((s) => Number.isInteger(s) && s >= 0 && s < rec.starts.length && s < rec.ends.length);
    if (valid.length === 0) {
      return { ok: false, reason: segs.length === 0 ? "no evidence segments" : "evidence segments out of range" };
    }
    const first = Math.min(...valid);
    const last = Math.max(...valid);
    const t = this.global(rec, rec.starts[first]!);
    const end = Math.max(t, this.global(rec, rec.ends[last]!));
    return { ok: true, span: { t, end } };
  }
}

/** Merge [start, end] ranges that touch or overlap (input in any order). */
export function mergeRanges(ranges: readonly [number, number][]): [number, number][] {
  const sorted = [...ranges].filter(([a, b]) => b >= a).sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  const out: [number, number][] = [];
  for (const [a, b] of sorted) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}
