/**
 * Playability rule (integration-plan Amendment A1): only `.mp3` objects (any letter case; the archive
 * has `.MP3` files) are linked. Anything else (3 `.WMA` recordings today) is shown as unavailable,
 * unless its key is listed in `site-policy/audio-transcoded.json`: then an MP3 transcode sits next
 * to it in the bucket (same key, extension `.mp3`, see `scripts/transcode-wma.ts`) and that is linked.
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

/**
 * Key of the MP3 transcode stored next to a non-mp3 object: the same key with its extension
 * replaced by `.mp3` (`a/b.WMA` → `a/b.mp3`). Null when the key is refused, already `.mp3`, or its
 * last segment has no extension.
 */
export function mp3SiblingKey(audioKey: string): string | null {
  if (refuseKey(audioKey)) return null;
  if (audioKey.toLowerCase().endsWith(".mp3")) return null;
  const slash = audioKey.lastIndexOf("/");
  const dot = audioKey.lastIndexOf(".");
  if (dot <= slash + 1) return null;
  const sibling = `${audioKey.slice(0, dot)}.mp3`;
  return refuseKey(sibling) ? null : sibling;
}

/**
 * The bucket key to link for a recording: the key itself when it is playable, else its MP3 sibling
 * when the key is listed in `transcoded` (original keys from `site-policy/audio-transcoded.json`),
 * else null.
 */
export function servedKey(audioKey: string, transcoded: ReadonlySet<string> = new Set()): string | null {
  const reason = unplayableReason(audioKey);
  if (reason === null) return audioKey;
  if (reason === "not-mp3" && transcoded.has(audioKey)) return mp3SiblingKey(audioKey);
  return null;
}
