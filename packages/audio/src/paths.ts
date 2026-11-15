/**
 * Public audio URL scheme (integration-plan §3.2, C14, C15).
 *
 * Audio is served same-origin on each site host at `/audio/<recordingId>.mp3`.
 * `?download=1` (alias `?dl=1`) asks for an attachment. Recording ids are ASCII
 * slugs (`^[a-z0-9-]+$`); anything else is never a valid audio URL.
 *
 * Browser-safe: no Node or Workers APIs.
 */

/** A recording id as accepted anywhere in the audio layer. */
export const AUDIO_ID_RE = /^[a-z0-9-]+$/;

/** Upper bound on id length; real ids are < 80 chars. Guards against silly inputs. */
export const AUDIO_ID_MAX_LENGTH = 200;

export const AUDIO_PREFIX = "/audio/";
export const AUDIO_EXT = ".mp3";

export type AudioPath = `/audio/${string}.mp3`;

export function isAudioId(id: string): boolean {
  return id.length > 0 && id.length <= AUDIO_ID_MAX_LENGTH && AUDIO_ID_RE.test(id);
}

function assertId(id: string): void {
  if (!isAudioId(id)) throw new Error(`Invalid recording id for audio URL: ${JSON.stringify(id)}`);
}

/** `/audio/<id>.mp3`. Throws on an invalid id (a build bug, never user input). */
export function audioPath(id: string): AudioPath {
  assertId(id);
  return `/audio/${id}.mp3`;
}

/** `/audio/<id>.mp3?download=1`. */
export function downloadPath(id: string): `${AudioPath}?download=1` {
  return `${audioPath(id)}?download=1`;
}

/** `/audio/<id>.mp3#t=<sec>` media-fragment link (works without JS). Seconds are floored, ≥ 0. */
export function audioTimePath(id: string, seconds: number): `${AudioPath}#t=${number}` {
  const t = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${audioPath(id)}#t=${t}`;
}

/**
 * Parses a request pathname. Returns the recording id, or null when the path is
 * not exactly `/audio/<id>.mp3` with a valid id. The pathname is used as is
 * (still percent-encoded), so `%2F`, `%2E` and friends never match.
 */
export function parseAudioPath(pathname: string): string | null {
  if (!pathname.startsWith(AUDIO_PREFIX) || !pathname.endsWith(AUDIO_EXT)) return null;
  const id = pathname.slice(AUDIO_PREFIX.length, pathname.length - AUDIO_EXT.length);
  return isAudioId(id) ? id : null;
}

/** True when the query asks for an attachment: `download` or `dl` set to `1` or `true`. */
export function wantsDownload(searchParams: URLSearchParams): boolean {
  for (const name of ["download", "dl"]) {
    const v = searchParams.get(name);
    if (v === "1" || v === "true") return true;
  }
  return false;
}
