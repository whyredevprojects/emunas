/**
 * The listener's choice between the AI-improved copy and the original recording
 * (docs/sites/cleaned-audio-ux.md, Decision 5 and §6).
 *
 * - One global choice per listener, in `localStorage` (`AUDIO_VERSION_KEY`), read synchronously when
 *   the engine is created so the very first `load()` uses the right file. Every access is guarded: a
 *   blocked or missing store means the default ("cleaned").
 * - Only an explicit click writes it (`chooseAudioVersion`). The personal store mirrors it into its
 *   `prefs` (`PREF_AUDIO_VERSION`, wired in `store/connect.ts`) so export/transfer carries it.
 * - `useVersionAnnouncement()` feeds the dock's polite status region after a switch.
 */
import { AUDIO_VERSION_KEY, parseAudioVersion, type AudioVersion } from "@emunas/i18n";
import { useSyncExternalStore } from "react";

/** Key of the mirrored value in the personal store's `prefs`. */
export const PREF_AUDIO_VERSION = "audioVersion";

export function readStoredAudioVersion(): AudioVersion {
  try {
    return parseAudioVersion(globalThis.localStorage?.getItem(AUDIO_VERSION_KEY));
  } catch {
    return parseAudioVersion(null);
  }
}

/** True when `localStorage` holds an explicit choice (a missing value is the default). */
export function hasStoredAudioVersion(): boolean {
  try {
    return globalThis.localStorage?.getItem(AUDIO_VERSION_KEY) != null;
  } catch {
    return false;
  }
}

export function writeStoredAudioVersion(version: AudioVersion): void {
  try {
    globalThis.localStorage?.setItem(AUDIO_VERSION_KEY, version);
  } catch {
    /* blocked storage: the choice lasts for this page only */
  }
}

/** Whether the improved copy may be tried without the listener asking: not while offline. */
export function onlineForCleaned(): boolean {
  const nav = (globalThis as { navigator?: { onLine?: boolean } }).navigator;
  return nav?.onLine !== false;
}

// ---- choice listeners (the personal-store mirror) ----------------------------------------------

const chosenListeners = new Set<(v: AudioVersion) => void>();

/** Called after every explicit choice (the personal store mirrors it into `prefs`). */
export function onAudioVersionChosen(fn: (v: AudioVersion) => void): () => void {
  chosenListeners.add(fn);
  return () => chosenListeners.delete(fn);
}

// ---- announcements -----------------------------------------------------------------------------

/** The version just switched to, with a counter so the same sentence twice is announced again. */
export interface VersionAnnouncement {
  n: number;
  version: AudioVersion | "fallback";
}

let announcement: VersionAnnouncement | null = null;
const announceListeners = new Set<() => void>();

export function announceVersion(version: VersionAnnouncement["version"]): void {
  announcement = { n: (announcement?.n ?? 0) + 1, version };
  for (const l of [...announceListeners]) l();
}

export function useVersionAnnouncement(): VersionAnnouncement | null {
  return useSyncExternalStore(
    (l) => {
      announceListeners.add(l);
      return () => announceListeners.delete(l);
    },
    () => announcement,
    () => null,
  );
}

/**
 * Applies a version: stores it, switches the engine (keeping position, play state and speed) and
 * announces it. `apply` is the engine's `setAudioVersion` (injected to keep this module free of the
 * engine accessor). `mirror: false` for a value that came from the personal store itself.
 */
export function applyAudioVersion(
  version: AudioVersion,
  apply: (v: AudioVersion) => void,
  opts: { announce?: boolean; mirror?: boolean } = {},
): void {
  writeStoredAudioVersion(version);
  apply(version);
  if (opts.announce !== false) announceVersion(version);
  if (opts.mirror !== false) for (const fn of [...chosenListeners]) fn(version);
}
