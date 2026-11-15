/**
 * The one door (integration-plan §0.3, C17). The only build module allowed to reference
 * data/transcripts. A transcript is returned only when ALL hold:
 *
 *   1. the build flag EMUNAS_TRANSCRIPT_VIEW is exactly "on" (default off), checked first, so with
 *      the flag off nothing is read at all;
 *   2. site-policy/transcript-eligibility.json is valid and has an entry for the recording;
 *   3. the entry's identity fields (model, mode, transcribedAt) equal the compact transcript's
 *      top-level fields, so a re-transcription voids the approval.
 *
 * Otherwise `null`. It never throws for a missing or malformed file. Nothing in the build calls it
 * today; the transcript view (W5.2) is the only intended caller. `allowSearch` stays a separate,
 * later decision and is not honoured here.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as v from "valibot";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
export const TRANSCRIPTS_DIR = resolve(REPO_ROOT, "data/transcripts");
export const ELIGIBILITY_FILE = resolve(REPO_ROOT, "site-policy/transcript-eligibility.json");
export const TRANSCRIPT_FLAG = "EMUNAS_TRANSCRIPT_VIEW";

const RECORDING_ID = /^[a-z0-9][a-z0-9-]*$/;

const EntrySchema = v.object({
  model: v.string(),
  mode: v.nullable(v.string()),
  transcribedAt: v.nullable(v.string()),
  quality: v.picklist(["reviewed", "high-asr"]),
  approvedBy: v.string(),
  approvedAt: v.string(),
  allowSearch: v.literal(false),
  note: v.exactOptional(v.nullable(v.string())),
});

const EligibilitySchema = v.object({
  policyVersion: v.literal(1),
  eligible: v.record(v.string(), EntrySchema),
});

const TranscriptSchema = v.object({
  recordingId: v.string(),
  model: v.string(),
  mode: v.nullable(v.string()),
  transcribedAt: v.nullable(v.string()),
  language: v.nullable(v.string()),
  duration: v.number(),
  segments: v.array(v.tuple([v.number(), v.number(), v.string()])),
});

export type EligibilityEntry = v.InferOutput<typeof EntrySchema>;
export type EligibleTranscript = v.InferOutput<typeof TranscriptSchema>;

export interface GateOptions {
  env?: Readonly<Record<string, string | undefined>>;
  /** Override for tests. */
  eligibilityFile?: string;
  /** Override for tests. */
  transcriptsDir?: string;
}

export function transcriptViewEnabled(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return env[TRANSCRIPT_FLAG] === "on";
}

function readJson(path: string): unknown {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
}

/** The eligibility entry for a recording, or null (flag is not consulted here). */
export function eligibilityEntry(recordingId: string, opts: GateOptions = {}): EligibilityEntry | null {
  const r = v.safeParse(EligibilitySchema, readJson(opts.eligibilityFile ?? ELIGIBILITY_FILE));
  if (!r.success) return null;
  return Object.hasOwn(r.output.eligible, recordingId) ? r.output.eligible[recordingId]! : null;
}

export function readEligibleTranscript(recordingId: string, opts: GateOptions = {}): EligibleTranscript | null {
  if (!transcriptViewEnabled(opts.env ?? process.env)) return null;
  if (!RECORDING_ID.test(recordingId)) return null;
  const entry = eligibilityEntry(recordingId, opts);
  if (!entry) return null;
  const t = v.safeParse(TranscriptSchema, readJson(join(opts.transcriptsDir ?? TRANSCRIPTS_DIR, `${recordingId}.json`)));
  if (!t.success) return null;
  const tr = t.output;
  if (tr.recordingId !== recordingId) return null;
  if (tr.model !== entry.model || tr.mode !== entry.mode || tr.transcribedAt !== entry.transcribedAt) return null;
  return tr;
}
