/**
 * Connects the player engine's progress events (every 5 s, on pause, on pagehide, at the end; tech-live
 * §4.1) to the personal store: position per shiur, chapters played through, finished shiurim and the
 * listening history (concept-live §6.4).
 *
 * A chapter counts as played through when playback moves on from it to the next one in order; seeking
 * around does not complete chapters. At the end of a shiur its last chapter completes too.
 */
import type { PlayerEngine } from "../player-engine/index.ts";
import type { Personal } from "./personal.ts";

const attached = new WeakMap<object, () => void>();

/**
 * Starts recording; returns the detach function. Idempotent per engine: a second call for the same
 * engine returns the first call's detach function, so the player UI and the queue can both call it.
 */
export function attachProgressRecorder(
  engine: Pick<PlayerEngine, "on" | "getState">,
  personal: Pick<Personal, "recordProgress" | "store">,
): () => void {
  const existing = attached.get(engine);
  if (existing) return existing;
  const lastChapter = new Map<string, number>();
  const off = engine.on("progress", (ev) => {
    const prev = lastChapter.get(ev.shiurId);
    lastChapter.set(ev.shiurId, ev.chapterIndex);
    const ended = ev.reason === "ended";
    // Nothing was heard from a shiur without playable audio (its reported position is meaningless).
    const st = engine.getState();
    if (st.shiurId === ev.shiurId && st.status === "unavailable") return;
    // Opening a shiur and leaving it at once is not listening.
    if (!ended && ev.t < 1 && personal.store.getState().progress[ev.shiurId] === undefined) return;
    const completed: number[] = [];
    if (prev !== undefined && prev >= 0 && ev.chapterIndex === prev + 1) completed.push(prev);
    if (ended && ev.chapterIndex >= 0) completed.push(ev.chapterIndex);
    void personal.recordProgress({
      shiurId: ev.shiurId,
      t: ev.t,
      duration: ev.duration,
      ...(completed.length > 0 ? { completedChapters: completed } : {}),
      ...(ended ? { completed: true } : {}),
    });
  });
  const detach = (): void => {
    off();
    attached.delete(engine);
  };
  attached.set(engine, detach);
  return detach;
}
