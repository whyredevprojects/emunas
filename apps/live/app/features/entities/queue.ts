/**
 * Queue actions for the browse pages: "play these back to back" (the stories-only mode of the
 * maasios library, an entity's moments) and "add to queue". Both go through the personal store's
 * queue (W3.9) and the app's queue player, which plays each entry from its start to its end and then
 * the next one, across shiurim.
 */
import { getPersonal, getQueuePlayer, type MomentInput } from "../../store/index.ts";

/** Replaces the queue with `items` and starts playing the first. Returns the number queued. */
export async function playBackToBack(items: readonly MomentInput[]): Promise<number> {
  if (items.length === 0) return 0;
  const keys = await getPersonal().replaceQueue(items);
  const first = keys[0];
  if (first !== undefined) await getQueuePlayer().play(first);
  return keys.length;
}

/** Appends `items` to the queue. Returns the number queued. */
export async function addToQueue(items: readonly MomentInput[]): Promise<number> {
  if (items.length === 0) return 0;
  const keys = await getPersonal().enqueue(items, "end");
  return keys.length;
}
