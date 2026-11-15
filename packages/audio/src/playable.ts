/**
 * Playability rule (integration-plan Amendment A1): only `.mp3` objects (any letter case; the archive
 * has `.MP3` files) are linked. Anything else (3 `.WMA` recordings today) is shown as unavailable.
 * A key that may not become a URL at all (`refuseKey`) is unplayable too.
 *
 * Pure and browser/Workers-safe.
 */
import { refuseKey, type KeyRefusal } from "./media.ts";

export type UnplayableReason = "not-mp3" | KeyRefusal;

/** Why a recording with this key is not playable in a browser, or null when it is. */
export function unplayableReason(audioKey: string): UnplayableReason | null {
  const refusal = refuseKey(audioKey);
  if (refusal) return refusal;
  if (!audioKey.toLowerCase().endsWith(".mp3")) return "not-mp3";
  return null;
}

export function isPlayableKey(audioKey: string): boolean {
  return unplayableReason(audioKey) === null;
}
