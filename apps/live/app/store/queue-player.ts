/**
 * Plays the queue of moments (concept-live §6.2): each entry plays from its start to its end (a moment)
 * or to the end of the shiur (a whole shiur), then the next entry starts, across shiurim.
 *
 * The engine knows nothing about queues: it pauses at a moment end (`momentend`) or finishes a shiur
 * (`ended`). This controller listens for those, loads the next entry's shiur JSON and hands it to the
 * engine with `{ start, end, autoplay }`. Playing anything else (the listener opens another shiur)
 * releases the queue; the entries stay, and "play" resumes from the current one.
 *
 * Entries whose shiur cannot be loaded or has no playable audio are marked failed and skipped.
 */
import { createStore, useStore, type StoreApi } from "zustand";
// eslint-disable-next-line no-restricted-imports -- app/data is the Live data contract (W2.4), not the pipeline data folder
import { loadShiur } from "../data/index.ts";
import { getPlayerEngine, type PlayerEngine, type PlayerShiur } from "../player-engine/index.ts";
import { getPersonal, queueCurrentKey, type Personal } from "./personal.ts";
import { attachProgressRecorder } from "./progress-recorder.ts";
import type { QueueRecord } from "./schema.ts";

export interface QueuePlayerState {
  /** The entry the queue is playing, `null` when the queue is not driving the player. */
  activeKey: string | null;
  loading: boolean;
  /** Entries skipped because their shiur or audio was unavailable. */
  failed: readonly string[];
  /** True after the last entry finished. */
  finished: boolean;
}

export interface QueuePlayerDeps {
  engine: Pick<PlayerEngine, "load" | "on" | "getState" | "subscribe">;
  loadShiur(id: string): Promise<PlayerShiur>;
  personal: Personal;
}

export interface QueuePlayer {
  readonly store: StoreApi<QueuePlayerState>;
  /** Plays the entry with this key. */
  play(key: string): Promise<void>;
  /** Plays from the current entry (or the first). */
  start(): Promise<void>;
  next(): Promise<void>;
  prev(): Promise<void>;
  /** Stops driving the player (does not pause it). */
  release(): void;
  destroy(): void;
}

export function createQueuePlayer(deps: QueuePlayerDeps): QueuePlayer {
  const { engine, personal } = deps;
  const store = createStore<QueuePlayerState>()(() => ({ activeKey: null, loading: false, failed: [], finished: false }));
  /** Bumped on every play/release, so a slow load for an older request is ignored. */
  let generation = 0;

  const queue = (): readonly QueueRecord[] => personal.store.getState().queue;
  const entry = (key: string | null) => (key === null ? undefined : queue().find((q) => q.key === key));

  function markFailed(key: string): void {
    const failed = store.getState().failed;
    if (!failed.includes(key)) store.setState({ failed: [...failed, key] });
  }

  async function play(key: string): Promise<void> {
    await personal.ready();
    const item = entry(key);
    if (!item) return;
    const gen = ++generation;
    store.setState({ activeKey: key, loading: true, finished: false });
    void personal.setQueueCurrent(key);
    let shiur: PlayerShiur;
    try {
      shiur = await deps.loadShiur(item.shiurId);
    } catch {
      if (gen !== generation) return;
      markFailed(key);
      return advanceFrom(key);
    }
    if (gen !== generation) return;
    engine.load(shiur, {
      start: item.start,
      ...(item.end !== null ? { end: item.end } : {}),
      autoplay: true,
    });
    store.setState({ loading: false });
    if (engine.getState().status === "unavailable") {
      markFailed(key);
      return advanceFrom(key);
    }
  }

  async function advanceFrom(key: string | null, dir: 1 | -1 = 1): Promise<void> {
    const q = queue();
    const i = key === null ? -1 : q.findIndex((x) => x.key === key);
    const target = dir === 1 ? q[i + 1] : q[Math.max(0, i - 1)];
    if (!target || (dir === -1 && i < 0)) {
      generation++;
      store.setState({ activeKey: null, loading: false, finished: dir === 1 && i >= 0 });
      return;
    }
    return play(target.key);
  }

  async function start(): Promise<void> {
    await personal.ready();
    const s = personal.store.getState();
    const key = queueCurrentKey(s) ?? s.queue[0]?.key ?? null;
    if (key !== null) await play(key);
  }

  function current(): string | null {
    return store.getState().activeKey ?? queueCurrentKey(personal.store.getState());
  }

  function release(): void {
    generation++;
    store.setState({ activeKey: null, loading: false });
  }

  function onShiurDone(ev: { shiurId: string }): void {
    const { activeKey, loading } = store.getState();
    const item = entry(activeKey);
    if (loading || !item || item.shiurId !== ev.shiurId) return;
    void advanceFrom(activeKey);
  }

  const offs = [
    engine.on("momentend", onShiurDone),
    engine.on("ended", onShiurDone),
    engine.subscribe(() => {
      const { activeKey, loading } = store.getState();
      if (activeKey === null || loading) return;
      const item = entry(activeKey);
      const playing = engine.getState().shiurId;
      // The listener played something else, or removed the entry: the queue lets go.
      if (!item || (playing !== null && playing !== item.shiurId)) release();
    }),
  ];

  return {
    store,
    play,
    start,
    next: () => advanceFrom(current(), 1),
    prev: () => advanceFrom(current(), -1),
    release,
    destroy() {
      release();
      for (const off of offs) off();
    },
  };
}

// ---- the app-wide instance --------------------------------------------------------------------

let shared: QueuePlayer | null = null;

/**
 * The app's queue player, bound to the shared engine and `/data/shiur/<id>.json`. Created on first
 * use (a user action), so it never creates the engine during render or prerender.
 */
export function getQueuePlayer(): QueuePlayer {
  if (!shared) {
    const engine = getPlayerEngine();
    attachProgressRecorder(engine, getPersonal());
    shared = createQueuePlayer({ engine, loadShiur: (id) => loadShiur(id), personal: getPersonal() });
  }
  return shared;
}

/** The shared queue player if it exists (no side effects). */
export function peekQueuePlayer(): QueuePlayer | null {
  return shared;
}

export function setQueuePlayer(q: QueuePlayer | null): void {
  shared?.destroy();
  shared = q;
}

const idle: StoreApi<QueuePlayerState> = createStore<QueuePlayerState>()(() => ({
  activeKey: null,
  loading: false,
  failed: [],
  finished: false,
}));

/** React: the queue player's state (idle until the queue is first played). */
export function useQueuePlayerState<T>(selector: (s: QueuePlayerState) => T, player: QueuePlayer | null): T {
  return useStore(player?.store ?? idle, selector);
}
