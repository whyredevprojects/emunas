/**
 * The one door (integration-plan §0.3, C17, §4 last bullet). The only build module allowed to
 * reference data/transcripts. A transcript is returned only when ALL hold:
 *
 *   1. the build flag EMUNAS_TRANSCRIPT_VIEW is exactly "on" (default off), checked first, so with
 *      the flag off nothing is read at all;
 *   2. site-policy/transcript-eligibility.json is valid and has an entry for the recording;
 *   3. the entry's identity fields (model, mode, transcribedAt) equal the compact transcript's
 *      top-level fields, so a re-transcription voids the approval.
 *
 * Otherwise `null`. It never throws for a missing or malformed file.
 *
 * Three layers use it (W5.2):
 *   - `emitEligibleTranscripts` (called by corpus:build) writes `.corpus/transcript/<recordingId>.json`
 *     for gate-approved, in-scope recordings only, and removes the folder when the flag is off;
 *   - `readPublishedTranscripts` is how the two sites read those files back. It re-checks the flag
 *     and the eligibility entry, so a stale `.corpus/` built with the flag on never leaks into a site
 *     build made with the flag off;
 *   - `@emunas/corpus-guard` (src/eligible.ts) accepts a shipped `transcript/<id>.json` only for the
 *     same ids and the same identity version, and scans everything else as before.
 *
 * `allowSearch` stays a separate, later decision: it must be `false` here, and nothing in the search
 * path (search-core, Pagefind, D1, Vectorize) reads transcripts.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as v from "valibot";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
export const TRANSCRIPTS_DIR = resolve(REPO_ROOT, "data/transcripts");
export const ELIGIBILITY_FILE = resolve(REPO_ROOT, "site-policy/transcript-eligibility.json");
export const TRANSCRIPT_FLAG = "EMUNAS_TRANSCRIPT_VIEW";
/** Folder name of the public transcript files, in `.corpus/` and in each site's output. */
export const PUBLIC_TRANSCRIPT_DIR = "transcript";
export const PUBLIC_TRANSCRIPT_SCHEMA = 1;

const RECORDING_ID = /^[a-z0-9][a-z0-9-]*$/;

type Env = Readonly<Record<string, string | undefined>>;

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

const Seconds = v.pipe(v.number(), v.minValue(0));

/** The public file shape. No pipeline field names (model, segments, …) appear in it. */
const PublicTranscriptSchema = v.strictObject({
  schemaVersion: v.literal(1),
  recordingId: v.pipe(v.string(), v.regex(RECORDING_ID)),
  quality: v.picklist(["reviewed", "high-asr"]),
  lang: v.nullable(v.string()),
  version: v.pipe(v.string(), v.regex(/^[0-9a-f]{16}$/)),
  cues: v.array(v.tuple([Seconds, Seconds, v.string()])),
});

export type EligibilityEntry = v.InferOutput<typeof EntrySchema>;
export type EligibleTranscript = v.InferOutput<typeof TranscriptSchema>;
/**
 * `.corpus/transcript/<recordingId>.json` and the sites' `transcript/<recordingId>.json`.
 * `cues` are `[start, end, text]` in recording-local seconds; `version` identifies the approved
 * transcription (see `transcriptVersion`).
 */
export type PublicTranscriptFile = v.InferOutput<typeof PublicTranscriptSchema>;

export interface GateOptions {
  env?: Env;
  /** Override for tests. */
  eligibilityFile?: string;
  /** Override for tests. */
  transcriptsDir?: string;
}

export function transcriptViewEnabled(env: Env = process.env): boolean {
  return env[TRANSCRIPT_FLAG] === "on";
}

/**
 * Short id of an approved transcription: sha256 over the identity fields. The guard computes the
 * same value from the eligibility entry (packages/corpus-guard/src/eligible.ts), so a file built
 * from another transcription is rejected even when its recording id is eligible.
 */
export function transcriptVersion(identity: { model: string; mode: string | null; transcribedAt: string | null }): string {
  return createHash("sha256")
    .update(JSON.stringify([identity.model, identity.mode, identity.transcribedAt]))
    .digest("hex")
    .slice(0, 16);
}

function readJson(path: string): unknown {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
}

function readEligibility(file: string): Record<string, EligibilityEntry> | null {
  const r = v.safeParse(EligibilitySchema, readJson(file));
  return r.success ? r.output.eligible : null;
}

/** The eligibility entry for a recording, or null (flag is not consulted here). */
export function eligibilityEntry(recordingId: string, opts: GateOptions = {}): EligibilityEntry | null {
  const eligible = readEligibility(opts.eligibilityFile ?? ELIGIBILITY_FILE);
  if (!eligible) return null;
  return Object.hasOwn(eligible, recordingId) ? eligible[recordingId]! : null;
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

/** The public projection of an approved transcript (copies allowed fields only). */
export function toPublicTranscript(tr: EligibleTranscript, entry: EligibilityEntry): PublicTranscriptFile {
  const cues: [number, number, string][] = [];
  for (const [start, end, text] of tr.segments) {
    const clean = text.replace(/\s+/g, " ").trim();
    if (clean === "" || !(start >= 0) || !(end >= start)) continue;
    cues.push([start, end, clean]);
  }
  return {
    schemaVersion: PUBLIC_TRANSCRIPT_SCHEMA,
    recordingId: tr.recordingId,
    quality: entry.quality,
    lang: tr.language,
    version: transcriptVersion(entry),
    cues,
  };
}

export interface EmitOptions {
  /** `.corpus/` (the files go to `<outDir>/transcript/`). */
  outDir: string;
  /** Recordings of in-scope shiurim; an eligible id outside this set is skipped. */
  recordingIds: Iterable<string>;
  /** Pipeline data folder; transcripts are read from its `transcripts/` folder. Default: the repo's. */
  dataDir?: string;
  /** `site-policy/` folder holding transcript-eligibility.json. Default: the repo's. */
  policyDir?: string;
  env?: Env;
}

export type EmitSkipReason = "not-in-corpus" | "bad-id" | "unavailable-or-identity-mismatch";

export interface EmitResult {
  enabled: boolean;
  /** Recording ids written (sorted). */
  emitted: string[];
  /** Ids only, never text. */
  skipped: { recordingId: string; reason: EmitSkipReason }[];
  /** Stale entries removed from `<outDir>/transcript/`. */
  removed: string[];
}

/**
 * corpus:build step: writes `<outDir>/transcript/<recordingId>.json` for exactly the recordings the
 * gate approves, and removes every other entry there. With the flag off the folder is removed and
 * neither the eligibility file nor any transcript is read.
 */
export function emitEligibleTranscripts(opts: EmitOptions): EmitResult {
  const env = opts.env ?? process.env;
  const dir = join(opts.outDir, PUBLIC_TRANSCRIPT_DIR);
  if (!transcriptViewEnabled(env)) {
    const removed = existsSync(dir) ? readdirSync(dir).sort() : [];
    rmSync(dir, { recursive: true, force: true });
    return { enabled: false, emitted: [], skipped: [], removed };
  }
  const eligibilityFile = opts.policyDir ? join(opts.policyDir, "transcript-eligibility.json") : ELIGIBILITY_FILE;
  const transcriptsDir = opts.dataDir ? join(opts.dataDir, "transcripts") : TRANSCRIPTS_DIR;
  const inScope = new Set(opts.recordingIds);
  const eligible = readEligibility(eligibilityFile) ?? {};
  const files = new Map<string, string>();
  const skipped: EmitResult["skipped"] = [];
  for (const id of Object.keys(eligible).sort()) {
    if (!RECORDING_ID.test(id)) {
      skipped.push({ recordingId: id, reason: "bad-id" });
      continue;
    }
    if (!inScope.has(id)) {
      skipped.push({ recordingId: id, reason: "not-in-corpus" });
      continue;
    }
    const tr = readEligibleTranscript(id, { env, eligibilityFile, transcriptsDir });
    if (!tr) {
      skipped.push({ recordingId: id, reason: "unavailable-or-identity-mismatch" });
      continue;
    }
    files.set(`${id}.json`, `${JSON.stringify(toPublicTranscript(tr, eligible[id]!))}\n`);
  }
  const removed: string[] = [];
  if (existsSync(dir)) {
    for (const f of readdirSync(dir).sort()) {
      if (!files.has(f)) {
        rmSync(join(dir, f), { recursive: true, force: true });
        removed.push(f);
      }
    }
  }
  if (files.size === 0) {
    rmSync(dir, { recursive: true, force: true });
    return { enabled: true, emitted: [], skipped, removed };
  }
  mkdirSync(dir, { recursive: true });
  for (const [name, text] of files) {
    const path = join(dir, name);
    if (existsSync(path) && readFileSync(path, "utf8") === text) continue;
    const tmp = `${path}.tmp-${process.pid}`;
    writeFileSync(tmp, text);
    renameSync(tmp, path);
  }
  return { enabled: true, emitted: [...files.keys()].map((f) => f.slice(0, -".json".length)), skipped, removed };
}

/** Env override of the `site-policy/` folder the sites re-check against (tests, fixture builds). */
export const SITE_POLICY_ENV = "EMUNAS_SITE_POLICY_DIR";

export interface PublishedOptions {
  env?: Env;
  /** Default: `$EMUNAS_SITE_POLICY_DIR/transcript-eligibility.json`, else the repo's site-policy file. */
  eligibilityFile?: string;
}

/**
 * Site-build side: the public transcript files in `<corpusDir>/transcript/` that may ship, keyed by
 * recording id. Empty unless the flag is on. A file is returned only when it has the public shape,
 * its name matches its `recordingId`, and the recording still has an eligibility entry whose identity
 * version equals the file's. Never reads the pipeline's transcripts.
 */
export function readPublishedTranscripts(corpusDir: string, opts: PublishedOptions = {}): Map<string, PublicTranscriptFile> {
  const out = new Map<string, PublicTranscriptFile>();
  const env = opts.env ?? process.env;
  if (!transcriptViewEnabled(env)) return out;
  const dir = join(corpusDir, PUBLIC_TRANSCRIPT_DIR);
  if (!existsSync(dir)) return out;
  const policyDir = env[SITE_POLICY_ENV]?.trim();
  const eligible = readEligibility(
    opts.eligibilityFile ?? (policyDir ? join(policyDir, "transcript-eligibility.json") : ELIGIBILITY_FILE),
  );
  if (!eligible) return out;
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith(".json")) continue;
    const id = name.slice(0, -".json".length);
    if (!RECORDING_ID.test(id) || !Object.hasOwn(eligible, id)) continue;
    const r = v.safeParse(PublicTranscriptSchema, readJson(join(dir, name)));
    if (!r.success || r.output.recordingId !== id) continue;
    if (r.output.version !== transcriptVersion(eligible[id]!)) continue;
    out.set(id, r.output);
  }
  return out;
}
