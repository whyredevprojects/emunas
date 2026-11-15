/**
 * Wires the personal store into the rest of the app, once per page load (integration of W3.7,
 * W3.8 and W3.9):
 * - every playback through the shared player engine records progress and history, not only queue
 *   playback;
 * - Today's "Continue" row and the series pages read progress from this store instead of the stub.
 *
 * Browser only: on the server (prerender) it does nothing.
 */
import { registerProgressSource, type ProgressRecord as TodayProgress } from "../features/today/personal.ts";
import { getEngine } from "../player-ui/engine.ts";
import { getPersonal, type Personal } from "./personal.ts";
import { attachProgressRecorder } from "./progress-recorder.ts";
import type { ProgressRecord } from "./schema.ts";

let connected = false;

export function toTodayProgress(r: ProgressRecord): TodayProgress {
  return {
    shiurId: r.shiurId,
    t: r.t,
    completed: r.completedAt !== null,
    updatedAt: new Date(r.updatedAt).toISOString(),
  };
}

/** Today/series progress source backed by the personal store. */
export function personalProgressSource(personal: Pick<Personal, "ready" | "store">): {
  progress(): Promise<readonly TodayProgress[]>;
} {
  return {
    async progress() {
      await personal.ready();
      return Object.values(personal.store.getState().progress).map(toTodayProgress);
    },
  };
}

export function connectPersonal(): void {
  if (connected || typeof window === "undefined") return;
  connected = true;
  const personal = getPersonal();
  registerProgressSource(personalProgressSource(personal));
  attachProgressRecorder(getEngine(), personal);
}
