/**
 * Which public transcript files the post-pass may accept (integration-plan §0.3, C17, §4; W5.2).
 *
 * A shipped `…/transcript/<recordingId>.json` is accepted only when ALL hold:
 *   1. EMUNAS_TRANSCRIPT_VIEW is exactly "on" (default off: then every such file is a finding);
 *   2. site-policy/transcript-eligibility.json has a valid entry for the id (`allowSearch: false`);
 *   3. when the guard has the transcripts folder, the current transcript's identity (model, mode,
 *      transcribedAt) still equals the entry's, so a re-transcription voids the approval here too;
 *   4. the file has exactly the public shape written by the transcript gate
 *      (packages/corpus/src/transcript-gate.ts): `{ schemaVersion: 1, recordingId, quality, lang,
 *      version, cues }`, its `recordingId` equals the file name and its `version` equals the
 *      entry's identity hash.
 * Everything else, including every other file of the same build, is scanned as before.
 *
 * The identity hash is computed here independently (sha256 over `[model, mode, transcribedAt]`,
 * first 16 hex digits) because this package does not depend on @emunas/corpus; the cross-package
 * tests in both sites build with the gate and check with this module.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const TRANSCRIPT_FLAG = "EMUNAS_TRANSCRIPT_VIEW";
const RECORDING_ID = /^[a-z0-9][a-z0-9-]*$/;
const VERSION = /^[0-9a-f]{16}$/;
const PUBLIC_KEYS = ["cues", "lang", "quality", "recordingId", "schemaVersion", "version"];
const QUALITY = new Set(["reviewed", "high-asr"]);

export interface TranscriptIdentity {
  model: string;
  mode: string | null;
  transcribedAt: string | null;
}

export interface TranscriptEligibility {
  enabled: boolean;
  /** Recording id → expected identity version. Empty when disabled. */
  versions: ReadonlyMap<string, string>;
}

export type TranscriptRejection =
  | "flag-off"
  | "not-eligible"
  | "not-json"
  | "bad-shape"
  | "id-mismatch"
  | "version-mismatch";

export const NO_TRANSCRIPTS: TranscriptEligibility = { enabled: false, versions: new Map() };

export function transcriptIdentityVersion(id: TranscriptIdentity): string {
  return createHash("sha256").update(JSON.stringify([id.model, id.mode, id.transcribedAt])).digest("hex").slice(0, 16);
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

const strOrNull = (x: unknown): x is string | null => x === null || typeof x === "string";

/** A usable entry (same rules as the gate's schema), or null. */
function identityOf(e: unknown): TranscriptIdentity | null {
  if (!isRecord(e)) return null;
  if (typeof e["model"] !== "string" || !strOrNull(e["mode"]) || !strOrNull(e["transcribedAt"])) return null;
  if (typeof e["quality"] !== "string" || !QUALITY.has(e["quality"])) return null;
  if (typeof e["approvedBy"] !== "string" || typeof e["approvedAt"] !== "string") return null;
  if (e["allowSearch"] !== false) return null;
  return { model: e["model"], mode: e["mode"], transcribedAt: e["transcribedAt"] };
}

function currentIdentity(transcriptsDir: string, id: string): TranscriptIdentity | null {
  const file = join(transcriptsDir, `${id}.json`);
  if (!existsSync(file)) return null;
  try {
    const t: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (!isRecord(t) || t["recordingId"] !== id) return null;
    if (typeof t["model"] !== "string" || !strOrNull(t["mode"]) || !strOrNull(t["transcribedAt"])) return null;
    return { model: t["model"], mode: t["mode"], transcribedAt: t["transcribedAt"] };
  } catch {
    return null;
  }
}

export interface EligibilityOptions {
  /** When given, an entry counts only while the current transcript still has the approved identity. */
  transcriptsDir?: string | null;
}

/**
 * Reads `<siteDir>/transcript-eligibility.json`. With the flag off nothing is read. A missing file
 * means nothing is eligible; a malformed top level is an error (a typo must not silently widen what
 * is allowed); an entry that does not validate is simply not eligible.
 */
export function readTranscriptEligibility(
  siteDir: string,
  env: Readonly<Record<string, string | undefined>>,
  opts: EligibilityOptions = {},
): TranscriptEligibility {
  if (env[TRANSCRIPT_FLAG] !== "on") return NO_TRANSCRIPTS;
  const file = join(siteDir, "transcript-eligibility.json");
  const versions = new Map<string, string>();
  if (!existsSync(file)) return { enabled: true, versions };
  const json: unknown = JSON.parse(readFileSync(file, "utf8"));
  const eligible = isRecord(json) ? json["eligible"] : undefined;
  if (!isRecord(eligible)) throw new Error(`${file}: expected { eligible: { <recordingId>: {...} } }`);
  for (const [id, e] of Object.entries(eligible)) {
    if (!RECORDING_ID.test(id)) continue;
    const identity = identityOf(e);
    if (!identity) continue;
    const version = transcriptIdentityVersion(identity);
    if (opts.transcriptsDir) {
      const now = currentIdentity(opts.transcriptsDir, id);
      if (!now || transcriptIdentityVersion(now) !== version) continue;
    }
    versions.set(id, version);
  }
  return { enabled: true, versions };
}

/** Why a shipped transcript file must not ship, or null when it is accepted. */
export function checkTranscriptFile(recordingId: string, raw: string, elig: TranscriptEligibility): TranscriptRejection | null {
  if (!elig.enabled) return "flag-off";
  const expected = elig.versions.get(recordingId);
  if (expected === undefined) return "not-eligible";
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return "not-json";
  }
  if (!isRecord(body)) return "bad-shape";
  const keys = Object.keys(body).sort();
  if (keys.length !== PUBLIC_KEYS.length || keys.some((k, i) => k !== PUBLIC_KEYS[i])) return "bad-shape";
  if (body["schemaVersion"] !== 1 || typeof body["quality"] !== "string" || !QUALITY.has(body["quality"])) return "bad-shape";
  if (!strOrNull(body["lang"]) || typeof body["version"] !== "string" || !VERSION.test(body["version"])) return "bad-shape";
  const cues = body["cues"];
  if (!Array.isArray(cues)) return "bad-shape";
  for (const c of cues) {
    if (!Array.isArray(c) || c.length !== 3) return "bad-shape";
    const [s, e, t] = c as unknown[];
    if (typeof s !== "number" || typeof e !== "number" || typeof t !== "string" || !(s >= 0) || !(e >= 0)) return "bad-shape";
  }
  if (body["recordingId"] !== recordingId) return "id-mismatch";
  if (body["version"] !== expected) return "version-mismatch";
  return null;
}
