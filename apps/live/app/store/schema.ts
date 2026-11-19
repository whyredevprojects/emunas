/**
 * Personal data schema (tech-live §4.2): what the Live app keeps on the listener's device.
 *
 * Seven IndexedDB object stores. Every record carries `updatedAt` (ms since epoch) so that a later
 * sync (decision D4, last-writer-wins per key) and the JSON import's merge mode can compare records
 * without guessing. Optional values are `null`, never missing, so records survive a JSON round trip
 * unchanged.
 *
 * The schema version is the IndexedDB database version. Raising it means appending a migration to
 * `MIGRATIONS` (`idb-backend.ts`); version 1 creates the stores.
 */

export const PERSONAL_DB_NAME = "emunas-live-personal";
export const PERSONAL_SCHEMA_VERSION = 1;

export const STORE_NAMES = [
  "progress",
  "queue",
  "playlists",
  "saved",
  "notes",
  "history",
  "prefs",
] as const;

export type StoreName = (typeof STORE_NAMES)[number];

/** A moment reference: a shiur and a span of it in global seconds (integration-plan C5). */
export interface MomentRef {
  shiurId: string;
  /** Global seconds. */
  start: number;
  /** Global seconds; `null` = play on to the end of the shiur. */
  end: number | null;
  /** `<shiurId>~<kind><index>` when the item came from a moment (`@emunas/links` momentId). */
  momentId: string | null;
}

/** Listening position per shiur. */
export interface ProgressRecord {
  shiurId: string;
  /** Global seconds. */
  t: number;
  duration: number;
  /** Chapter indices (`notes.chapters[].idx` order) played through to their end, ascending. */
  completedChapters: number[];
  /** When the shiur was finished; `null` while unfinished. */
  completedAt: number | null;
  updatedAt: number;
}

/** One queue entry. Order is `pos` ascending (fractional positions allow inserting between). */
export interface QueueRecord extends MomentRef {
  key: string;
  pos: number;
  updatedAt: number;
}

export interface PlaylistRecord {
  id: string;
  name: string;
  items: MomentRef[];
  createdAt: number;
  updatedAt: number;
}

export interface SavedRecord {
  id: string;
  shiurId: string;
  t: number;
  end: number | null;
  momentId: string | null;
  updatedAt: number;
}

/** A private note at a time in a shiur. The listener's own words; never leaves the device. */
export interface NoteRecord {
  id: string;
  shiurId: string;
  t: number;
  text: string;
  createdAt: number;
  updatedAt: number;
}

/** One row per shiur listened to (most recent first in the UI). */
export interface HistoryRecord {
  shiurId: string;
  /** Global seconds where listening last stopped. */
  t: number;
  lastPlayedAt: number;
  updatedAt: number;
}

export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

export interface PrefRecord {
  key: string;
  value: JsonValue;
  updatedAt: number;
}

export interface StoreRecords {
  progress: ProgressRecord;
  queue: QueueRecord;
  playlists: PlaylistRecord;
  saved: SavedRecord;
  notes: NoteRecord;
  history: HistoryRecord;
  prefs: PrefRecord;
}

/** The key field of each store (IndexedDB `keyPath`). */
export const KEY_PATH = {
  progress: "shiurId",
  queue: "key",
  playlists: "id",
  saved: "id",
  notes: "id",
  history: "shiurId",
  prefs: "key",
} as const satisfies { [S in StoreName]: keyof StoreRecords[S] & string };

export function keyOf<S extends StoreName>(store: S, record: StoreRecords[S]): string {
  return (record as unknown as Record<string, string>)[KEY_PATH[store]]!;
}

/** Everything in all stores (the export file body and the in-memory backend's content). */
export type PersonalDump = { [S in StoreName]: StoreRecords[S][] };

export function emptyDump(): PersonalDump {
  return {
    progress: [],
    queue: [],
    playlists: [],
    saved: [],
    notes: [],
    history: [],
    prefs: [],
  };
}

/** Pref keys used by this package. */
export const PREF_QUEUE_CURRENT = "queue.current";

/** Caps that keep a hostile or runaway import from filling the device. */
export const LIMITS = {
  queue: 1000,
  playlists: 500,
  playlistItems: 1000,
  saved: 5000,
  notes: 5000,
  noteLength: 5000,
  history: 1000,
  nameLength: 200,
  prefs: 200,
} as const;
