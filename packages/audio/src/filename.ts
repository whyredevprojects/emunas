/**
 * ASCII-safe download filenames for `Content-Disposition` (integration-plan §3.2).
 * Browser-safe and pure.
 */

const MAX_BASE_LENGTH = 100;

/**
 * Folds a title to a conservative ASCII filename base: Latin letters lose their
 * diacritics (ḥ → h), typographic quotes and dashes become plain, everything
 * outside `[A-Za-z0-9 ._-]` is dropped, whitespace collapses. Returns "" when
 * nothing usable is left (e.g. an all-Hebrew title).
 */
export function asciiFilenameBase(title: string): string {
  const folded = title
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    // Apostrophes (plain, typographic, transliteration ’) vanish inside words.
    .replace(/['‘’‚‛′ʼ]/g, "")
    .replace(/[‐-―−]/g, "-")
    .replace(/[^A-Za-z0-9 ._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    // No leading dots (hidden files) and no trailing dots/dashes/spaces.
    .replace(/^[.\s-]+/, "")
    .replace(/[.\s-]+$/, "");
  if (folded.length <= MAX_BASE_LENGTH) return folded;
  return folded.slice(0, MAX_BASE_LENGTH).replace(/[.\s-]+$/, "");
}

/** `<ascii title>.mp3`, falling back to `<recordingId>.mp3`. */
export function downloadFilename(title: string | null | undefined, recordingId: string): string {
  const base = title ? asciiFilenameBase(title) : "";
  return `${base || recordingId}.mp3`;
}

/** `attachment; filename="<name>"` with the name already ASCII-safe (no quotes or backslashes). */
export function attachmentDisposition(title: string | null | undefined, recordingId: string): string {
  return `attachment; filename="${downloadFilename(title, recordingId)}"`;
}
