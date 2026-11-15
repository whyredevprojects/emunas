/**
 * Reads the human-edited policy files the guard honours (site-policy/, integration-plan §1.2):
 *  - verbatim-allow.json: `[{ id, reason, reviewedBy, reviewedAt }]`
 *  - publish-policy.json: `allowVerbatim[]` (`{ id, reason }`)
 *  - transcript-eligibility.json: `{ policyVersion, eligible: { <recordingId>: {...} } }`
 * Only ids are read. A missing file means "nothing allowed"; a malformed file is an error
 * (a typo must not silently widen or narrow what is allowed).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readTranscriptEligibility } from "./eligible.ts";

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, "utf8"));
}

function idsOf(list: unknown, file: string): string[] {
  if (!Array.isArray(list)) throw new Error(`${file}: expected an array of { id, reason }`);
  return list.map((e, i) => {
    if (typeof e === "string") return e;
    if (typeof e === "object" && e !== null && typeof (e as { id?: unknown }).id === "string") {
      return (e as { id: string }).id;
    }
    throw new Error(`${file}: entry ${i} has no string id`);
  });
}

/** Item ids a person accepted despite a verbatim hit. */
export function readVerbatimAllow(siteDir: string): Set<string> {
  const out = new Set<string>();
  const allowFile = join(siteDir, "verbatim-allow.json");
  if (existsSync(allowFile)) for (const id of idsOf(readJson(allowFile), allowFile)) out.add(id);
  const policyFile = join(siteDir, "publish-policy.json");
  if (existsSync(policyFile)) {
    const policy = readJson(policyFile);
    const list = typeof policy === "object" && policy !== null ? (policy as { allowVerbatim?: unknown }).allowVerbatim : undefined;
    if (list !== undefined) for (const id of idsOf(list, `${policyFile} allowVerbatim`)) out.add(id);
  }
  return out;
}

/**
 * Recording ids whose public transcript file the post-pass may accept. Empty unless
 * `EMUNAS_TRANSCRIPT_VIEW=on`. The full rule (entry validity, identity version, file shape) is in
 * eligible.ts; this keeps the id-only view for callers that only need the set.
 */
export function readEligibleTranscriptIds(siteDir: string, env: Record<string, string | undefined>): Set<string> {
  return new Set(readTranscriptEligibility(siteDir, env).versions.keys());
}
