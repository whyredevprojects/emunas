/**
 * Types for the Live player engine (tech-live §4.1, integration-plan W2.5).
 *
 * The engine is framework-free: nothing here (or anywhere in this folder) imports React. The UI reads
 * it through `getState()` / `subscribe()` (made for `useSyncExternalStore`) and `on(event, fn)`.
 */
import type { AudioVersion } from "@emunas/i18n";
import type {
  Ed,
  L,
  PublicChapter,
  PublicRecording,
  PublicShiur,
  SkipKind,
  SkipRange,
} from "@emunas/corpus/public";

export type { AudioVersion, Ed, L, SkipKind, SkipRange };

/**
 * A recording as the engine needs it. Amendment A1: the corpus build emits `audioUrl` (absolute URL
 * on the media host, CORS enabled), `null` for a recording that is not playable (non-mp3). There is
 * no same-origin `/audio/` fallback: a recording without a URL is unavailable. `cleanedUrl` is the
 * AI-improved copy of the same recording (same length), played by default; `null` when there is none
 * (docs/sites/cleaned-audio-ux.md).
 */
export interface PlayerRecording extends Pick<PublicRecording, "id" | "offset" | "duration"> {
  audioUrl: string | null;
  cleanedUrl: string | null;
}

export type PlayerChapter = Pick<PublicChapter, "t" | "end" | "title"> & Partial<Pick<PublicChapter, "idx" | "id">>;

/**
 * The slice of `PublicShiur` the engine reads. A full `PublicShiur` (from `/data/shiur/<id>.json`) is
 * assignable to it; so are lighter objects built for tests or a list row plus recordings.
 */
export interface PlayerShiur {
  id: PublicShiur["id"];
  lang: PublicShiur["lang"];
  duration: number;
  catalog: Pick<PublicShiur["catalog"], "titleOriginal"> & { heading?: string };
  recordings: readonly PlayerRecording[];
  notes?: {
    chapters: readonly PlayerChapter[];
    skip: readonly SkipRange[];
  };
}

/** A queue item (tech-live §4.1 "Moments"). `start`/`end` are global seconds. */
export interface QueueItem {
  shiurId: string;
  start?: number;
  end?: number;
}

export interface LoadOptions {
  /** Global seconds to start from (default 0). */
  start?: number;
  /** Global seconds at which to pause and offer "keep listening" (moment end). */
  end?: number;
  /** Start playing as soon as possible (default false). */
  autoplay?: boolean;
}

export interface SkipSettings {
  enabled: boolean;
  kinds: readonly SkipKind[];
  /** Ranges (after merging adjacent ones) shorter than this are played. */
  minSeconds: number;
}

export type SleepSpec = { kind: "minutes"; minutes: number } | { kind: "chapter" } | { kind: "shiur" };

export type SleepState =
  | { kind: "minutes"; endsAt: number }
  | { kind: "chapter"; at: number }
  | { kind: "shiur" };

export interface SkipEvent {
  shiurId: string;
  kind: SkipKind;
  /** Global seconds where playback was when the skip happened (undo returns here). */
  from: number;
  /** Global seconds playback jumped to. */
  to: number;
  /** `to - from`, for "skipped 2:10 of singing". */
  seconds: number;
}

export type ProgressReason = "interval" | "pause" | "pagehide" | "ended" | "unload";

export interface ProgressEvent {
  shiurId: string;
  t: number;
  duration: number;
  chapterIndex: number;
  reason: ProgressReason;
}

export type PlayerStatus = "idle" | "loading" | "playing" | "paused" | "ended" | "unavailable" | "error";

export interface PlayerState {
  shiurId: string | null;
  status: PlayerStatus;
  /** Global seconds. */
  t: number;
  duration: number;
  recordingIndex: number;
  recordingId: string | null;
  /** Index into `notes.chapters`, -1 when the shiur has no chapters. */
  chapterIndex: number;
  rate: number;
  /** Moment end (global seconds) still ahead, or the one just reached while `momentEnded`. */
  momentEnd: number | null;
  /** True after the engine paused at a moment end, until `keepListening()` or a new load/seek. */
  momentEnded: boolean;
  sleep: SleepState | null;
  /** The most recent automatic skip, for the dock's "skipped … / undo"; null after undo or load. */
  lastSkip: SkipEvent | null;
  skip: SkipSettings;
  readingLang: Ed;
  error: string | null;
  /** The listener's one global choice of version (cleaned-audio-ux §6). */
  audioVersion: AudioVersion;
  /** The version the current recording plays: "original" when it has no improved copy or fell back. */
  playingVersion: AudioVersion;
  /** The current recording has an improved copy (states A/B); false is state C (no line). */
  cleanedAvailable: boolean;
  /**
   * The listener asked for the improved copy and it could not load (offline, or the file failed), so
   * the original (e.g. the downloaded copy) plays instead. Cleared by the next switch, load or after
   * a few seconds; the dock shows a brief notice while it is set.
   */
  versionFallback: boolean;
}

export interface PlayerEvents {
  skip: SkipEvent;
  skipundo: SkipEvent;
  momentend: { shiurId: string; t: number };
  /** The shiur played to its end (not fired when a "end of shiur" sleep timer stopped it). */
  ended: { shiurId: string };
  sleep: { shiurId: string | null; t: number; kind: SleepSpec["kind"] };
  progress: ProgressEvent;
  error: { shiurId: string | null; message: string };
}

export type PlayerEventName = keyof PlayerEvents;

/** The subset of `HTMLMediaElement` the engine touches. `HTMLAudioElement` satisfies it. */
export interface MediaElementLike {
  src: string;
  currentTime: number;
  playbackRate: number;
  defaultPlaybackRate: number;
  preload: string;
  readonly paused: boolean;
  readonly ended: boolean;
  readonly readyState: number;
  play(): Promise<void>;
  pause(): void;
  addEventListener(type: string, listener: (ev: Event) => void): void;
  removeEventListener(type: string, listener: (ev: Event) => void): void;
}

export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

/** `navigator.mediaSession` satisfies it. */
export interface MediaSessionLike {
  metadata: MediaMetadata | null;
  playbackState: MediaSessionPlaybackState;
  setActionHandler(action: MediaSessionAction, handler: MediaSessionActionHandler | null): void;
  setPositionState?(state?: MediaPositionState): void;
}

export interface ChapterInfoInit {
  title: string;
  startTime: number;
}

/** `MediaMetadataInit` plus `chapterInfo` (progressive enhancement where supported). */
export type MetadataInit = MediaMetadataInit & { chapterInfo?: ChapterInfoInit[] };

export interface MediaSessionEnv {
  session: MediaSessionLike;
  Metadata: new (init: MetadataInit) => MediaMetadata;
}

export interface LifecycleTarget {
  addEventListener(type: string, listener: (ev: Event) => void): void;
  removeEventListener(type: string, listener: (ev: Event) => void): void;
}

export interface DescribeContext {
  shiur: PlayerShiur;
  chapter: PlayerChapter | null;
  readingLang: Ed;
}

export interface PlayerEngineOptions {
  /** The one audio element. Default: `new Audio()` (created by the engine, outside React). */
  audio?: MediaElementLike;
  clock?: Clock;
  /** Default: `navigator.mediaSession` + `MediaMetadata` when present; `null` disables. */
  mediaSession?: MediaSessionEnv | null;
  /** Where `pagehide` is listened for. Default: `window` when present; `null` disables. */
  lifecycle?: LifecycleTarget | null;
  /** Recording + version → playable URL, or null when unavailable. Default: `recordingAudioUrl`. */
  resolveAudioUrl?: (rec: PlayerRecording, shiur: PlayerShiur, version: AudioVersion) => string | null;
  /** The listener's stored choice, read synchronously before the first load (default "cleaned"). */
  audioVersion?: AudioVersion;
  /**
   * Whether the improved copy may be tried for this recording without the listener asking (default:
   * always). The app answers false while offline, so a downloaded shiur plays its stored original at
   * once; an explicit switch still tries the improved copy and falls back if it cannot load.
   */
  canTryCleaned?: (rec: PlayerRecording, shiur: PlayerShiur) => boolean;
  /** Media Session metadata. Default: chapter title / Rav / catalog title (tech-live §4.1). */
  describe?: (ctx: DescribeContext) => MediaMetadataInit;
  skip?: Partial<SkipSettings>;
  rate?: number;
  readingLang?: Ed;
  /** Default 5000 ms. */
  progressIntervalMs?: number;
  /** Seek step for Media Session seekbackward/seekforward without an offset (default 15 s). */
  seekStep?: number;
}

export interface PlayerEngine {
  readonly audio: MediaElementLike;
  getState(): PlayerState;
  subscribe(listener: () => void): () => void;
  on<K extends PlayerEventName>(type: K, fn: (ev: PlayerEvents[K]) => void): () => void;
  load(shiur: PlayerShiur, opts?: LoadOptions): void;
  play(): void;
  pause(): void;
  toggle(): void;
  /** User seek to global seconds. Landing inside a skip range plays it (the user asked for it). */
  seek(t: number): void;
  seekBy(delta: number): void;
  nextChapter(): void;
  /** Restarts the current chapter if more than 3 s of it have played, else goes to the previous one. */
  prevChapter(): void;
  setRate(rate: number): void;
  setSkipSettings(s: Partial<SkipSettings>): void;
  undoSkip(): void;
  /** After a moment end: clear it and continue playing the shiur. */
  keepListening(): void;
  setSleepTimer(spec: SleepSpec | null): void;
  setReadingLanguage(lang: Ed): void;
  /**
   * Switch the version (the listener's click, or an imported preference). Keeps the position, the
   * play/pause state and the speed: the current recording swaps `src` through the normal path.
   */
  setAudioVersion(version: AudioVersion): void;
  /** Emit a progress event now (e.g. before navigating away from the app). */
  flushProgress(reason?: ProgressReason): void;
  destroy(): void;
}
