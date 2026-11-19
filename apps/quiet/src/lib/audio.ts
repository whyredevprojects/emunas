/**
 * Audio and time links (integration-plan Amendment A1, C5).
 *
 * Audio is served straight from the media host: each recording carries `audioUrl`
 * (`${MEDIA_ORIGIN}/${encoded audioKey}`, emitted by the corpus build), or `null` when it cannot
 * be played (non-mp3 source, not published). There is no `/audio/` route on the site.
 *
 * Public times are global seconds over the shiur's recordings; a no-JS time link must open the
 * right file at the recording-local second, so it is computed with `toLocal` from
 * `@emunas/corpus/public`.
 *
 * Every playable recording may also carry `cleanedUrl`, its copy with the sound improved by AI
 * (docs/sites/cleaned-audio-ux.md). The original plays by default: the `<audio src>`, the no-JS
 * time links and the download links use `playableUrl`; the improved copy is one click away.
 */
import { toLocal } from "@emunas/corpus/public";

/** What the shell needs of a recording (`PublicRecording` from `@emunas/corpus/public` fits). */
export interface AudioRecording {
  readonly id: string;
  /** Global seconds at which this recording starts. */
  readonly offset: number;
  /** Seconds. */
  readonly duration: number;
  /** Absolute URL on the media host, or null when the recording cannot be played. */
  readonly audioUrl: string | null;
  /** The AI-improved copy on the media host, or null when there is none (state C). */
  readonly cleanedUrl: string | null;
}

/**
 * The playability rule (A1): an http(s) URL whose path ends in `.mp3` (case-insensitive). Anything
 * else (missing, `.WMA`, a relative or odd URL) is shown as unavailable rather than linked.
 */
export function playableUrl(rec: Pick<AudioRecording, "audioUrl">): string | null {
  return checkUrl(rec.audioUrl);
}

/**
 * The improved copy's URL under the same rule, and only for a playable recording: null when the
 * recording has none or cannot be played at all.
 */
export function cleanedUrl(rec: Pick<AudioRecording, "audioUrl" | "cleanedUrl">): string | null {
  return playableUrl(rec) === null ? null : checkUrl(rec.cleanedUrl);
}

function checkUrl(raw: string | null): string | null {
  if (typeof raw !== "string" || raw === "") return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!/\.mp3$/i.test(url.pathname)) return null;
  url.hash = "";
  return url.href;
}

/**
 * Seconds for a media fragment (`#t=582.12`): the exact recording-local time (to the millisecond,
 * as `toLocal` gives it), never rounded to a whole second, so a link starts where the item does.
 * Media fragments (`npt`) and the player both take fractional seconds.
 */
export function fragmentSeconds(local: number): number {
  return Number.isFinite(local) ? Math.max(0, Math.round(local * 1000) / 1000) : 0;
}

/** `582.12` → `"582.12"`, `754` → `"754"`: the shortest form of `fragmentSeconds`. */
export function formatFragment(local: number): string {
  return String(fragmentSeconds(local));
}

export interface TimeTarget {
  /** Recording the time falls in. */
  readonly recordingId: string;
  /** 1-based position of that recording, for "part 2" wording. */
  readonly part: number;
  /** Number of recordings of the shiur. */
  readonly parts: number;
  /** Seconds into that recording, fractional (what the no-JS link opens and the player seeks to). */
  readonly local: number;
  /** Global seconds (what the page shows and what `#t=` page URLs carry). */
  readonly global: number;
  /** `${playableUrl}#t=${local}`; null when the recording is not playable. */
  readonly href: string | null;
}

/**
 * Resolves a global time to its recording and the no-JS link (`playableUrl#t=local`, fractional).
 * Null for a shiur without recordings or a time that is not a finite number.
 */
export function timeTarget(recordings: readonly AudioRecording[], t: number): TimeTarget | null {
  if (!Number.isFinite(t) || recordings.length === 0) return null;
  const local = toLocal({ recordings }, t);
  if (!local) return null;
  const index = recordings.findIndex((r) => r.id === local.recordingId);
  const rec = recordings[index];
  if (!rec) return null;
  const url = playableUrl(rec);
  const seconds = fragmentSeconds(local.t);
  const fragment = formatFragment(seconds);
  return {
    recordingId: rec.id,
    part: index + 1,
    parts: recordings.length,
    local: seconds,
    global: Math.max(0, t),
    href: url === null ? null : `${url}#t=${fragment}`,
  };
}
