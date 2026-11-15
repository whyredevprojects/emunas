/**
 * The slice of the personal store (tech-live §4.2, built in W3.9) that Today and the series pages
 * read: listening progress per shiur. Until W3.9 registers the real IndexedDB-backed source, a stub
 * that knows nothing is used, so "Continue" stays empty and series progress shows nothing heard.
 *
 * ```ts
 * // W3.9, once, at app start:
 * registerProgressSource({ progress: () => store.progress.all() });
 * ```
 *
 * Every call is wrapped by the callers: a failing store (private window, storage blocked) behaves
 * like an empty one.
 */
import { useSyncExternalStore } from "react";

export interface ProgressRecord {
  shiurId: string;
  /** Last position, global seconds. */
  t: number;
  /** The listener finished the shiur (or marked it done). */
  completed: boolean;
  /** ISO 8601; most recent first in "Continue". */
  updatedAt: string;
}

export interface ProgressSource {
  progress(): Promise<readonly ProgressRecord[]>;
}

/** The stub until W3.9: nothing has been heard. */
export const EMPTY_PROGRESS_SOURCE: ProgressSource = { progress: () => Promise.resolve([]) };

let current: ProgressSource = EMPTY_PROGRESS_SOURCE;
let version = 0;
const listeners = new Set<() => void>();

/** Sets the progress source. Returns a function that restores the previous one. */
export function registerProgressSource(source: ProgressSource): () => void {
  const previous = current;
  current = source;
  version++;
  for (const l of listeners) l();
  return () => {
    if (current === source) {
      current = previous;
      version++;
      for (const l of listeners) l();
    }
  };
}

export function progressSource(): ProgressSource {
  return current;
}

/** Reads all progress; an unavailable store reads as empty. */
export async function readProgress(): Promise<readonly ProgressRecord[]> {
  try {
    return await current.progress();
  } catch {
    return [];
  }
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Changes whenever a different source is registered (so pages can reload progress). */
export function useProgressSourceVersion(): number {
  return useSyncExternalStore(
    subscribe,
    () => version,
    () => 0,
  );
}
