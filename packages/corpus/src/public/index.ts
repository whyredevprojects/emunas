/**
 * `@emunas/corpus/public`: browser-safe. Types of the public contract, timeline helpers, moment ids
 * and shared constants. Nothing here imports Node built-ins.
 */
export type * from "./types.ts";
export * from "./timeline.ts";
export * from "./moment-id.ts";

/** Bump when the shape of anything in `.corpus/` changes. */
export const SCHEMA_VERSION = 1;

/**
 * Entity page thresholds (integration-plan §2.2, W2.1): Quiet makes a page for a work/person at
 * ≥2 shiurim and for a concept at ≥3; Live prerenders entities at ≥3.
 */
export const ENTITY_THRESHOLDS = {
  quiet: { work: 2, person: 2, concept: 3 },
  live: { prerender: 3 },
} as const;

/** Audio URL path for a recording (one scheme on both hosts, C12/C15). */
export function audioPath(recordingId: string): `/audio/${string}.mp3` {
  return `/audio/${recordingId}.mp3`;
}
