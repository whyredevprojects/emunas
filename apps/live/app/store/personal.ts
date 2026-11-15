/**
 * The personal store: listening progress, queue, playlists, saved moments, notes, history, prefs and
 * download bookkeeping (tech-live §4.2, concept-live §5.8, §6.2, §6.4).
 *
 * A Zustand store holds the whole personal state in memory (it is small); React reads it with
 * `usePersonal(selector)` and code outside React (the player, the queue player) with `getState()`.
 * Every action updates memory first and then writes through to the backend. Storage problems never
 * break the app:
 * - IndexedDB cannot be opened → the memory backend is used from the start;
 * - a write fails later (quota, the browser dropping the database) → the store switches to memory
 *   with the current state, keeps working, and `persistent` becomes false so the UI can say so.
 *
 * Actions wait for the initial load, so nothing written early is overwritten by hydration. Other tabs
 * are told about changes over a BroadcastChannel and reload from the database.
 */
import { createStore, useStore, type StoreApi } from "zustand";
import { MemoryBackend, type Backend } from "./backend.ts";
import { openBestBackend, type OpenedBackend } from "./idb-backend.ts";
import {
  LIMITS,
  PREF_QUEUE_CURRENT,
  STORE_NAMES,
  emptyDump,
  type DownloadRecord,
  type HistoryRecord,
  type JsonValue,
  type MomentRef,
  type NoteRecord,
  type PersonalDump,
  type PlaylistRecord,
  type PrefRecord,
  type ProgressRecord,
  type QueueRecord,
  type SavedRecord,
  type StoreName,
  type StoreRecords,
} from "./schema.ts";
import { buildExport, mergeDumps, parseImport, type ExportFile, type ImportMode, type ParsedImport } from "./transfer.ts";
import { momentRef } from "./validate.ts";

export interface PersonalData {
  progress: Readonly<Record<string, ProgressRecord>>;
  /** Ordered by `pos`. */
  queue: readonly QueueRecord[];
  /** Most recently changed first. */
  playlists: readonly PlaylistRecord[];
  /** Most recently saved first. */
  saved: readonly SavedRecord[];
  /** By shiur, then time. */
  notes: readonly NoteRecord[];
  /** Most recently played first. */
  history: readonly HistoryRecord[];
  prefs: Readonly<Record<string, PrefRecord>>;
  downloads: Readonly<Record<string, DownloadRecord>>;
}

export type PersonalStatus = "idle" | "loading" | "ready";

export interface PersonalState extends PersonalData {
  status: PersonalStatus;
  /** False while data lives only in this tab's memory. */
  persistent: boolean;
  /** Why storage is not persistent (for diagnostics, not shown verbatim). */
  fallbackReason: string | null;
}

/** A moment as callers describe it; `end`/`momentId` may be omitted. */
export interface MomentInput {
  shiurId: string;
  start: number;
  end?: number | null;
  momentId?: string | null;
}

export interface ProgressInput {
  shiurId: string;
  t: number;
  duration: number;
  /** Chapter indices played through to their end. */
  completedChapters?: readonly number[];
  /** The shiur was played to its end. */
  completed?: boolean;
}

export interface BroadcastLike {
  postMessage(msg: unknown): void;
  addEventListener(type: "message", fn: (ev: MessageEvent) => void): void;
  close(): void;
}

export interface PersonalDeps {
  open?: () => Promise<OpenedBackend>;
  now?: () => number;
  newId?: () => string;
  /** Cross-tab notifications; default a BroadcastChannel when available, `null` disables. */
  channel?: BroadcastLike | null;
}

/** A shiur counts as finished this close to its end (seconds). */
export const FINISHED_WITHIN = 15;
/** Progress under this many seconds is not shown under "continue". */
export const CONTINUE_MIN_SECONDS = 30;

function defaultId(): string {
  try {
    return globalThis.crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

function defaultChannel(): BroadcastLike | null {
  try {
    return typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("emunas-personal");
  } catch {
    return null;
  }
}

const byPos = (a: QueueRecord, b: QueueRecord) => a.pos - b.pos;
const byUpdatedDesc = (a: { updatedAt: number }, b: { updatedAt: number }) => b.updatedAt - a.updatedAt;
const byNote = (a: NoteRecord, b: NoteRecord) => (a.shiurId === b.shiurId ? a.t - b.t : a.shiurId < b.shiurId ? -1 : 1);
const byPlayedDesc = (a: HistoryRecord, b: HistoryRecord) => b.lastPlayedAt - a.lastPlayedAt;

function index<T>(records: readonly T[], key: (r: T) => string): Record<string, T> {
  const out: Record<string, T> = {};
  for (const r of records) out[key(r)] = r;
  return out;
}

export function dataFromDump(d: PersonalDump): PersonalData {
  return {
    progress: index(d.progress, (r) => r.shiurId),
    queue: [...d.queue].sort(byPos),
    playlists: [...d.playlists].sort(byUpdatedDesc),
    saved: [...d.saved].sort(byUpdatedDesc),
    notes: [...d.notes].sort(byNote),
    history: [...d.history].sort(byPlayedDesc),
    prefs: index(d.prefs, (r) => r.key),
    downloads: index(d.downloads, (r) => r.shiurId),
  };
}

export function dumpFromData(s: PersonalData): PersonalDump {
  return {
    progress: Object.values(s.progress),
    queue: [...s.queue],
    playlists: [...s.playlists],
    saved: [...s.saved],
    notes: [...s.notes],
    history: [...s.history],
    prefs: Object.values(s.prefs),
    downloads: Object.values(s.downloads),
  };
}

function toRef(m: MomentInput): MomentRef | null {
  return momentRef({ shiurId: m.shiurId, start: m.start, end: m.end ?? null, momentId: m.momentId ?? null });
}

export type PersonalStoreApi = StoreApi<PersonalState>;

export interface Personal {
  readonly store: PersonalStoreApi;
  /** Resolves once the stored data is loaded (or the memory fallback is in place). */
  ready(): Promise<void>;

  recordProgress(p: ProgressInput): Promise<void>;
  clearProgress(shiurId: string): Promise<void>;
  removeHistory(shiurId: string): Promise<void>;
  clearHistory(): Promise<void>;

  /** Adds moments at the end of the queue, or right after the current item (`next`). Returns keys. */
  enqueue(items: readonly MomentInput[], where?: "end" | "next"): Promise<string[]>;
  /** Replaces the queue (play all) and makes the first item current. Returns keys. */
  replaceQueue(items: readonly MomentInput[]): Promise<string[]>;
  removeFromQueue(key: string): Promise<void>;
  moveInQueue(key: string, delta: -1 | 1): Promise<void>;
  clearQueue(): Promise<void>;
  setQueueCurrent(key: string | null): Promise<void>;

  createPlaylist(name: string, items: readonly MomentInput[]): Promise<string>;
  renamePlaylist(id: string, name: string): Promise<void>;
  deletePlaylist(id: string): Promise<void>;
  addToPlaylist(id: string, items: readonly MomentInput[]): Promise<void>;
  removeFromPlaylist(id: string, index: number): Promise<void>;

  /** Saves a moment (no duplicate for the same shiur and moment/time). Returns the saved id. */
  saveMoment(m: MomentInput): Promise<string | null>;
  unsave(id: string): Promise<void>;

  addNote(shiurId: string, t: number, text: string): Promise<string | null>;
  editNote(id: string, text: string): Promise<void>;
  deleteNote(id: string): Promise<void>;

  setPref(key: string, value: JsonValue): Promise<void>;

  putDownload(d: Omit<DownloadRecord, "updatedAt">): Promise<void>;
  removeDownload(shiurId: string): Promise<void>;

  exportFile(): Promise<ExportFile>;
  importText(text: string, mode: ImportMode): Promise<ParsedImport>;
  clearAll(): Promise<void>;
  /** Close the database and channel (tests). */
  dispose(): void;
}

export function createPersonal(deps: PersonalDeps = {}): Personal {
  const now = deps.now ?? (() => Date.now());
  const newId = deps.newId ?? defaultId;
  const open = deps.open ?? (() => openBestBackend());
  /** Opened in `ready()`, so merely importing the store (e.g. during prerender) opens nothing. */
  let channel: BroadcastLike | null = null;

  const store = createStore<PersonalState>()(() => ({
    ...dataFromDump(emptyDump()),
    status: "idle",
    persistent: false,
    fallbackReason: null,
  }));

  let backend: Backend | null = null;
  let loading: Promise<void> | null = null;
  /** Writes are serialized so they reach the database in the order they were made. */
  let chain: Promise<void> = Promise.resolve();

  function ready(): Promise<void> {
    loading ??= (async () => {
      store.setState({ status: "loading" });
      channel = deps.channel === undefined ? defaultChannel() : deps.channel;
      try {
        channel?.addEventListener("message", () => void reloadFromBackend());
      } catch {
        /* no cross-tab updates */
      }
      const opened = await open();
      backend = opened.backend;
      let dump = emptyDump();
      try {
        dump = await backend.dump();
      } catch (e) {
        fallBack(e);
      }
      store.setState({
        ...dataFromDump(dump),
        status: "ready",
        persistent: backend.kind === "indexeddb",
        fallbackReason: opened.fallbackReason ?? store.getState().fallbackReason,
      });
    })();
    return loading;
  }

  function fallBack(e: unknown): void {
    const reason = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    try {
      backend?.close();
    } catch {
      /* already gone */
    }
    backend = new MemoryBackend(dumpFromData(store.getState()));
    store.setState({ persistent: false, fallbackReason: reason });
  }

  function write(fn: (b: Backend) => Promise<void>): Promise<void> {
    chain = chain.then(async () => {
      if (!backend) return;
      try {
        await fn(backend);
        if (backend.kind === "indexeddb") channel?.postMessage({ type: "changed" });
      } catch (e) {
        fallBack(e);
      }
    });
    return chain;
  }

  async function reloadFromBackend(): Promise<void> {
    await ready();
    await chain;
    if (!backend || backend.kind !== "indexeddb") return;
    try {
      store.setState(dataFromDump(await backend.dump()));
    } catch (e) {
      fallBack(e);
    }
  }

  const get = () => store.getState();

  function put<S extends StoreName>(s: S, r: StoreRecords[S]): Promise<void> {
    return write((b) => b.put(s, r));
  }

  // ---- progress and history -------------------------------------------------------------------

  async function recordProgress(p: ProgressInput): Promise<void> {
    await ready();
    const ref = momentRef({ shiurId: p.shiurId, start: p.t, end: null, momentId: null });
    if (!ref || !Number.isFinite(p.duration) || p.duration < 0) return;
    const ts = now();
    const prev = get().progress[p.shiurId];
    const chapters = new Set(prev?.completedChapters ?? []);
    for (const c of p.completedChapters ?? []) if (Number.isInteger(c) && c >= 0) chapters.add(c);
    const done = p.completed === true || (p.duration > 0 && p.t >= p.duration - FINISHED_WITHIN);
    const rec: ProgressRecord = {
      shiurId: p.shiurId,
      t: done ? p.duration : p.t,
      duration: p.duration,
      completedChapters: [...chapters].sort((a, b) => a - b),
      completedAt: done ? (prev?.completedAt ?? ts) : null,
      updatedAt: ts,
    };
    const hist: HistoryRecord = { shiurId: p.shiurId, t: rec.t, lastPlayedAt: ts, updatedAt: ts };
    const others = get().history.filter((h) => h.shiurId !== p.shiurId);
    const history = [hist, ...others];
    const dropped = history.splice(LIMITS.history);
    store.setState({ progress: { ...get().progress, [p.shiurId]: rec }, history });
    await write(async (b) => {
      await b.put("progress", rec);
      await b.put("history", hist);
      for (const d of dropped) await b.delete("history", d.shiurId);
    });
  }

  async function clearProgress(shiurId: string): Promise<void> {
    await ready();
    const { [shiurId]: _gone, ...rest } = get().progress;
    store.setState({ progress: rest });
    await write((b) => b.delete("progress", shiurId));
  }

  async function removeHistory(shiurId: string): Promise<void> {
    await ready();
    store.setState({ history: get().history.filter((h) => h.shiurId !== shiurId) });
    await write((b) => b.delete("history", shiurId));
  }

  async function clearHistory(): Promise<void> {
    await ready();
    store.setState({ history: [] });
    await write((b) => b.clear(["history"]));
  }

  // ---- queue ----------------------------------------------------------------------------------

  function currentKey(): string | null {
    const v = get().prefs[PREF_QUEUE_CURRENT]?.value;
    return typeof v === "string" ? v : null;
  }

  function prefRecord(key: string, value: JsonValue): PrefRecord {
    return { key, value, updatedAt: now() };
  }

  async function enqueue(items: readonly MomentInput[], where: "end" | "next" = "end"): Promise<string[]> {
    await ready();
    const refs = items.map(toRef).filter((r): r is MomentRef => r !== null);
    const queue = get().queue;
    const room = Math.max(0, LIMITS.queue - queue.length);
    const take = refs.slice(0, room);
    if (take.length === 0) return [];
    let lo: number;
    let hi: number;
    const cur = currentKey();
    const ci = cur === null ? -1 : queue.findIndex((q) => q.key === cur);
    if (where === "next" && queue.length > 0) {
      lo = ci >= 0 ? queue[ci]!.pos : queue[0]!.pos - 1;
      const after = queue[ci + 1];
      hi = after ? after.pos : lo + take.length + 1;
    } else {
      lo = queue.length > 0 ? queue[queue.length - 1]!.pos : 0;
      hi = lo + take.length + 1;
    }
    const step = (hi - lo) / (take.length + 1);
    const ts = now();
    const added: QueueRecord[] = take.map((r, i) => ({ ...r, key: newId(), pos: lo + step * (i + 1), updatedAt: ts }));
    store.setState({ queue: [...queue, ...added].sort(byPos) });
    await write((b) => b.putMany("queue", added));
    return added.map((a) => a.key);
  }

  async function replaceQueue(items: readonly MomentInput[]): Promise<string[]> {
    await ready();
    const ts = now();
    const refs = items.map(toRef).filter((r): r is MomentRef => r !== null).slice(0, LIMITS.queue);
    const queue: QueueRecord[] = refs.map((r, i) => ({ ...r, key: newId(), pos: i + 1, updatedAt: ts }));
    const first = queue[0]?.key ?? null;
    const cur = prefRecord(PREF_QUEUE_CURRENT, first);
    store.setState({ queue, prefs: { ...get().prefs, [PREF_QUEUE_CURRENT]: cur } });
    await write(async (b) => {
      await b.clear(["queue"]);
      await b.putMany("queue", queue);
      await b.put("prefs", cur);
    });
    return queue.map((q) => q.key);
  }

  async function removeFromQueue(key: string): Promise<void> {
    await ready();
    const queue = get().queue;
    const i = queue.findIndex((q) => q.key === key);
    if (i < 0) return;
    const next = queue.filter((q) => q.key !== key);
    store.setState({ queue: next });
    await write((b) => b.delete("queue", key));
    if (currentKey() === key) await setQueueCurrent(null);
  }

  async function moveInQueue(key: string, delta: -1 | 1): Promise<void> {
    await ready();
    const queue = [...get().queue];
    const i = queue.findIndex((q) => q.key === key);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= queue.length) return;
    const ts = now();
    const a = { ...queue[i]!, pos: queue[j]!.pos, updatedAt: ts };
    const b = { ...queue[j]!, pos: queue[i]!.pos, updatedAt: ts };
    queue[i] = b;
    queue[j] = a;
    store.setState({ queue: queue.sort(byPos) });
    await write((be) => be.putMany("queue", [a, b]));
  }

  async function clearQueue(): Promise<void> {
    await ready();
    const cur = prefRecord(PREF_QUEUE_CURRENT, null);
    store.setState({ queue: [], prefs: { ...get().prefs, [PREF_QUEUE_CURRENT]: cur } });
    await write(async (b) => {
      await b.clear(["queue"]);
      await b.put("prefs", cur);
    });
  }

  async function setQueueCurrent(key: string | null): Promise<void> {
    await ready();
    const k = key !== null && get().queue.some((q) => q.key === key) ? key : null;
    if (currentKey() === k && get().prefs[PREF_QUEUE_CURRENT]) return;
    const cur = prefRecord(PREF_QUEUE_CURRENT, k);
    store.setState({ prefs: { ...get().prefs, [PREF_QUEUE_CURRENT]: cur } });
    await put("prefs", cur);
  }

  // ---- playlists ------------------------------------------------------------------------------

  function cleanName(name: string): string {
    return name.trim().slice(0, LIMITS.nameLength);
  }

  function upsertPlaylist(p: PlaylistRecord): void {
    store.setState({ playlists: [p, ...get().playlists.filter((x) => x.id !== p.id)].sort(byUpdatedDesc) });
  }

  async function createPlaylist(name: string, items: readonly MomentInput[]): Promise<string> {
    await ready();
    const ts = now();
    const p: PlaylistRecord = {
      id: newId(),
      name: cleanName(name),
      items: items.map(toRef).filter((r): r is MomentRef => r !== null).slice(0, LIMITS.playlistItems),
      createdAt: ts,
      updatedAt: ts,
    };
    upsertPlaylist(p);
    await put("playlists", p);
    return p.id;
  }

  async function changePlaylist(id: string, change: (p: PlaylistRecord) => Partial<PlaylistRecord>): Promise<void> {
    await ready();
    const p = get().playlists.find((x) => x.id === id);
    if (!p) return;
    const next: PlaylistRecord = { ...p, ...change(p), updatedAt: now() };
    upsertPlaylist(next);
    await put("playlists", next);
  }

  const renamePlaylist = (id: string, name: string) => changePlaylist(id, () => ({ name: cleanName(name) }));
  const addToPlaylist = (id: string, items: readonly MomentInput[]) =>
    changePlaylist(id, (p) => ({
      items: [...p.items, ...items.map(toRef).filter((r): r is MomentRef => r !== null)].slice(0, LIMITS.playlistItems),
    }));
  const removeFromPlaylist = (id: string, i: number) =>
    changePlaylist(id, (p) => ({ items: p.items.filter((_, j) => j !== i) }));

  async function deletePlaylist(id: string): Promise<void> {
    await ready();
    store.setState({ playlists: get().playlists.filter((p) => p.id !== id) });
    await write((b) => b.delete("playlists", id));
  }

  // ---- saved moments --------------------------------------------------------------------------

  async function saveMoment(m: MomentInput): Promise<string | null> {
    await ready();
    const ref = toRef(m);
    if (!ref) return null;
    const existing = get().saved.find(
      (s) => s.shiurId === ref.shiurId && (ref.momentId !== null ? s.momentId === ref.momentId : s.momentId === null && s.t === ref.start),
    );
    if (existing) return existing.id;
    if (get().saved.length >= LIMITS.saved) return null;
    const rec: SavedRecord = { id: newId(), shiurId: ref.shiurId, t: ref.start, end: ref.end, momentId: ref.momentId, updatedAt: now() };
    store.setState({ saved: [rec, ...get().saved] });
    await put("saved", rec);
    return rec.id;
  }

  async function unsave(id: string): Promise<void> {
    await ready();
    store.setState({ saved: get().saved.filter((s) => s.id !== id) });
    await write((b) => b.delete("saved", id));
  }

  // ---- notes ----------------------------------------------------------------------------------

  async function addNote(shiurId: string, t: number, text: string): Promise<string | null> {
    await ready();
    const ref = momentRef({ shiurId, start: t, end: null, momentId: null });
    const body = text.trim().slice(0, LIMITS.noteLength);
    if (!ref || body.length === 0 || get().notes.length >= LIMITS.notes) return null;
    const ts = now();
    const rec: NoteRecord = { id: newId(), shiurId, t: ref.start, text: body, createdAt: ts, updatedAt: ts };
    store.setState({ notes: [...get().notes, rec].sort(byNote) });
    await put("notes", rec);
    return rec.id;
  }

  async function editNote(id: string, text: string): Promise<void> {
    await ready();
    const n = get().notes.find((x) => x.id === id);
    const body = text.trim().slice(0, LIMITS.noteLength);
    if (!n) return;
    if (body.length === 0) return deleteNote(id);
    const rec: NoteRecord = { ...n, text: body, updatedAt: now() };
    store.setState({ notes: get().notes.map((x) => (x.id === id ? rec : x)) });
    await put("notes", rec);
  }

  async function deleteNote(id: string): Promise<void> {
    await ready();
    store.setState({ notes: get().notes.filter((n) => n.id !== id) });
    await write((b) => b.delete("notes", id));
  }

  // ---- prefs and downloads --------------------------------------------------------------------

  async function setPref(key: string, value: JsonValue): Promise<void> {
    await ready();
    const rec = prefRecord(key, value);
    store.setState({ prefs: { ...get().prefs, [key]: rec } });
    await put("prefs", rec);
  }

  async function putDownload(d: Omit<DownloadRecord, "updatedAt">): Promise<void> {
    await ready();
    const rec: DownloadRecord = { ...d, recordingIds: [...d.recordingIds], updatedAt: now() };
    store.setState({ downloads: { ...get().downloads, [d.shiurId]: rec } });
    await put("downloads", rec);
  }

  async function removeDownload(shiurId: string): Promise<void> {
    await ready();
    const { [shiurId]: _gone, ...rest } = get().downloads;
    store.setState({ downloads: rest });
    await write((b) => b.delete("downloads", shiurId));
  }

  // ---- export / import ------------------------------------------------------------------------

  async function exportFile(): Promise<ExportFile> {
    await ready();
    await chain;
    return buildExport(dumpFromData(get()), now());
  }

  async function importText(text: string, mode: ImportMode): Promise<ParsedImport> {
    await ready();
    const parsed = parseImport(text);
    const next = mode === "replace" ? parsed.dump : mergeDumps(dumpFromData(get()), parsed.dump);
    store.setState(dataFromDump(next));
    await write((b) => b.replaceAll(next));
    return parsed;
  }

  async function clearAll(): Promise<void> {
    await ready();
    store.setState(dataFromDump(emptyDump()));
    await write((b) => b.clear(STORE_NAMES));
  }

  function dispose(): void {
    try {
      channel?.close();
    } catch {
      /* ignore */
    }
    backend?.close();
  }

  return {
    store,
    ready,
    recordProgress,
    clearProgress,
    removeHistory,
    clearHistory,
    enqueue,
    replaceQueue,
    removeFromQueue,
    moveInQueue,
    clearQueue,
    setQueueCurrent,
    createPlaylist,
    renamePlaylist,
    deletePlaylist,
    addToPlaylist,
    removeFromPlaylist,
    saveMoment,
    unsave,
    addNote,
    editNote,
    deleteNote,
    setPref,
    putDownload,
    removeDownload,
    exportFile,
    importText,
    clearAll,
    dispose,
  };
}

// ---- selectors (pure; usable with usePersonal and in tests) -----------------------------------

/** The current queue entry's key, if it is still in the queue. */
export function queueCurrentKey(s: PersonalData): string | null {
  const v = s.prefs[PREF_QUEUE_CURRENT]?.value;
  return typeof v === "string" && s.queue.some((q) => q.key === v) ? v : null;
}

/**
 * "Continue listening" (concept-live §5.1, §6.4): unfinished shiurim with more than a few seconds
 * played, most recent first. W3.8's Today page reads this for its continue row.
 */
export function continueListening(s: Pick<PersonalData, "progress">, limit = 20): ProgressRecord[] {
  return Object.values(s.progress)
    .filter((p) => p.completedAt === null && p.t >= CONTINUE_MIN_SECONDS)
    .sort(byUpdatedDesc)
    .slice(0, limit);
}

export function notesFor(s: PersonalData, shiurId: string): NoteRecord[] {
  return s.notes.filter((n) => n.shiurId === shiurId);
}

export function savedFor(s: PersonalData, shiurId: string): SavedRecord[] {
  return s.saved.filter((n) => n.shiurId === shiurId);
}

/** Total seconds listened to completion plus current positions (the private hours count, §6.4). */
export function listenedSeconds(s: PersonalData): number {
  return Object.values(s.progress).reduce((sum, p) => sum + Math.min(p.t, p.duration || p.t), 0);
}

// ---- the app-wide instance --------------------------------------------------------------------

let shared: Personal | null = null;

/** The app's personal store (created on first use; it opens IndexedDB lazily on `ready()`). */
export function getPersonal(): Personal {
  shared ??= createPersonal();
  return shared;
}

/** Replace the app-wide instance (tests). */
export function setPersonal(p: Personal | null): void {
  shared?.dispose();
  shared = p;
}

/** React: subscribe to a slice of the app-wide personal state. Starts loading on first use. */
export function usePersonal<T>(selector: (s: PersonalState) => T): T {
  const p = getPersonal();
  if (typeof window !== "undefined" && p.store.getState().status === "idle") void p.ready();
  return useStore(p.store, selector);
}
