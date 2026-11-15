/**
 * The sync's own leak gate (defence in depth behind the deploy's guard post-pass): before
 * anything is written, the moments NDJSON it reads and the vector metadata it will upsert are
 * scanned by @emunas/corpus-guard for forbidden keys and substrings and, when the transcript
 * folder is present (CI checkout), for verbatim transcript runs. Any finding aborts the sync.
 * Findings carry ids, field names and lengths only, never text.
 *
 * The transcript folder is located through @emunas/corpus-guard, the only site package allowed
 * to read it; this package never names it.
 */
import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { DEFAULT_TRANSCRIPTS_DIR, createLeakScanner, type Finding } from "@emunas/corpus-guard";

export interface GuardOutcome {
  verbatimChecked: boolean;
  findings: Finding[];
}

export function guardSyncInputs(repoRoot: string, corpusDir: string, files: readonly string[], opts: { verbatim: boolean }): GuardOutcome {
  const transcripts = isAbsolute(DEFAULT_TRANSCRIPTS_DIR) ? DEFAULT_TRANSCRIPTS_DIR : join(repoRoot, DEFAULT_TRANSCRIPTS_DIR);
  const scanner = createLeakScanner({
    corpusDir,
    transcriptsDir: opts.verbatim && existsSync(transcripts) ? transcripts : null,
    siteDir: join(repoRoot, "site-policy"),
    baseDir: corpusDir,
  });
  scanner.scanPaths([...files]);
  const r = scanner.result();
  return { verbatimChecked: r.verbatimChecked, findings: r.findings };
}
