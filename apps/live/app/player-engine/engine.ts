/**
 * The Live player engine (tech-live §4.1, integration-plan W2.5, Amendment A1).
 *
 * One media element, created once outside React, plays a shiur as one global timeline across its
 * recordings: global seconds map to (recording, local seconds) and the engine swaps `src` at
 * recording boundaries. Skip ranges, moment ends and the "end of chapter" sleep timer are scheduled
 * with timers computed from `currentTime` and `playbackRate`, re-armed on play/seek/ratechange, with
 * `timeupdate` only as a backstop.
 *
 * Versions (docs/sites/cleaned-audio-ux.md §6): a recording with `cleanedUrl` plays its AI-improved
 * copy unless the listener chose the original. A switch re-runs `goTo(t)`: the URL differs, so the
 * element swaps `src` at the same local second, keeping play/pause and speed. If the improved file
 * fails to load, that recording falls back once to the original (the preference is not changed).
 */
import { DEFAULT_AUDIO_VERSION } from "@emunas/i18n";
import { MediaSessionBridge, defaultDescribe, getDefaultMediaSession } from "./media-session.ts";
import {
  DEFAULT_SKIP,
  EPS,
  type PlannedSkip,
  chapterIndexAt,
  chaptersOf,
  clampRate,
  locate,
  nextChapterTarget,
  nextSkip,
  planSkips,
  prevChapterTarget,
  recordingAudioUrl,
  skipContaining,
} from "./plan.ts";
import type {
  AudioVersion,
  Clock,
  Ed,
  LoadOptions,
  MediaElementLike,
  PlayerEngine,
  PlayerEngineOptions,
  PlayerEventName,
  PlayerEvents,
  PlayerRecording,
  PlayerShiur,
  PlayerState,
  PlayerStatus,
  ProgressReason,
  SkipEvent,
  SkipSettings,
  SleepSpec,
  SleepState,
} from "./types.ts";

const MIN_TIMER_MS = 10;
/** How long the "improved version could not load" notice stays. */
export const VERSION_FALLBACK_NOTICE_MS = 8000;
const HAVE_METADATA = 1;

const MEDIA_EVENTS = [
  "loadedmetadata",
  "play",
  "playing",
  "pause",
  "waiting",
  "seeking",
  "seeked",
  "timeupdate",
  "ratechange",
  "ended",
  "error",
] as const;

function defaultClock(): Clock {
  return {
    now: () => Date.now(),
    setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
    clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof globalThis.setTimeout>),
    setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
    clearInterval: (h) => globalThis.clearInterval(h as ReturnType<typeof globalThis.setInterval>),
  };
}

function defaultAudio(): MediaElementLike {
  const Ctor = (globalThis as { Audio?: new () => HTMLAudioElement }).Audio;
  if (!Ctor) throw new Error("player-engine: no Audio constructor; pass options.audio");
  return new Ctor();
}

function defaultLifecycle(): PlayerEngineOptions["lifecycle"] {
  const w = (globalThis as { window?: Window }).window;
  return w ?? null;
}

export function createPlayerEngine(options: PlayerEngineOptions = {}): PlayerEngine {
  const el: MediaElementLike = options.audio ?? defaultAudio();
  const clock = options.clock ?? defaultClock();
  const msEnv = options.mediaSession === undefined ? getDefaultMediaSession() : options.mediaSession;
  const lifecycle = options.lifecycle === undefined ? defaultLifecycle() : options.lifecycle;
  const resolveVersionUrl = options.resolveAudioUrl ?? ((rec, _shiur, version) => recordingAudioUrl(rec, version));
  const canTryCleaned = options.canTryCleaned ?? (() => true);
  const describe = options.describe ?? defaultDescribe;
  const progressMs = options.progressIntervalMs ?? 5000;
  const seekStep = options.seekStep ?? 15;
  const media = msEnv ? new MediaSessionBridge(msEnv, seekStep) : null;

  el.preload = "metadata";

  // ---- internal state ------------------------------------------------------------------------
  let shiur: PlayerShiur | null = null;
  let recIndex = 0;
  let currentSrc: string | null = null;
  /** Local seconds to apply once the new src has metadata. */
  let pendingLocal: number | null = null;
  /**
   * Local seconds of a seek handed to the element and not yet `seeked`. WebKit applies a seek later,
   * so `currentTime` read right after setting it still returns the old position; the engine's
   * position is the seek target until the element reports it arrived.
   */
  let seekTarget: number | null = null;
  /** True between setting a new src and its loadedmetadata (pause events are ours, not the user's). */
  let swapping = false;
  let wantPlaying = false;
  let buffering = false;
  let finished = false;
  let unavailable = false;
  let errorMsg: string | null = null;
  let rate = clampRate(options.rate ?? 1);
  let skipSettings: SkipSettings = { ...DEFAULT_SKIP, ...options.skip };
  let plan: PlannedSkip[] = [];
  const suppressed = new Set<string>();
  let lastSkip: SkipEvent | null = null;
  let momentEnd: number | null = null;
  let momentEnded = false;
  let sleep: SleepState | null = null;
  let readingLang: Ed = options.readingLang ?? "yi";
  let readingLangExplicit = options.readingLang !== undefined;
  let audioVersion: AudioVersion = options.audioVersion ?? DEFAULT_AUDIO_VERSION;
  /** Recordings (of the loaded shiur) whose improved copy failed to load: they play the original. */
  const fellBack = new Set<string>();
  /** Recordings the listener explicitly switched to the improved copy (bypasses `canTryCleaned`). */
  const askedCleaned = new Set<string>();
  /** The current src is the improved copy the listener just asked for, not yet loaded. */
  let switchPending = false;
  let versionFallback = false;
  let fallbackTimer: unknown = null;

  let boundaryTimer: unknown = null;
  let skipTimer: unknown = null;
  let sleepTimer: unknown = null;
  let progressTimer: unknown = null;

  const listeners = new Set<() => void>();
  const handlers: { [K in PlayerEventName]?: Set<(ev: PlayerEvents[K]) => void> } = {};

  /** Which version `rec` plays now. */
  function versionOf(rec: PlayerRecording): AudioVersion {
    if (!shiur || !rec.cleanedUrl || audioVersion !== "cleaned" || fellBack.has(rec.id)) return "original";
    if (!askedCleaned.has(rec.id) && !canTryCleaned(rec, shiur)) return "original";
    return "cleaned";
  }

  function resolveUrl(rec: PlayerRecording, sh: PlayerShiur): string | null {
    return resolveVersionUrl(rec, sh, versionOf(rec));
  }

  let state: PlayerState = snapshot();

  // ---- helpers -------------------------------------------------------------------------------
  function emit<K extends PlayerEventName>(type: K, ev: PlayerEvents[K]): void {
    const set = handlers[type] as Set<(e: PlayerEvents[K]) => void> | undefined;
    if (!set) return;
    for (const fn of [...set]) fn(ev);
  }

  function currentT(): number {
    if (!shiur) return 0;
    const rec = shiur.recordings[recIndex];
    if (!rec) return 0;
    if (finished) return shiur.duration;
    const local = pendingLocal ?? seekTarget ?? el.currentTime;
    const t = rec.offset + Math.min(Math.max(0, Number.isFinite(local) ? local : 0), rec.duration);
    return Math.min(t, shiur.duration);
  }

  function chapterIdx(t: number): number {
    return shiur ? chapterIndexAt(chaptersOf(shiur), t) : -1;
  }

  function status(): PlayerStatus {
    if (!shiur) return "idle";
    if (errorMsg) return "error";
    if (unavailable) return "unavailable";
    if (finished) return "ended";
    if (!wantPlaying) return "paused";
    return buffering || swapping ? "loading" : "playing";
  }

  function snapshot(): PlayerState {
    const t = currentT();
    const rec = shiur?.recordings[recIndex];
    return {
      shiurId: shiur?.id ?? null,
      status: status(),
      t,
      duration: shiur?.duration ?? 0,
      recordingIndex: shiur ? recIndex : -1,
      recordingId: rec?.id ?? null,
      chapterIndex: chapterIdx(t),
      rate,
      momentEnd,
      momentEnded,
      sleep,
      lastSkip,
      skip: skipSettings,
      readingLang,
      error: errorMsg,
      audioVersion,
      playingVersion: rec ? versionOf(rec) : "original",
      cleanedAvailable: !!rec?.audioUrl && !!rec.cleanedUrl,
      versionFallback,
    };
  }

  function commit(): void {
    const next = snapshot();
    const prev = state;
    let changed = false;
    for (const k of Object.keys(next) as (keyof PlayerState)[]) {
      if (next[k] !== prev[k]) {
        changed = true;
        break;
      }
    }
    if (!changed) return;
    state = next;
    if (media && shiur && (next.chapterIndex !== prev.chapterIndex || next.shiurId !== prev.shiurId)) {
      updateMetadata();
    }
    if (media && next.status !== prev.status) {
      media.setPlaybackState(next.status === "playing" || next.status === "loading" ? "playing" : shiur ? "paused" : "none");
    }
    for (const l of [...listeners]) l();
  }

  function updateMetadata(): void {
    if (!media || !shiur) return;
    const chapters = chaptersOf(shiur);
    const chapter = chapters[chapterIdx(currentT())] ?? null;
    media.setMetadata(describe({ shiur, chapter, readingLang }), shiur, chapters, readingLang);
  }

  function updatePosition(): void {
    if (media && shiur) media.setPosition(shiur.duration, currentT(), rate);
  }

  function clearTimer(h: unknown): null {
    if (h !== null) clock.clearTimeout(h);
    return null;
  }

  function isAdvancing(): boolean {
    return wantPlaying && !el.paused && !swapping && !finished && el.readyState >= HAVE_METADATA;
  }

  // ---- recordings ----------------------------------------------------------------------------
  function firstPlayableFrom(i: number): number {
    if (!shiur) return -1;
    for (let j = i; j < shiur.recordings.length; j++) {
      if (resolveUrl(shiur.recordings[j]!, shiur)) return j;
    }
    return -1;
  }

  /** Point the element at global seconds `t`, swapping src if it is in another recording. */
  function goTo(t: number): void {
    if (!shiur) return;
    const loc = locate(shiur, Math.min(Math.max(0, t), shiur.duration));
    if (!loc) {
      unavailable = true;
      return;
    }
    let { index, local } = loc;
    const playable = firstPlayableFrom(index);
    if (playable < 0) {
      if (firstPlayableFrom(0) < 0) {
        unavailable = true;
        el.pause();
        return;
      }
      finish();
      return;
    }
    if (playable !== index) {
      index = playable;
      local = 0;
    }
    const rec = shiur.recordings[index]!;
    if (local >= rec.duration - EPS && index === shiur.recordings.length - 1) {
      recIndex = index;
      finish();
      return;
    }
    const url = resolveUrl(rec, shiur)!;
    finished = false;
    if (index !== recIndex || url !== currentSrc) {
      recIndex = index;
      currentSrc = url;
      pendingLocal = local;
      seekTarget = null;
      swapping = true;
      buffering = true;
      el.src = url;
      el.defaultPlaybackRate = rate;
      el.playbackRate = rate;
      if (wantPlaying) startElement();
    } else if (pendingLocal !== null) {
      pendingLocal = local;
    } else {
      seekElement(local);
    }
  }

  function seekElement(local: number): void {
    seekTarget = local;
    el.currentTime = local;
  }

  function startElement(): void {
    let p: Promise<void> | undefined;
    try {
      p = el.play();
    } catch (e) {
      onPlayRejected(e);
      return;
    }
    p?.catch(onPlayRejected);
  }

  function onPlayRejected(e: unknown): void {
    const name = (e as { name?: string } | null)?.name;
    // AbortError: a newer load/pause interrupted play(); not a failure.
    if (name === "AbortError") return;
    if (name === "NotAllowedError") {
      wantPlaying = false;
      commit();
      return;
    }
    fail(e instanceof Error ? e.message : "play failed");
  }

  function fail(message: string): void {
    errorMsg = message;
    wantPlaying = false;
    clearSchedules();
    emit("error", { shiurId: shiur?.id ?? null, message });
    commit();
  }

  function finish(): void {
    if (!shiur || finished) return;
    finished = true;
    wantPlaying = false;
    clearSchedules();
    stopProgressInterval();
    if (!el.paused) el.pause();
    const id = shiur.id;
    emitProgress("ended");
    if (sleep?.kind === "shiur") {
      sleep = null;
      emit("sleep", { shiurId: id, t: shiur.duration, kind: "shiur" });
    } else {
      emit("ended", { shiurId: id });
    }
    updatePosition();
    commit();
  }

  // ---- scheduling ----------------------------------------------------------------------------
  function clearSchedules(): void {
    boundaryTimer = clearTimer(boundaryTimer);
    skipTimer = clearTimer(skipTimer);
  }

  /** Nearest stop point ahead: moment end or "end of chapter" sleep. */
  function nextStop(): { at: number; why: "moment" | "sleep" } | null {
    let best: { at: number; why: "moment" | "sleep" } | null = null;
    if (momentEnd !== null && !momentEnded) best = { at: momentEnd, why: "moment" };
    if (sleep?.kind === "chapter" && (!best || sleep.at < best.at)) best = { at: sleep.at, why: "sleep" };
    return best;
  }

  function delayTo(target: number, t: number): number {
    return Math.max(MIN_TIMER_MS, ((target - t) / rate) * 1000);
  }

  function rearm(): void {
    clearSchedules();
    if (!shiur || !isAdvancing()) return;
    if (check()) return;
    const t = currentT();
    const stop = nextStop();
    if (stop) boundaryTimer = clock.setTimeout(onTimer, delayTo(stop.at, t));
    const sk = nextSkip(plan, t, suppressed);
    if (sk && (!stop || sk.start < stop.at)) skipTimer = clock.setTimeout(onTimer, delayTo(sk.start, t));
  }

  function onTimer(): void {
    boundaryTimer = null;
    skipTimer = null;
    rearm();
    commit();
  }

  /** Act on whatever is due at the current position. Returns true when it acted. */
  function check(): boolean {
    if (!shiur || finished) return false;
    const t = currentT();
    const stop = nextStop();
    if (stop && t >= stop.at - EPS) {
      stopAt(stop.why);
      return true;
    }
    const sk = skipContaining(plan, t, suppressed);
    if (sk) {
      doSkip(sk, t);
      return true;
    }
    return false;
  }

  function stopAt(why: "moment" | "sleep"): void {
    if (!shiur) return;
    const t = currentT();
    wantPlaying = false;
    clearSchedules();
    if (why === "moment") {
      momentEnded = true;
      el.pause();
      emit("momentend", { shiurId: shiur.id, t });
    } else {
      sleep = null;
      el.pause();
      emit("sleep", { shiurId: shiur.id, t, kind: "chapter" });
    }
    updatePosition();
    commit();
  }

  function doSkip(sk: PlannedSkip, from: number): void {
    if (!shiur) return;
    const stop = nextStop();
    let to = sk.end;
    // Never jump past a stop point: land on it and stop there instead.
    if (stop && stop.at <= to + EPS) to = stop.at;
    const ev: SkipEvent = { shiurId: shiur.id, kind: sk.kind, from, to, seconds: Math.max(0, to - from) };
    lastSkip = ev;
    goTo(to);
    emit("skip", ev);
    if (stop && stop.at <= to + EPS && !finished) {
      stopAt(stop.why);
      return;
    }
    updatePosition();
    rearm();
    commit();
  }

  // ---- progress ------------------------------------------------------------------------------
  function emitProgress(reason: ProgressReason): void {
    if (!shiur) return;
    const t = currentT();
    emit("progress", { shiurId: shiur.id, t, duration: shiur.duration, chapterIndex: chapterIdx(t), reason });
  }

  function startProgressInterval(): void {
    if (progressTimer !== null) return;
    progressTimer = clock.setInterval(() => {
      if (isAdvancing()) emitProgress("interval");
    }, progressMs);
  }

  function stopProgressInterval(): void {
    if (progressTimer !== null) clock.clearInterval(progressTimer);
    progressTimer = null;
  }

  // ---- media element events ------------------------------------------------------------------
  function onMedia(ev: Event): void {
    if (!shiur) return;
    switch (ev.type) {
      case "loadedmetadata":
        if (pendingLocal !== null) {
          const local = pendingLocal;
          pendingLocal = null;
          seekElement(local);
        }
        swapping = false;
        switchPending = false;
        el.playbackRate = rate;
        if (wantPlaying && el.paused) startElement();
        rearm();
        break;
      case "play":
        if (!swapping && !finished) wantPlaying = true;
        rearm();
        break;
      case "playing":
        buffering = false;
        if (!swapping) wantPlaying = true;
        startProgressInterval();
        updatePosition();
        rearm();
        break;
      case "waiting":
        buffering = true;
        break;
      case "pause":
        // Ours: during a src swap, or the element reaching the end of a recording.
        if (swapping || el.ended || finished) break;
        wantPlaying = false;
        clearSchedules();
        stopProgressInterval();
        emitProgress("pause");
        updatePosition();
        break;
      case "seeking":
        clearSchedules();
        break;
      case "seeked":
        // The element is where it was sent (or where it clamped the seek to).
        seekTarget = null;
        updatePosition();
        rearm();
        break;
      case "ratechange":
        if (Math.abs(el.playbackRate - rate) > 1e-9 && !swapping) {
          rate = clampRate(el.playbackRate);
          if (rate !== el.playbackRate) el.playbackRate = rate;
        }
        updatePosition();
        rearm();
        break;
      case "timeupdate":
        // Backstop for the timers.
        if (isAdvancing() && check()) return;
        break;
      case "ended": {
        const next = firstPlayableFrom(recIndex + 1);
        if (next >= 0 && shiur) {
          // Recording boundary: swap src and carry on (goTo restarts the element when wanted).
          goTo(shiur.recordings[next]!.offset);
        } else {
          finish();
          return;
        }
        break;
      }
      case "error": {
        const rec = shiur.recordings[recIndex];
        if (rec?.cleanedUrl && rec.audioUrl && currentSrc === rec.cleanedUrl && rec.cleanedUrl !== rec.audioUrl) {
          // Rule 8: the improved file failed (removed, offline, decode error): play the original of
          // this recording from the same second. The preference stays as it is.
          const t = currentT();
          fellBack.add(rec.id);
          askedCleaned.delete(rec.id);
          if (switchPending) showFallback();
          switchPending = false;
          goTo(t);
          updatePosition();
          break;
        }
        fail("media error");
        return;
      }
    }
    commit();
  }

  for (const type of MEDIA_EVENTS) el.addEventListener(type, onMedia);

  const onPageHide = () => emitProgress("pagehide");
  lifecycle?.addEventListener("pagehide", onPageHide);

  // ---- public API ----------------------------------------------------------------------------
  function userSeek(t: number): void {
    if (!shiur) return;
    const target = Math.min(Math.max(0, Number.isFinite(t) ? t : 0), shiur.duration);
    if (momentEnd !== null && target >= momentEnd - EPS) momentEnd = null;
    momentEnded = false;
    lastSkip = null;
    // Landing inside a skip range by hand means "play this".
    const inside = skipContaining(plan, target, suppressed);
    if (inside) suppressed.add(inside.key);
    navigate(target);
  }

  /** Seek without user-intent side effects (chapter navigation, undo). */
  function navigate(target: number): void {
    if (!shiur) return;
    clearSchedules();
    if (finished && target < shiur.duration - EPS) finished = false;
    goTo(target);
    updatePosition();
    rearm();
    commit();
  }

  function play(): void {
    if (!shiur || unavailable) return;
    if (finished) {
      finished = false;
      momentEnd = null;
      momentEnded = false;
      goTo(0);
    }
    if (momentEnded) {
      // Play after a moment end continues the shiur.
      momentEnded = false;
      momentEnd = null;
    }
    errorMsg = null;
    wantPlaying = true;
    startElement();
    rearm();
    commit();
  }

  function showFallback(): void {
    versionFallback = true;
    fallbackTimer = clearTimer(fallbackTimer);
    fallbackTimer = clock.setTimeout(() => {
      fallbackTimer = null;
      versionFallback = false;
      commit();
    }, VERSION_FALLBACK_NOTICE_MS);
  }

  function clearFallback(): void {
    fallbackTimer = clearTimer(fallbackTimer);
    versionFallback = false;
  }

  function pause(): void {
    if (!shiur) return;
    wantPlaying = false;
    clearSchedules();
    if (!el.paused) el.pause();
    commit();
  }

  const engine: PlayerEngine = {
    audio: el,
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    on(type, fn) {
      let set = handlers[type] as Set<typeof fn> | undefined;
      if (!set) {
        set = new Set();
        (handlers as Record<string, unknown>)[type] = set;
      }
      set.add(fn);
      return () => {
        set.delete(fn);
      };
    },
    load(next, opts: LoadOptions = {}) {
      if (shiur) emitProgress("unload");
      clearSchedules();
      stopProgressInterval();
      shiur = next;
      recIndex = -1;
      currentSrc = null;
      pendingLocal = null;
      seekTarget = null;
      swapping = false;
      buffering = false;
      finished = false;
      unavailable = false;
      errorMsg = null;
      lastSkip = null;
      suppressed.clear();
      fellBack.clear();
      askedCleaned.clear();
      switchPending = false;
      clearFallback();
      plan = planSkips(next.notes?.skip ?? [], skipSettings, next.duration);
      momentEnd = opts.end !== undefined && Number.isFinite(opts.end) ? opts.end : null;
      momentEnded = false;
      if (sleep?.kind === "chapter") sleep = null;
      if (!readingLangExplicit) readingLang = next.lang;
      wantPlaying = opts.autoplay === true;
      media?.resetMetadataCache();
      if (!el.paused) el.pause();
      const start = Math.min(Math.max(0, opts.start ?? 0), next.duration);
      const inside = skipContaining(plan, start, suppressed);
      if (inside) suppressed.add(inside.key);
      if (momentEnd !== null && momentEnd <= start + EPS) momentEnd = null;
      goTo(start);
      if (recIndex < 0) recIndex = 0;
      updateMetadata();
      updatePosition();
      commit();
    },
    play,
    pause,
    toggle() {
      if (wantPlaying) pause();
      else play();
    },
    seek: userSeek,
    seekBy(delta) {
      userSeek(currentT() + delta);
    },
    nextChapter() {
      if (!shiur) return;
      const target = nextChapterTarget(chaptersOf(shiur), currentT(), plan, suppressed);
      if (target === null) {
        finish();
        return;
      }
      if (momentEnd !== null && target >= momentEnd - EPS) momentEnd = null;
      momentEnded = false;
      navigate(target);
    },
    prevChapter() {
      if (!shiur) return;
      const target = prevChapterTarget(chaptersOf(shiur), currentT(), plan, suppressed);
      momentEnded = false;
      navigate(target);
    },
    setRate(r) {
      rate = clampRate(r);
      el.defaultPlaybackRate = rate;
      el.playbackRate = rate;
      updatePosition();
      rearm();
      commit();
    },
    setSkipSettings(s) {
      skipSettings = { ...skipSettings, ...s };
      if (shiur) plan = planSkips(shiur.notes?.skip ?? [], skipSettings, shiur.duration);
      rearm();
      commit();
    },
    undoSkip() {
      if (!shiur || !lastSkip || lastSkip.shiurId !== shiur.id) return;
      const ev = lastSkip;
      const p = skipContaining(plan, ev.to - EPS * 2, new Set()) ?? skipContaining(plan, ev.from, new Set());
      if (p) suppressed.add(p.key);
      lastSkip = null;
      emit("skipundo", ev);
      navigate(ev.from);
    },
    keepListening() {
      if (!shiur) return;
      momentEnd = null;
      momentEnded = false;
      play();
    },
    setSleepTimer(spec: SleepSpec | null) {
      sleepTimer = clearTimer(sleepTimer);
      if (!spec) {
        sleep = null;
      } else if (spec.kind === "minutes") {
        const ms = Math.max(0, spec.minutes) * 60_000;
        sleep = { kind: "minutes", endsAt: clock.now() + ms };
        sleepTimer = clock.setTimeout(() => {
          sleepTimer = null;
          sleep = null;
          wantPlaying = false;
          clearSchedules();
          if (!el.paused) el.pause();
          emit("sleep", { shiurId: shiur?.id ?? null, t: currentT(), kind: "minutes" });
          commit();
        }, ms);
      } else if (spec.kind === "chapter") {
        if (!shiur) {
          sleep = null;
        } else {
          const chapters = chaptersOf(shiur);
          const ch = chapters[chapterIdx(currentT())];
          sleep = { kind: "chapter", at: ch ? ch.end : shiur.duration };
        }
      } else {
        sleep = { kind: "shiur" };
      }
      rearm();
      commit();
    },
    setReadingLanguage(lang) {
      readingLang = lang;
      readingLangExplicit = true;
      updateMetadata();
      commit();
    },
    setAudioVersion(version) {
      audioVersion = version;
      clearFallback();
      if (!shiur) {
        commit();
        return;
      }
      const rec = shiur.recordings[recIndex];
      if (rec && version === "cleaned") {
        fellBack.delete(rec.id);
        askedCleaned.add(rec.id);
      }
      // Other recordings of the shiur follow the new choice at their next swap.
      for (const r of shiur.recordings) if (r !== rec) fellBack.delete(r.id);
      if (finished || unavailable) {
        commit();
        return;
      }
      const before = currentSrc;
      const t = currentT();
      clearSchedules();
      goTo(t);
      switchPending = version === "cleaned" && currentSrc !== before;
      updatePosition();
      rearm();
      commit();
    },
    flushProgress(reason = "pagehide") {
      emitProgress(reason);
    },
    destroy() {
      clearSchedules();
      sleepTimer = clearTimer(sleepTimer);
      fallbackTimer = clearTimer(fallbackTimer);
      stopProgressInterval();
      for (const type of MEDIA_EVENTS) el.removeEventListener(type, onMedia);
      lifecycle?.removeEventListener("pagehide", onPageHide);
      media?.detach();
      if (!el.paused) el.pause();
      listeners.clear();
      for (const k of Object.keys(handlers)) delete (handlers as Record<string, unknown>)[k];
    },
  };

  media?.attach({
    play,
    pause,
    previous: () => engine.prevChapter(),
    next: () => engine.nextChapter(),
    seekBy: (d) => engine.seekBy(d),
    seekTo: (t) => userSeek(t),
  });

  return engine;
}
