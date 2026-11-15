/**
 * Build side of the Transcript tab (Node only; called by `data-build/cli.ts emit`, never by the
 * client — the `.server` suffix makes React Router refuse a client import).
 *
 * Returns the data files `transcript/<recordingId>.json` (under `public/data/`) for exactly the
 * public transcript files the transcript gate wrote to `.corpus/transcript/` and that
 * `readPublishedTranscripts` still accepts: EMUNAS_TRANSCRIPT_VIEW=on, an eligibility entry, the same
 * identity version. With the defaults the map is empty, so the data writer removes any stale
 * `transcript/` folder and the build output has none. The files are copied unchanged (the guard
 * accepts only the gate's exact shape).
 */
import { readPublishedTranscripts, type PublicTranscriptFile } from "@emunas/corpus/transcript-gate";

const TRANSCRIPT_FILE = /^transcript\/[a-z0-9][a-z0-9-]*\.json$/;

/** True for a data-root-relative path of a public transcript file. */
export function isTranscriptDataFile(rel: string): boolean {
  return TRANSCRIPT_FILE.test(rel);
}

export function transcriptDataFiles(
  corpusDir: string,
  opts: { env?: Readonly<Record<string, string | undefined>>; eligibilityFile?: string } = {},
): Map<string, PublicTranscriptFile> {
  const out = new Map<string, PublicTranscriptFile>();
  for (const [id, file] of readPublishedTranscripts(corpusDir, opts)) out.set(`transcript/${id}.json`, file);
  return out;
}
