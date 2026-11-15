/**
 * Maasios (concept-live §5.5, tech-live W14b): the stories as their own library, as pure functions over
 * `stories.json`. Faceted by person (`?p=<key>`), filtered by the audio-language setting, and played
 * back to back in "stories only" mode (each story is a moment from `t` to `end`).
 */
import type { Ed } from "@emunas/corpus/public";
import type { StoryRow } from "../entities/live-data.ts";

export interface PersonCount {
  key: string;
  count: number;
}

/** People in the stories with their story counts, most stories first (then by key). */
export function storyPeople(stories: readonly StoryRow[]): PersonCount[] {
  const n = new Map<string, number>();
  for (const s of stories) for (const k of new Set(s.peopleKeys)) n.set(k, (n.get(k) ?? 0) + 1);
  return [...n]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

export interface StoryFilter {
  /** Person key, or null for everyone. */
  person: string | null;
  /** Audio-language filter from the settings. */
  audio: "both" | Ed;
}

export function filterStories(stories: readonly StoryRow[], f: StoryFilter): StoryRow[] {
  return stories.filter(
    (s) => (f.person === null || s.peopleKeys.includes(f.person)) && (f.audio === "both" || s.lang === f.audio),
  );
}

/** `?p=` from a query string; anything else is ignored. */
export function personFromQuery(search: string): string | null {
  const p = new URLSearchParams(search).get("p");
  return p === null || p === "" ? null : p;
}

/** The current query with `p` set (or removed). */
export function personSearch(search: string, person: string | null): string {
  const q = new URLSearchParams(search);
  if (person === null) q.delete("p");
  else q.set("p", person);
  const out = q.toString();
  return out === "" ? "" : `?${out}`;
}

/** Stories that can be played (they have a time). */
export function playableStories(stories: readonly StoryRow[]): StoryRow[] {
  return stories.filter((s) => s.t !== null);
}
