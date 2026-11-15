/**
 * Maasios on merged stories (concept-live-corpus C.4, corpus-wave-plan C2.7), as pure functions over
 * `stories-index.json` (no retellings) and `story/<id>.json`.
 *
 * - Facets: by merged person (`?p=`), by topic through the layer's section join (`?topic=`; a topic
 *   matches its own stories and those of its sub-topics), and "told more than once" (`?many=1`).
 *   Raw names on a story are never a facet.
 * - The audio-language filter keeps a story when it has a telling in that language. Language belongs
 *   to each telling, never to the story (F.1): nothing pairs a Yiddish telling with an English one.
 * - The play button plays one telling: the listener's language filter first, then catalogued over
 *   uncatalogued, then the layer's order (the emitter ranks `plays` that way; the data carries no
 *   per-telling confidence).
 * - Stories-only mode plays one telling per story, skips stories heard in this visit, and never puts
 *   two tellings of one story next to each other.
 */
import type { Ed } from "@emunas/corpus/public";
import type { CorpusMember, StoryIndexRow, StoryPlay, TopicNode } from "../../data/index.ts";
import type { AudioFilter } from "../../shell/settings.ts";

// ------------------------------------------------------------------------------------- facets

export interface StoryFacets {
  /** Corpus person id, or null for everyone. */
  person: string | null;
  /** Topic id, or null for every topic. */
  topic: string | null;
  /** Only stories told more than once. */
  many: boolean;
}

export const NO_FACETS: StoryFacets = { person: null, topic: null, many: false };

const param = (q: URLSearchParams, k: string): string | null => {
  const v = q.get(k);
  return v === null || v === "" ? null : v;
};

/** The facets in a query string; anything else is ignored. */
export function facetsFromQuery(search: string): StoryFacets {
  const q = new URLSearchParams(search);
  return { person: param(q, "p"), topic: param(q, "topic"), many: q.get("many") === "1" };
}

/** The current query with one facet changed (other parameters, e.g. `audio`, are kept). */
export function facetSearch(search: string, change: Partial<StoryFacets>): string {
  const q = new URLSearchParams(search);
  const set = (k: string, v: string | null) => (v === null ? q.delete(k) : q.set(k, v));
  if ("person" in change) set("p", change.person ?? null);
  if ("topic" in change) set("topic", change.topic ?? null);
  if ("many" in change) set("many", change.many ? "1" : null);
  const out = q.toString();
  return out === "" ? "" : `?${out}`;
}

/** Topic id → its ancestors (itself first), from the tree. */
export function topicChains(nodes: readonly Pick<TopicNode, "id" | "parentId">[]): Map<string, string[]> {
  const parent = new Map(nodes.map((n) => [n.id, n.parentId]));
  const out = new Map<string, string[]>();
  for (const n of nodes) {
    const chain: string[] = [];
    for (let cur: string | null | undefined = n.id; cur && !chain.includes(cur); cur = parent.get(cur)) chain.push(cur);
    out.set(n.id, chain);
  }
  return out;
}

/** Every topic a story falls under: its tagged topics and their ancestors. */
export function storyTopics(row: Pick<StoryIndexRow, "topics">, chains: ReadonlyMap<string, readonly string[]>): Set<string> {
  const out = new Set<string>();
  for (const id of row.topics) for (const a of chains.get(id) ?? [id]) out.add(a);
  return out;
}

/** Whether a story has a telling the audio filter lets through. */
export function inAudio(row: Pick<StoryIndexRow, "langs">, audio: AudioFilter): boolean {
  return audio === "both" || row.langs.includes(audio);
}

export function filterStories(
  rows: readonly StoryIndexRow[],
  f: StoryFacets & { audio: AudioFilter },
  chains: ReadonlyMap<string, readonly string[]> = new Map(),
): StoryIndexRow[] {
  return rows.filter(
    (r) =>
      inAudio(r, f.audio) &&
      (f.person === null || r.people.includes(f.person)) &&
      (!f.many || r.tellings > 1) &&
      (f.topic === null || storyTopics(r, chains).has(f.topic)),
  );
}

export interface FacetCount {
  id: string;
  count: number;
}

const byCount = (a: FacetCount, b: FacetCount): number => b.count - a.count || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** People on the stories with their story counts, most stories first. Raw names are not counted. */
export function personCounts(rows: readonly Pick<StoryIndexRow, "people">[]): FacetCount[] {
  const n = new Map<string, number>();
  for (const r of rows) for (const id of new Set(r.people)) n.set(id, (n.get(id) ?? 0) + 1);
  return [...n].map(([id, count]) => ({ id, count })).sort(byCount);
}

export interface TopicOption {
  id: string;
  level: number;
  count: number;
}

/** Topics with at least one story, in tree order, each counted with its sub-topics. */
export function topicOptions(
  rows: readonly Pick<StoryIndexRow, "topics">[],
  nodes: readonly Pick<TopicNode, "id" | "parentId" | "level">[],
): TopicOption[] {
  const chains = topicChains(nodes);
  const n = new Map<string, number>();
  for (const r of rows) for (const id of storyTopics(r, chains)) n.set(id, (n.get(id) ?? 0) + 1);
  return nodes.flatMap((x) => {
    const count = n.get(x.id) ?? 0;
    return count > 0 ? [{ id: x.id, level: x.level, count }] : [];
  });
}

// ------------------------------------------------------------------------------------- playing

/** The telling a card plays: the filter's language, else the overall best; null when none is timed. */
export function choosePlay(row: Pick<StoryIndexRow, "plays">, audio: AudioFilter): StoryPlay | null {
  const pick = audio === "both" ? row.plays[0] : row.plays.find((p) => p.lang === audio);
  return pick && pick.t !== null ? pick : null;
}

/** The telling a story page plays first: the filter's language, then the page's order. */
export function chooseTelling<T extends Pick<CorpusMember, "lang" | "t">>(tellings: readonly T[], audio: AudioFilter): T | null {
  const timed = tellings.filter((t) => t.t !== null);
  return (audio === "both" ? timed[0] : timed.find((t) => t.lang === audio)) ?? null;
}

/** A queue entry that remembers its story. */
export interface StoryQueueItem {
  storyId: string;
  shiurId: string;
  momentId: string;
  start: number;
  end: number | null;
  lang: Ed;
}

/**
 * Reorders entries so that no two tellings of one story are next to each other, keeping the order
 * otherwise. When that cannot be done (one story fills more than half the list), the leftovers of
 * that story go at the end, still apart where possible.
 */
export function apartByStory<T extends { storyId: string }>(items: readonly T[]): T[] {
  const pending = [...items];
  const out: T[] = [];
  while (pending.length > 0) {
    const prev = out[out.length - 1]?.storyId;
    const i = pending.findIndex((x) => x.storyId !== prev);
    out.push(pending.splice(i === -1 ? 0 : i, 1)[0]!);
  }
  return out;
}

/**
 * The stories-only queue (concept-live C.4): one telling per story (chosen as on the card), stories
 * heard in this visit left out, and never two tellings of one story back to back.
 */
export function storiesOnlyQueue(
  rows: readonly Pick<StoryIndexRow, "id" | "plays">[],
  audio: AudioFilter,
  heard: ReadonlySet<string>,
): StoryQueueItem[] {
  const seen = new Set<string>();
  const items: StoryQueueItem[] = [];
  for (const r of rows) {
    if (heard.has(r.id) || seen.has(r.id)) continue;
    const p = choosePlay(r, audio);
    if (!p || p.t === null) continue;
    seen.add(r.id);
    items.push({ storyId: r.id, shiurId: p.shiurId, momentId: p.momentId, start: p.t, end: p.end, lang: p.lang });
  }
  return apartByStory(items);
}

/** How many of these stories were heard in this visit (and are skipped by stories-only). */
export function heardCount(rows: readonly Pick<StoryIndexRow, "id">[], heard: ReadonlySet<string>): number {
  return rows.reduce((n, r) => n + (heard.has(r.id) ? 1 : 0), 0);
}
