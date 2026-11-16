/**
 * Playing the week's occasion mix (concept-live-corpus C.3, corpus-wave-plan C3.4).
 *
 * The head comes inline from `today.json`, so pressing the button starts playing without a request.
 * The rest is assembled once the head is queued: the occasion topic's file (its moment list, the
 * first sections with times) and, only when that still cannot fill the mix, one moments page. A
 * failure there leaves the head playing. Nothing corpus-wide is requested.
 */
import { loadTopic, loadTopicMoments, type TopicFile, type TopicMomentsFile } from "../../data/index.ts";
import { getPersonal } from "../../store/index.ts";
import { mixInputs, playMix } from "../mix/actions.ts";
import { MIX_SIZE, type AudioFilter, type MixSource } from "../mix/model.ts";
import { occasionMix } from "../mix/occasion.ts";
import type { WeekMix } from "./model.ts";

export interface MixLoaders {
  topic: (id: string) => Promise<TopicFile>;
  page: (id: string, n: number) => Promise<TopicMomentsFile>;
}

const defaultLoaders: MixLoaders = { topic: (id) => loadTopic(id), page: (id, n) => loadTopicMoments(id, n) };

/** The whole mix: the head, then the topic's moment list (plus at most one moments page). */
export async function assembleMix(mix: WeekMix, audio: AudioFilter, loaders: MixLoaders = defaultLoaders): Promise<MixSource[]> {
  const base = { head: mix.head, catalog: mix.catalog, skip: mix.skip, audio, size: MIX_SIZE };
  const file = await loaders.topic(mix.topicId);
  const sources: MixSource[] = [...(Array.isArray(file.moments) ? file.moments : [])];
  let out = occasionMix({ ...base, topic: sources });
  if (out.items.length < MIX_SIZE && typeof file.momentPages === "number" && file.momentPages > 0) {
    const page = await loaders.page(mix.topicId, 1);
    out = occasionMix({ ...base, topic: [...sources, ...(Array.isArray(page.moments) ? page.moments : [])] });
  }
  return out.items;
}

/**
 * Plays the occasion mix: the head at once (no request), then the rest appended to the queue. With
 * no head in the listener's language, the mix is assembled first. Returns the number of items queued.
 */
export async function playOccasionMix(mix: WeekMix, audio: AudioFilter, loaders: MixLoaders = defaultLoaders): Promise<number> {
  if (mix.head.length === 0) return playMix(await assembleMix(mix, audio, loaders));
  const started = await playMix(mix.head);
  let rest: MixSource[];
  try {
    rest = (await assembleMix(mix, audio, loaders)).slice(mix.head.length);
  } catch {
    // The head keeps playing; the rest is a convenience.
    return started;
  }
  if (rest.length > 0) await getPersonal().enqueue(mixInputs(rest), "end");
  return started + rest.length;
}
