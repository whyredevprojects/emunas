/**
 * Test doubles: a manual clock and a fake media element whose currentTime advances with the clock
 * at its playbackRate. Media events are queued as 0 ms tasks like the browser's task queue, and the
 * element fires `timeupdate` every 250 ms while playing, `pause` + `ended` at the end of its media.
 */
import type { Clock, LifecycleTarget, MediaElementLike, MediaSessionEnv, MediaSessionLike, MetadataInit } from "../types.ts";

interface Timer {
  id: number;
  due: number;
  fn: () => void;
  every: number | null;
}

const FRAME_MS = 250;

export class FakeClock implements Clock {
  nowMs = 0;
  private timers = new Map<number, Timer>();
  private nextId = 1;
  private lastFrame = 0;
  readonly media: FakeAudio[] = [];

  now(): number {
    return this.nowMs;
  }
  setTimeout(fn: () => void, ms: number): number {
    const id = this.nextId++;
    this.timers.set(id, { id, due: this.nowMs + Math.max(0, ms), fn, every: null });
    return id;
  }
  clearTimeout(h: unknown): void {
    this.timers.delete(h as number);
  }
  setInterval(fn: () => void, ms: number): number {
    const id = this.nextId++;
    this.timers.set(id, { id, due: this.nowMs + ms, fn, every: ms });
    return id;
  }
  clearInterval(h: unknown): void {
    this.timers.delete(h as number);
  }

  /** Advance wall time by `ms`, running timers, media progress and media events in order. */
  tick(ms: number): void {
    const target = this.nowMs + ms;
    for (let guard = 0; guard < 1_000_000; guard++) {
      let step = target;
      for (const t of this.timers.values()) step = Math.min(step, t.due);
      const frame = this.lastFrame + FRAME_MS;
      step = Math.min(step, frame);
      for (const m of this.media) {
        const end = m.msToEnd();
        if (end !== null) step = Math.min(step, this.nowMs + end);
      }
      const dt = step - this.nowMs;
      for (const m of this.media) m.advance(dt);
      this.nowMs = step;
      if (step >= frame) {
        this.lastFrame = frame;
        for (const m of this.media) m.frame();
      }
      for (const m of this.media) m.checkEnd();
      const due = [...this.timers.values()].filter((t) => t.due <= this.nowMs).sort((a, b) => a.due - b.due || a.id - b.id);
      for (const t of due) {
        if (!this.timers.has(t.id)) continue;
        if (t.every !== null) t.due += t.every;
        else this.timers.delete(t.id);
        t.fn();
      }
      const stillDue = [...this.timers.values()].some((t) => t.due <= this.nowMs);
      if (this.nowMs >= target && !stillDue) return;
    }
    throw new Error("FakeClock: runaway timers");
  }

  /** Run 0 ms tasks (queued media events). */
  flush(): void {
    this.tick(0);
  }
}

export class FakeAudio implements MediaElementLike {
  private _src = "";
  private _currentTime = 0;
  private _rate = 1;
  defaultPlaybackRate = 1;
  preload = "";
  paused = true;
  ended = false;
  readyState = 0;
  mediaDuration = NaN;
  /**
   * WebKit's behaviour: a seek is applied when the element gets to it, so reading `currentTime` right
   * after setting it still returns the old position (until `seeked`). Off: the spec's behaviour.
   */
  seekLag = false;
  private seeks = 0;
  readonly srcHistory: string[] = [];
  readonly log: string[] = [];
  private listeners = new Map<string, Set<(ev: Event) => void>>();

  constructor(
    private readonly clock: FakeClock,
    /** src → real media length in seconds; unknown src fires `error`. */
    private readonly durations: Record<string, number>,
  ) {
    clock.media.push(this);
  }

  get src(): string {
    return this._src;
  }
  set src(v: string) {
    this._src = v;
    this.srcHistory.push(v);
    // Media element load algorithm: paused becomes true without a pause event.
    this.paused = true;
    this.ended = false;
    this.readyState = 0;
    this._currentTime = 0;
    this.mediaDuration = NaN;
    const want = this.durations[v];
    this.queue(() => {
      if (this._src !== v) return;
      if (want === undefined) {
        this.fire("error");
        return;
      }
      this.mediaDuration = want;
      this.readyState = 4;
      this.fire("loadedmetadata");
      this.fire("canplay");
      if (!this.paused) this.fire("playing");
    });
  }

  get currentTime(): number {
    return this._currentTime;
  }
  set currentTime(v: number) {
    const max = Number.isFinite(this.mediaDuration) ? this.mediaDuration : Infinity;
    const target = Math.min(Math.max(0, v), max);
    this.ended = false;
    if (!this.seekLag) this._currentTime = target;
    this.queue(() => this.fire("seeking"));
    const src = this._src;
    const seek = ++this.seeks;
    this.queue(() => {
      if (this.seekLag) {
        // A newer seek or a new src aborts this one, as in the browser.
        if (this._src !== src || seek !== this.seeks) return;
        this._currentTime = target;
      }
      this.fire("seeked");
    });
  }

  get playbackRate(): number {
    return this._rate;
  }
  set playbackRate(v: number) {
    if (v === this._rate) return;
    this._rate = v;
    this.queue(() => this.fire("ratechange"));
  }

  play(): Promise<void> {
    if (this.paused) {
      this.paused = false;
      if (this.ended) {
        this.ended = false;
        this._currentTime = 0;
      }
      this.queue(() => {
        this.fire("play");
        if (this.readyState >= 3 && !this.paused) this.fire("playing");
      });
    }
    return Promise.resolve();
  }

  pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.queue(() => {
      this.fire("timeupdate");
      this.fire("pause");
    });
  }

  addEventListener(type: string, l: (ev: Event) => void): void {
    let s = this.listeners.get(type);
    if (!s) this.listeners.set(type, (s = new Set()));
    s.add(l);
  }
  removeEventListener(type: string, l: (ev: Event) => void): void {
    this.listeners.get(type)?.delete(l);
  }

  listenerCount(): number {
    let n = 0;
    for (const s of this.listeners.values()) n += s.size;
    return n;
  }

  // ---- clock hooks ----
  private advancing(): boolean {
    return !this.paused && this.readyState >= 1 && Number.isFinite(this.mediaDuration);
  }
  msToEnd(): number | null {
    if (!this.advancing()) return null;
    return Math.max(0, ((this.mediaDuration - this._currentTime) / this._rate) * 1000);
  }
  advance(dtMs: number): void {
    if (!this.advancing() || dtMs <= 0) return;
    this._currentTime = Math.min(this.mediaDuration, this._currentTime + (dtMs / 1000) * this._rate);
  }
  frame(): void {
    if (this.advancing()) this.fire("timeupdate");
  }
  checkEnd(): void {
    if (this.advancing() && this._currentTime >= this.mediaDuration - 1e-9) {
      this.paused = true;
      this.ended = true;
      this.fire("timeupdate");
      this.fire("pause");
      this.fire("ended");
    }
  }

  private queue(fn: () => void): void {
    this.clock.setTimeout(fn, 0);
  }
  fire(type: string): void {
    this.log.push(type);
    const ev = { type } as Event;
    for (const l of [...(this.listeners.get(type) ?? [])]) l(ev);
  }
}

export class FakeLifecycle implements LifecycleTarget {
  private ls = new Map<string, Set<(ev: Event) => void>>();
  addEventListener(type: string, l: (ev: Event) => void): void {
    let s = this.ls.get(type);
    if (!s) this.ls.set(type, (s = new Set()));
    s.add(l);
  }
  removeEventListener(type: string, l: (ev: Event) => void): void {
    this.ls.get(type)?.delete(l);
  }
  dispatch(type: string): void {
    for (const l of [...(this.ls.get(type) ?? [])]) l({ type } as Event);
  }
}

export class FakeMetadata {
  constructor(readonly init: MetadataInit) {}
}

export function fakeMediaSession(): {
  env: MediaSessionEnv;
  session: MediaSessionLike & { handlers: Map<string, MediaSessionActionHandler>; positions: MediaPositionState[] };
  metadata(): MetadataInit | null;
} {
  const handlers = new Map<string, MediaSessionActionHandler>();
  const positions: MediaPositionState[] = [];
  const session = {
    metadata: null as MediaMetadata | null,
    playbackState: "none" as MediaSessionPlaybackState,
    handlers,
    positions,
    setActionHandler(action: MediaSessionAction, handler: MediaSessionActionHandler | null) {
      if (handler) handlers.set(action, handler);
      else handlers.delete(action);
    },
    setPositionState(s?: MediaPositionState) {
      if (s && s.position !== undefined && s.duration !== undefined && s.position > s.duration) {
        throw new TypeError("position > duration");
      }
      if (s) positions.push(s);
    },
  };
  const env: MediaSessionEnv = {
    session,
    Metadata: FakeMetadata as unknown as MediaSessionEnv["Metadata"],
  };
  return {
    env,
    session,
    metadata: () => (session.metadata ? (session.metadata as unknown as FakeMetadata).init : null),
  };
}
