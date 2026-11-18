/**
 * The AI-improved copies of the recordings (docs/sites/cleaned-audio-ux.md). Each one sits in the
 * same `emunas` bucket at `fixed/sidon/<served key>`: the served key (`servedKey`, so the `.mp3`
 * transcode for the three `.WMA` recordings) unchanged, under this prefix. The sites play it by
 * default and keep the original one click away; downloads always use the original.
 *
 * Pure and browser/Workers-safe.
 */
import { refuseKey } from "./media.ts";

/** Bucket prefix of the improved copies. */
export const CLEANED_PREFIX = "fixed/sidon/";

/**
 * Bucket key of the improved copy of a recording: `CLEANED_PREFIX + servedKey`. Throws when the
 * served key may not become a URL (`refuseKey`) or is not an `.mp3` key; both are build bugs.
 */
export function cleanedKey(servedKey: string): string {
  const refusal = refuseKey(servedKey);
  if (refusal) throw new Error(`Refusing to build an improved-copy key for this key (${refusal})`);
  if (!servedKey.toLowerCase().endsWith(".mp3")) throw new Error("An improved-copy key needs an .mp3 served key");
  return `${CLEANED_PREFIX}${servedKey}`;
}
