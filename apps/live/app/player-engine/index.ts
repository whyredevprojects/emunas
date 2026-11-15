/**
 * Live player engine: framework-free, one audio element for the whole app (tech-live §4.1, W2.5).
 *
 * React reads it with `useSyncExternalStore(engine.subscribe, engine.getState)`; nothing in this
 * folder imports React.
 */
import { createPlayerEngine } from "./engine.ts";
import type { PlayerEngine, PlayerEngineOptions } from "./types.ts";

export { createPlayerEngine } from "./engine.ts";
export {
  DEFAULT_SKIP,
  MAX_RATE,
  MIN_RATE,
  PREV_RESTART_SECONDS,
  chapterIndexAt,
  clampRate,
  locate,
  nextChapterTarget,
  planSkips,
  prevChapterTarget,
  recordingAudioUrl,
  type PlannedSkip,
} from "./plan.ts";
export { RAV_NAME, defaultDescribe } from "./media-session.ts";
export type * from "./types.ts";

let shared: PlayerEngine | null = null;

/**
 * The app-wide engine, created on first use in the browser (it creates the one `Audio` element).
 * Options apply only to the first call.
 */
export function getPlayerEngine(options?: PlayerEngineOptions): PlayerEngine {
  shared ??= createPlayerEngine(options);
  return shared;
}

/** Tear down the shared engine (tests, hot reload). */
export function resetPlayerEngine(): void {
  shared?.destroy();
  shared = null;
}
