/**
 * The player UI's access to the one app-wide engine (W2.5) and the shiurim it has been given.
 *
 * - `getEngine()` creates the shared engine on first use **in the browser** with this app's Media
 *   Session `describe` (album = the series title when the shiur belongs to one, W2.5 note), so every
 *   caller that plays audio should go through here rather than `getPlayerEngine()` directly.
 * - `playShiur()` registers the shiur's display data (chapter titles, series title) for the dock and
 *   the lock screen, then loads it.
 * - `usePlayerState()` reads engine state with `useSyncExternalStore`; during prerender (no `Audio`)
 *   it returns the idle state and never creates the engine.
 */
import type { LocalizedText } from "@emunas/corpus/public";
import { useSyncExternalStore } from "react";
import {
  DEFAULT_SKIP,
  getPlayerEngine,
  type LoadOptions,
  type PlayerEngine,
  type PlayerShiur,
  type PlayerState,
} from "../player-engine/index.ts";
import { makeDescribe } from "./describe.ts";

/** What the dock and the Media Session need to know about a loaded shiur beyond `PlayerShiur`. */
export interface PlayingInfo {
  shiur: PlayerShiur;
  /** Series title, used as the Media Session album and in the dock. */
  seriesTitle: LocalizedText | null;
}

const registry = new Map<string, PlayingInfo>();
const registryListeners = new Set<() => void>();
let registryVersion = 0;

export function registerShiur(info: PlayingInfo): void {
  registry.set(info.shiur.id, info);
  registryVersion++;
  for (const l of [...registryListeners]) l();
}

export function playingInfo(shiurId: string | null): PlayingInfo | null {
  return shiurId === null ? null : (registry.get(shiurId) ?? null);
}

export function useRegistryVersion(): number {
  return useSyncExternalStore(
    (l) => {
      registryListeners.add(l);
      return () => registryListeners.delete(l);
    },
    () => registryVersion,
    () => 0,
  );
}

/** The app's Media Session `describe`: album = series title of registered shiurim. */
export const appDescribe = makeDescribe((id) => registry.get(id)?.seriesTitle ?? null);

let installed: PlayerEngine | null = null;

/** True where an engine can exist (a browser with `Audio`), false during prerender and in Node. */
export function canPlay(): boolean {
  return installed !== null || typeof (globalThis as { Audio?: unknown }).Audio === "function";
}

/** The app's engine. Throws where `canPlay()` is false. */
export function getEngine(): PlayerEngine {
  return installed ?? getPlayerEngine({ describe: appDescribe });
}

/** Tests: use this engine instead of the shared one (null restores the default). Install before rendering. */
export function installEngine(engine: PlayerEngine | null): void {
  installed = engine;
}

/** Registers the shiur's display data and loads it into the engine. */
export function playShiur(info: PlayingInfo, opts: LoadOptions = {}): void {
  registerShiur(info);
  getEngine().load(info.shiur, opts);
}

export const IDLE_STATE: PlayerState = Object.freeze({
  shiurId: null,
  status: "idle",
  t: 0,
  duration: 0,
  recordingIndex: -1,
  recordingId: null,
  chapterIndex: -1,
  rate: 1,
  momentEnd: null,
  momentEnded: false,
  sleep: null,
  lastSkip: null,
  skip: DEFAULT_SKIP,
  readingLang: "yi",
  error: null,
}) as PlayerState;

function subscribe(listener: () => void): () => void {
  if (!canPlay()) return () => {};
  return getEngine().subscribe(listener);
}

function snapshot(): PlayerState {
  return canPlay() ? getEngine().getState() : IDLE_STATE;
}

export function usePlayerState(): PlayerState {
  return useSyncExternalStore(subscribe, snapshot, () => IDLE_STATE);
}

/** Seek within the loaded shiur or load it at `t`; then play. */
export function playAt(info: PlayingInfo, t: number, end?: number): void {
  const engine = getEngine();
  if (engine.getState().shiurId === info.shiur.id && end === undefined) {
    registerShiur(info);
    engine.seek(t);
    engine.play();
    return;
  }
  playShiur(info, { start: t, autoplay: true, ...(end === undefined ? {} : { end }) });
}
