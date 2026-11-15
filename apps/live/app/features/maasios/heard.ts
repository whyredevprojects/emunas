/**
 * Stories heard in this visit (concept-live-corpus C.4: stories-only mode skips them). A story counts
 * as heard once one of its tellings starts playing from the Maasios pages: the card's play button,
 * a story page's telling, or the stories-only queue reaching it.
 *
 * "This visit" is the browser tab's session: the set lives in memory and in `sessionStorage`, so a
 * reload keeps it and a new tab starts empty. Storage is a convenience only: every access is guarded
 * and the set works in memory when storage is blocked.
 */
import { createStore, useStore, type StoreApi } from "zustand";

const KEY = "emunas.maasios.heard";

function readStored(): string[] {
  try {
    if (typeof sessionStorage === "undefined") return [];
    const raw = sessionStorage.getItem(KEY);
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeStored(ids: ReadonlySet<string>): void {
  try {
    if (typeof sessionStorage !== "undefined") sessionStorage.setItem(KEY, JSON.stringify([...ids]));
  } catch {
    // Storage blocked or full: the in-memory set still works for this page.
  }
}

export interface HeardState {
  heard: ReadonlySet<string>;
}

export const heardStore: StoreApi<HeardState> = createStore<HeardState>()(() => ({ heard: new Set(readStored()) }));

export function markHeard(storyId: string): void {
  const cur = heardStore.getState().heard;
  if (cur.has(storyId)) return;
  const next = new Set(cur);
  next.add(storyId);
  heardStore.setState({ heard: next });
  writeStored(next);
}

/** Forgets every heard story (the listener asks to include them again). */
export function clearHeard(): void {
  heardStore.setState({ heard: new Set() });
  writeStored(new Set());
}

export function useHeard(): ReadonlySet<string> {
  return useStore(heardStore, (s) => s.heard);
}
