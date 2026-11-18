/**
 * Playing a thread through the personal queue and the app's queue player (concept-live §6.2: each
 * entry plays from its start to its end, then the next one, across shiurim). An insight's end is in
 * its shiur file (the thread file carries starts only); the player loads that file anyway. Everything
 * here runs on a user action, so the player is never created during render.
 */
import { loadShiur } from "../../data/index.ts";
import { getPersonal, getQueuePlayer, type MomentInput } from "../../store/index.ts";
import type { ThreadQueueItem } from "./model.ts";

/** The end of an insight moment, from its shiur file (null: play on to the end of the shiur). */
export async function insightEnd(shiurId: string, momentId: string): Promise<number | null> {
  try {
    const file = await loadShiur(shiurId);
    const end = file.notes?.insights.find((x) => x.id === momentId)?.end;
    return typeof end === "number" && Number.isFinite(end) ? end : null;
  } catch {
    return null;
  }
}

async function inputs(items: readonly ThreadQueueItem[]): Promise<MomentInput[]> {
  const ends = await Promise.all(items.map((x) => insightEnd(x.shiurId, x.momentId)));
  return items.map((x, i) => ({ shiurId: x.shiurId, start: x.start, end: ends[i] ?? null, momentId: x.momentId }));
}

/** Plays one member's insight now: it goes into the queue right after the current entry and starts. */
export async function playInsight(item: ThreadQueueItem): Promise<void> {
  const [key] = await getPersonal().enqueue(await inputs([item]), "next");
  if (key !== undefined) await getQueuePlayer().play(key);
}

/** "Play the thread": replaces the queue with these members, in this order, and plays the first. */
export async function playThread(items: readonly ThreadQueueItem[]): Promise<number> {
  if (items.length === 0) return 0;
  const keys = await getPersonal().replaceQueue(await inputs(items));
  const first = keys[0];
  if (first !== undefined) await getQueuePlayer().play(first);
  return keys.length;
}
