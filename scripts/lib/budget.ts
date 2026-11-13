// Write-up length rule (P4b), shared by the budget CLI, input headers and the validator.
//
// Target: ~800-1000 words per audio hour per language (900 planned), counted over content sections only
// (singing / other_speaker / noise sections get no block). The total is allocated to sections by
// duration; a brachah counts half; every content section gets at least MIN_SECTION_WORDS.
import type { Extraction, SectionKind } from "../../src/types.js";
import type { PilotMeta } from "./pilot.js";

export const WRITEUP_WORDS_PER_HOUR = { min: 800, target: 900, max: 1000 } as const;
export const NON_CONTENT_KINDS: ReadonlySet<SectionKind> = new Set<SectionKind>(["singing", "noise", "other_speaker"]);
const KIND_WEIGHT: Partial<Record<SectionKind, number>> = { brachah: 0.5 };
const MIN_SECTION_WORDS = 40;
/** Validator tolerance around the [min, max] range (per language, whole write-up). */
export const WRITEUP_TOLERANCE = { warnLow: 0.85, warnHigh: 1.15, errLow: 0.4, errHigh: 2.0 } as const;
/** A block is reported when it exceeds budget * blockWarnHigh + blockWarnSlack words. */
export const BLOCK_TOLERANCE = { warnHigh: 1.75, slack: 40 } as const;

export interface SectionBudget {
  sectionIndex: number;
  kind: SectionKind;
  durationSec: number;
  /** Planned words per language; null = no block for this section. */
  words: number | null;
}

export interface WriteupBudget {
  sections: SectionBudget[];
  contentSec: number;
  total: number;
  min: number;
  max: number;
}

/** Word range for a whole recording length (used in input headers, before sections exist). */
export function headerWordRange(totalSec: number): { min: number; max: number } {
  const h = totalSec / 3600;
  return { min: Math.round(WRITEUP_WORDS_PER_HOUR.min * h), max: Math.round(WRITEUP_WORDS_PER_HOUR.max * h) };
}

const round10 = (n: number) => Math.max(10, Math.round(n / 10) * 10);

/** Section durations as the player sees them: start of the section to start of the next segment
 *  after it (or the recording's end). */
export function sectionDurations(x: Extraction, meta: PilotMeta): number[] {
  const recs = new Map(meta.recordings.map((r) => [r.recording.id, r]));
  return x.sections.map((s) => {
    const rec = recs.get(s.recordingId);
    if (!rec) return 0;
    const start = rec.starts[s.startSeg] ?? 0;
    const end = s.endSeg + 1 < rec.segmentCount ? rec.starts[s.endSeg + 1] ?? rec.durationSec : rec.durationSec;
    return Math.max(0, end - start);
  });
}

export function writeupBudget(x: Extraction, meta: PilotMeta): WriteupBudget {
  const durs = sectionDurations(x, meta);
  const perSec = WRITEUP_WORDS_PER_HOUR.target / 3600;
  let contentSec = 0;
  const sections: SectionBudget[] = x.sections.map((s, i) => {
    const durationSec = durs[i] ?? 0;
    if (NON_CONTENT_KINDS.has(s.kind)) return { sectionIndex: i, kind: s.kind, durationSec, words: null };
    contentSec += durationSec;
    const w = (KIND_WEIGHT[s.kind] ?? 1) * perSec * durationSec;
    return { sectionIndex: i, kind: s.kind, durationSec, words: round10(Math.max(MIN_SECTION_WORDS, w)) };
  });
  const total = sections.reduce((a, s) => a + (s.words ?? 0), 0);
  const ratio = (k: "min" | "max") => WRITEUP_WORDS_PER_HOUR[k] / WRITEUP_WORDS_PER_HOUR.target;
  return { sections, contentSec, total, min: Math.round(total * ratio("min")), max: Math.round(total * ratio("max")) };
}
