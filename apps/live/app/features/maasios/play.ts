/**
 * Playing tellings from the Maasios pages through the personal queue and the app's queue player
 * (concept-live §6.2: each entry plays from its start to its end, then the next one, across shiurim).
 * Everything here runs on a user action, so the player is never created during render.
 */
import { loadShiur } from "../../data/index.ts";
import { getPersonal, getQueuePlayer } from "../../store/index.ts";
import { markHeard } from "./heard.ts";
import type { StoryQueueItem } from "./model.ts";

export interface TellingToPlay {
  storyId: string;
  shiurId: string;
  momentId: string;
  start: number;
  /** The telling's end; when not given it is read from the shiur file (the player loads it anyway). */
  end?: number | null;
}

/** The end of a story moment, from its shiur file (null: play on to the end of the shiur). */
async function storyEnd(shiurId: string, momentId: string): Promise<number | null> {
  const file = await loadShiur(shiurId);
  return file.notes?.stories.find((x) => x.id === momentId)?.end ?? null;
}

/** Plays one telling now: it goes into the queue right after the current entry and starts. */
export async function playTelling(x: TellingToPlay): Promise<void> {
  const end = x.end !== undefined ? x.end : await storyEnd(x.shiurId, x.momentId);
  const [key] = await getPersonal().enqueue([{ shiurId: x.shiurId, start: x.start, end, momentId: x.momentId }], "next");
  markHeard(x.storyId);
  if (key !== undefined) await getQueuePlayer().play(key);
}

let unwatch: (() => void) | null = null;

/**
 * Stories-only mode: replaces the queue with these tellings and plays from the first. Each story is
 * marked heard as its telling becomes the playing entry. Returns the number queued.
 */
export async function playStoriesOnly(items: readonly StoryQueueItem[]): Promise<number> {
  if (items.length === 0) return 0;
  const personal = getPersonal();
  const keys = await personal.replaceQueue(items.map((x) => ({ shiurId: x.shiurId, start: x.start, end: x.end, momentId: x.momentId })));
  const storyOf = new Map(items.map((x) => [x.momentId, x.storyId]));
  const player = getQueuePlayer();
  unwatch?.();
  const seen = (key: string | null) => {
    if (key === null) return;
    const momentId = personal.store.getState().queue.find((q) => q.key === key)?.momentId;
    const storyId = momentId ? storyOf.get(momentId) : undefined;
    if (storyId) markHeard(storyId);
  };
  unwatch = player.store.subscribe((s, prev) => {
    if (s.activeKey !== prev.activeKey) seen(s.activeKey);
  });
  const first = keys[0];
  if (first !== undefined) await player.play(first);
  return keys.length;
}
