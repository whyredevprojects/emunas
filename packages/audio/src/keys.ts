/**
 * Rules for which private-bucket keys may ever be copied to the public audio
 * bucket (integration-plan §3.2). Pure; shared by the audio table builder and the
 * publish CLI.
 */

export type KeyRefusal = "not-mp3" | "transcripts-prefix" | "suspicious-key";

/** Control characters and backslashes never appear in a real archive key. */
function hasBadChars(key: string): boolean {
  for (let i = 0; i < key.length; i++) {
    const c = key.charCodeAt(i);
    if (c < 0x20 || c === 0x7f || c === 0x5c) return true;
  }
  return false;
}

/**
 * Why a source key must not be published, or null when it is fine.
 * - must not start with `transcripts/` (case-insensitive, leading slashes ignored);
 * - no empty key, `..` / `.` path segments, backslashes or control characters;
 * - must end in `.mp3` (case-insensitive: the archive has `.MP3` files).
 */
export function refuseSourceKey(key: string): KeyRefusal | null {
  const trimmed = key.replace(/^\/+/, "");
  if (trimmed.toLowerCase().startsWith("transcripts/")) return "transcripts-prefix";
  if (trimmed.length === 0 || hasBadChars(trimmed)) return "suspicious-key";
  if (trimmed.split("/").some((seg) => seg === ".." || seg === ".")) return "suspicious-key";
  if (!trimmed.toLowerCase().endsWith(".mp3")) return "not-mp3";
  return null;
}

export function isPublishableSourceKey(key: string): boolean {
  return refuseSourceKey(key) === null;
}

/** Destination key in `emunas-audio`: `<recordingId>.mp3`. */
export function publicObjectKey(recordingId: string): string {
  return `${recordingId}.mp3`;
}
