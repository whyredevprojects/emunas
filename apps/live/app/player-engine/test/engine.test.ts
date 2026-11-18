import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PublicShiur } from "@emunas/corpus/public";
import { describe, expect, it } from "vitest";
import golden from "../../../../../packages/corpus/test/fixtures/golden/yi-zmanim-tv-bb-04.json" with { type: "json" };
import { createPlayerEngine } from "../engine.ts";
import type {
  MediaElementLike,
  MediaSessionLike,
  PlayerEngineOptions,
  PlayerEvents,
  PlayerShiur,
} from "../types.ts";
import { FakeAudio, FakeClock, FakeLifecycle, fakeMediaSession } from "./fakes.ts";

const A = "https://media.example.org/shiurim/a.mp3";
const B = "https://media.example.org/shiurim/b.mp3";

const l = (s: string) => ({ en: `${s} (en)`, yi: `${s} (yi)` });

/** Two recordings: A 0–100, B 100–160. */
function twoRecordings(over: Partial<PlayerShiur> = {}): PlayerShiur {
  return {
    id: "yi-test-01",
    lang: "yi",
    duration: 160,
    catalog: { titleOriginal: "Catalog title" },
    recordings: [
      { id: "a", offset: 0, duration: 100, audioUrl: A, cleanedUrl: null },
      { id: "b", offset: 100, duration: 60, audioUrl: B, cleanedUrl: null },
    ],
    notes: {
      chapters: [
        { idx: 0, t: 0, end: 30, title: l("Opening") },
        { idx: 1, t: 30, end: 60, title: l("Niggun") },
        { idx: 2, t: 60, end: 100, title: l("Middle") },
        { idx: 3, t: 100, end: 130, title: l("Second tape") },
        { idx: 4, t: 130, end: 160, title: l("Closing") },
      ],
      skip: [
        [30, 60, "singing"],
        [70, 75, "noise"], // shorter than 20 s: played
        [92, 125, "other_speaker"], // crosses the recording boundary
      ],
    },
    ...over,
  };
}

function setup(shiur: PlayerShiur = twoRecordings(), opts: PlayerEngineOptions = {}) {
  const clock = new FakeClock();
  const durations: Record<string, number> = {};
  for (const r of shiur.recordings) {
    if (r.audioUrl) durations[r.audioUrl] = r.duration;
    if (r.cleanedUrl) durations[r.cleanedUrl] = r.duration;
  }
  const audio = new FakeAudio(clock, durations);
  const lifecycle = new FakeLifecycle();
  const ms = fakeMediaSession();
  const engine = createPlayerEngine({ audio, clock, lifecycle, mediaSession: ms.env, ...opts });
  const events: { [K in keyof PlayerEvents]: PlayerEvents[K][] } = {
    skip: [],
    skipundo: [],
    momentend: [],
    ended: [],
    sleep: [],
    progress: [],
    error: [],
  };
  for (const k of Object.keys(events) as (keyof PlayerEvents)[]) {
    engine.on(k, (ev: unknown) => {
      (events[k] as unknown[]).push(ev);
    });
  }
  return { clock, audio, lifecycle, ms, engine, events, shiur };
}

describe("global timeline across recordings", () => {
  it("maps global seconds to the right recording and local time", () => {
    const { clock, audio, engine } = setup();
    engine.load(twoRecordings(), { start: 110 });
    clock.flush();
    expect(audio.src).toBe(B);
    expect(audio.currentTime).toBeCloseTo(10, 6);
    expect(engine.getState()).toMatchObject({ t: 110, recordingIndex: 1, recordingId: "b", chapterIndex: 3 });

    engine.seek(20);
    clock.flush();
    expect(audio.src).toBe(A);
    expect(audio.currentTime).toBeCloseTo(20, 6);
    expect(engine.getState()).toMatchObject({ t: 20, recordingIndex: 0, chapterIndex: 0 });

    // A boundary belongs to the later recording.
    engine.seek(100);
    clock.flush();
    expect(audio.src).toBe(B);
    expect(audio.currentTime).toBe(0);
    expect(engine.getState().t).toBe(100);
  });

  it("seeks within the same recording without reloading", () => {
    const { clock, audio, engine } = setup();
    engine.load(twoRecordings(), { start: 5 });
    clock.flush();
    engine.seek(25);
    clock.flush();
    expect(audio.srcHistory).toEqual([A]);
    expect(audio.currentTime).toBe(25);
  });

  it("swaps src at the recording boundary and keeps playing on one timeline", () => {
    const { clock, audio, engine } = setup(twoRecordings(), { skip: { enabled: false } });
    engine.load(twoRecordings(), { start: 80, autoplay: true });
    clock.flush();
    expect(engine.getState().status).toBe("playing");
    let last = engine.getState().t;
    for (let i = 0; i < 25; i++) {
      clock.tick(1000);
      const t = engine.getState().t;
      expect(t).toBeGreaterThanOrEqual(last);
      last = t;
    }
    expect(audio.srcHistory).toEqual([A, B]);
    const s = engine.getState();
    expect(s.recordingId).toBe("b");
    expect(s.status).toBe("playing");
    expect(s.t).toBeGreaterThan(104);
    expect(s.t).toBeLessThan(106);
    expect(audio.paused).toBe(false);
  });

  it("plays the last recording to the end and reports ended once", () => {
    const { clock, engine, events } = setup(twoRecordings(), { skip: { enabled: false } });
    engine.load(twoRecordings(), { start: 150, autoplay: true });
    clock.tick(12_000);
    expect(engine.getState()).toMatchObject({ status: "ended", t: 160 });
    expect(events.ended).toEqual([{ shiurId: "yi-test-01" }]);
    expect(events.progress.at(-1)?.reason).toBe("ended");
  });

  it("restarts from the top on play after the end", () => {
    const { clock, audio, engine } = setup(twoRecordings(), { skip: { enabled: false } });
    engine.load(twoRecordings(), { start: 158, autoplay: true });
    clock.tick(3000);
    expect(engine.getState().status).toBe("ended");
    engine.play();
    clock.tick(1000);
    expect(audio.src).toBe(A);
    expect(engine.getState().status).toBe("playing");
    expect(engine.getState().t).toBeCloseTo(1, 1);
  });
});

describe("skip rules", () => {
  it.each([1, 1.5, 2])("skips the singing range exactly when it starts at %s×", (rate) => {
    const { clock, engine, events } = setup();
    engine.setRate(rate);
    engine.load(twoRecordings(), { start: 20, autoplay: true });
    clock.flush();
    const due = ((30 - 20) / rate) * 1000;
    clock.tick(due - 5);
    expect(events.skip).toHaveLength(0);
    expect(engine.getState().t).toBeLessThan(30);
    clock.tick(10);
    expect(events.skip).toHaveLength(1);
    const ev = events.skip[0]!;
    expect(ev.kind).toBe("singing");
    expect(ev.from).toBeCloseTo(30, 2);
    expect(ev.to).toBe(60);
    expect(ev.seconds).toBeCloseTo(30, 2);
    expect(engine.getState().lastSkip).toEqual(ev);
    clock.flush();
    expect(engine.getState().t).toBeGreaterThanOrEqual(60);
    expect(engine.getState().t).toBeLessThan(60.1);
  });

  it("skips once when the element applies the seek later (WebKit: currentTime lags until seeked)", () => {
    const { clock, audio, engine, events } = setup();
    audio.seekLag = true;
    engine.load(twoRecordings(), { start: 20, autoplay: true });
    clock.flush();
    // Reaching the singing range: the skip's seek is not visible on the element yet. The engine must
    // not take the old position for "still inside the range" and skip again (it recursed until the
    // call stack overflowed).
    clock.tick(10_005);
    expect(events.skip).toHaveLength(1);
    expect(events.skip[0]).toMatchObject({ kind: "singing", to: 60 });
    expect(engine.getState().t).toBeCloseTo(60, 1);
    clock.flush();
    expect(events.skip).toHaveLength(1);
    expect(engine.getState().t).toBeGreaterThanOrEqual(60);
    expect(engine.getState().t).toBeLessThan(60.1);
    expect(engine.getState().status).toBe("playing");
  });

  it("re-arms the skip timer when the rate changes mid-way", () => {
    const { clock, engine, events } = setup();
    engine.load(twoRecordings(), { start: 20, autoplay: true });
    clock.flush();
    clock.tick(4000); // t = 24
    engine.setRate(2);
    clock.flush();
    clock.tick(2990); // 6 s of media at 2× = 3000 ms
    expect(events.skip).toHaveLength(0);
    clock.tick(15);
    expect(events.skip).toHaveLength(1);
    expect(events.skip[0]!.from).toBeCloseTo(30, 1);
  });

  it("re-arms on seek: seeking closer to the range brings the skip forward", () => {
    const { clock, engine, events } = setup();
    engine.load(twoRecordings(), { start: 0, autoplay: true });
    clock.flush();
    engine.seek(28);
    clock.flush();
    clock.tick(2010);
    expect(events.skip).toHaveLength(1);
    expect(events.skip[0]!.from).toBeCloseTo(30, 1);
  });

  it("plays ranges shorter than the minimum", () => {
    const { clock, engine, events } = setup();
    engine.load(twoRecordings(), { start: 65, autoplay: true });
    clock.tick(15_000);
    expect(events.skip).toHaveLength(0);
    expect(engine.getState().t).toBeCloseTo(80, 1);
  });

  it("skips across a recording boundary", () => {
    const { clock, audio, engine, events } = setup();
    engine.load(twoRecordings(), { start: 85, autoplay: true });
    clock.tick(7010);
    expect(events.skip).toHaveLength(1);
    expect(events.skip[0]).toMatchObject({ kind: "other_speaker", to: 125 });
    clock.flush();
    expect(audio.src).toBe(B);
    expect(audio.currentTime).toBeCloseTo(25, 1);
    expect(engine.getState()).toMatchObject({ recordingId: "b", status: "playing" });
    clock.tick(1000);
    expect(engine.getState().t).toBeCloseTo(126, 1);
  });

  it("undo returns to where the skip happened and plays the range", () => {
    const { clock, engine, events } = setup();
    engine.load(twoRecordings(), { start: 25, autoplay: true });
    clock.tick(5010);
    expect(events.skip).toHaveLength(1);
    engine.undoSkip();
    clock.flush();
    expect(events.skipundo).toHaveLength(1);
    expect(engine.getState().lastSkip).toBeNull();
    expect(engine.getState().t).toBeCloseTo(30, 1);
    clock.tick(10_000);
    expect(events.skip).toHaveLength(1);
    expect(engine.getState().t).toBeCloseTo(40, 1);
  });

  it("does not skip a range the user seeks into", () => {
    const { clock, engine, events } = setup();
    engine.load(twoRecordings(), { start: 0, autoplay: true });
    clock.flush();
    engine.seek(45);
    clock.tick(5000);
    expect(events.skip).toHaveLength(0);
    expect(engine.getState().t).toBeCloseTo(50, 1);
  });

  it("follows the skip settings", () => {
    const { clock, engine, events } = setup();
    engine.setSkipSettings({ kinds: ["noise"] });
    engine.load(twoRecordings(), { start: 25, autoplay: true });
    clock.tick(10_000);
    expect(events.skip).toHaveLength(0);
    expect(engine.getState().t).toBeCloseTo(35, 1);
    // Turning singing on while inside a singing range skips the rest of it at once.
    engine.setSkipSettings({ kinds: ["singing"] });
    expect(events.skip).toHaveLength(1);
    expect(events.skip[0]).toMatchObject({ kind: "singing", to: 60 });
    expect(events.skip[0]!.from).toBeCloseTo(35, 1);
  });

  it("skips the real fixture's noise chapter at 1.5×", () => {
    const real = golden as unknown as PublicShiur;
    const shiur: PlayerShiur = {
      ...real,
      recordings: real.recordings.map((r) => ({ ...r, audioUrl: `https://media.example.org/${r.id}.mp3`, cleanedUrl: null })),
    };
    const { clock, engine, events } = setup(shiur);
    engine.setRate(1.5);
    engine.load(shiur, { start: 570, autoplay: true });
    clock.flush();
    clock.tick((582.12 - 570) / 1.5 * 1000 - 10);
    expect(events.skip).toHaveLength(0);
    clock.tick(20);
    expect(events.skip[0]).toMatchObject({ kind: "noise", to: 795.79 });
    expect(events.skip[0]!.from).toBeCloseTo(582.12, 1);
  });
});

describe("moments", () => {
  it("pauses at the moment end and offers keep listening", () => {
    const { clock, engine, events } = setup();
    engine.load(twoRecordings(), { start: 100, end: 115, autoplay: true });
    clock.tick(14_990);
    expect(events.momentend).toHaveLength(0);
    clock.tick(20);
    expect(events.momentend).toHaveLength(1);
    expect(events.momentend[0]!.t).toBeCloseTo(115, 1);
    clock.flush();
    expect(engine.getState()).toMatchObject({ status: "paused", momentEnded: true, momentEnd: 115 });
    expect(events.progress.at(-1)?.reason).toBe("pause");

    engine.keepListening();
    clock.tick(5000);
    expect(engine.getState()).toMatchObject({ status: "playing", momentEnded: false, momentEnd: null });
    expect(engine.getState().t).toBeCloseTo(120, 1);
  });

  it("pauses at the moment end across a recording swap", () => {
    const { clock, engine, events } = setup(twoRecordings(), { skip: { enabled: false } });
    engine.load(twoRecordings(), { start: 95, end: 103, autoplay: true });
    clock.tick(9000);
    expect(events.momentend).toHaveLength(1);
    expect(events.momentend[0]!.t).toBeCloseTo(103, 1);
    expect(engine.getState().recordingId).toBe("b");
  });

  it("a skip never jumps past the moment end", () => {
    const { clock, engine, events } = setup();
    engine.load(twoRecordings(), { start: 20, end: 45, autoplay: true });
    clock.tick(10_010);
    expect(events.skip[0]).toMatchObject({ to: 45 });
    expect(events.momentend).toHaveLength(1);
    clock.flush();
    expect(engine.getState()).toMatchObject({ status: "paused", t: 45 });
  });

  it("seeking past the moment end drops it", () => {
    const { clock, engine, events } = setup();
    engine.load(twoRecordings(), { start: 0, end: 10, autoplay: true });
    clock.flush();
    engine.seek(12);
    clock.tick(5000);
    expect(events.momentend).toHaveLength(0);
    expect(engine.getState().momentEnd).toBeNull();
  });
});

describe("chapters", () => {
  it("previous restarts the chapter after 3 s, else goes to the previous chapter", () => {
    const { clock, engine } = setup();
    engine.load(twoRecordings(), { start: 105 });
    clock.flush();
    engine.prevChapter();
    clock.flush();
    expect(engine.getState().t).toBe(100);

    engine.seek(102);
    engine.prevChapter();
    clock.flush();
    expect(engine.getState().t).toBe(60);
    expect(engine.getState().recordingId).toBe("a");

    // Exactly 3 s in is not "more than 3 s".
    engine.seek(103);
    engine.prevChapter();
    expect(engine.getState().t).toBe(60);
  });

  it("navigation passes over chapters that are skipped entirely", () => {
    const { clock, engine } = setup();
    engine.load(twoRecordings(), { start: 10 });
    clock.flush();
    engine.nextChapter();
    expect(engine.getState().t).toBe(60);
    engine.seek(61);
    engine.prevChapter();
    expect(engine.getState().t).toBe(0);
  });

  it("next on the last chapter ends the shiur", () => {
    const { clock, engine, events } = setup();
    engine.load(twoRecordings(), { start: 140, autoplay: true });
    clock.flush();
    engine.nextChapter();
    expect(engine.getState().status).toBe("ended");
    expect(events.ended).toHaveLength(1);
  });

  it("a catalog-only shiur (no chapters) still plays and navigates", () => {
    const shiur = twoRecordings();
    delete shiur.notes;
    const { clock, engine } = setup(shiur);
    engine.load(shiur, { start: 50, autoplay: true });
    clock.tick(1000);
    expect(engine.getState()).toMatchObject({ chapterIndex: -1, status: "playing" });
    engine.prevChapter();
    expect(engine.getState().t).toBe(0);
  });
});

describe("speed, sleep, availability", () => {
  it("clamps speed to 0.75–2", () => {
    const { engine, audio } = setup();
    engine.load(twoRecordings());
    engine.setRate(3);
    expect(engine.getState().rate).toBe(2);
    expect(audio.playbackRate).toBe(2);
    engine.setRate(0.5);
    expect(engine.getState().rate).toBe(0.75);
    expect(audio.defaultPlaybackRate).toBe(0.75);
  });

  it("keeps the rate across a recording swap", () => {
    const { clock, audio, engine } = setup(twoRecordings(), { skip: { enabled: false } });
    engine.setRate(1.5);
    engine.load(twoRecordings(), { start: 98, autoplay: true });
    clock.tick(3000);
    expect(audio.src).toBe(B);
    expect(audio.playbackRate).toBe(1.5);
    expect(engine.getState().t).toBeCloseTo(102.5, 1);
  });

  it("sleep timer: N minutes", () => {
    const { clock, engine, events } = setup(twoRecordings(), { skip: { enabled: false } });
    engine.load(twoRecordings(), { autoplay: true });
    engine.setSleepTimer({ kind: "minutes", minutes: 1 });
    expect(engine.getState().sleep).toEqual({ kind: "minutes", endsAt: 60_000 });
    clock.tick(59_000);
    expect(engine.getState().status).toBe("playing");
    clock.tick(1001);
    clock.flush();
    expect(events.sleep).toHaveLength(1);
    expect(engine.getState()).toMatchObject({ status: "paused", sleep: null });
  });

  it("sleep timer: end of chapter", () => {
    const { clock, engine, events } = setup();
    engine.load(twoRecordings(), { start: 100, autoplay: true });
    clock.flush();
    engine.setSleepTimer({ kind: "chapter" });
    expect(engine.getState().sleep).toEqual({ kind: "chapter", at: 130 });
    clock.tick(31_000);
    expect(events.sleep).toMatchObject([{ kind: "chapter" }]);
    expect(events.sleep[0]!.t).toBeCloseTo(130, 1);
    expect(engine.getState().status).toBe("paused");
  });

  it("sleep timer: end of shiur stops without an ended event", () => {
    const { clock, engine, events } = setup(twoRecordings(), { skip: { enabled: false } });
    engine.load(twoRecordings(), { start: 155, autoplay: true });
    engine.setSleepTimer({ kind: "shiur" });
    clock.tick(6000);
    expect(events.sleep).toMatchObject([{ kind: "shiur" }]);
    expect(events.ended).toHaveLength(0);
  });

  it("marks a shiur without playable audio unavailable", () => {
    const shiur = twoRecordings({
      recordings: [
        { id: "a", offset: 0, duration: 100, audioUrl: null, cleanedUrl: null },
        { id: "b", offset: 100, duration: 60, audioUrl: null, cleanedUrl: null },
      ],
    });
    const { engine, audio } = setup(shiur);
    engine.load(shiur, { autoplay: true });
    expect(engine.getState().status).toBe("unavailable");
    expect(audio.srcHistory).toEqual([]);
  });

  it("ends after the last playable recording when a later one is unavailable", () => {
    const shiur = twoRecordings({
      recordings: [
        { id: "a", offset: 0, duration: 100, audioUrl: A, cleanedUrl: null },
        { id: "b", offset: 100, duration: 60, audioUrl: null, cleanedUrl: null },
      ],
    });
    const { clock, engine, events } = setup(shiur, { skip: { enabled: false } });
    engine.load(shiur, { start: 95, autoplay: true });
    clock.tick(6000);
    expect(events.ended).toHaveLength(1);
  });

  it("reports a media error", () => {
    const { clock, engine, events } = setup();
    const shiur = twoRecordings({
      recordings: [{ id: "a", offset: 0, duration: 160, audioUrl: "https://media.example.org/missing.mp3", cleanedUrl: null }],
    });
    engine.load(shiur, { autoplay: true });
    clock.flush();
    expect(engine.getState().status).toBe("error");
    expect(events.error).toHaveLength(1);
  });
});

describe("progress", () => {
  it("reports every 5 s while playing, on pause and on pagehide", () => {
    const { clock, engine, lifecycle, events } = setup(twoRecordings(), { skip: { enabled: false } });
    engine.load(twoRecordings(), { autoplay: true });
    clock.tick(12_000);
    expect(events.progress.map((p) => p.reason)).toEqual(["interval", "interval"]);
    expect(events.progress[0]!.t).toBeCloseTo(5, 1);
    expect(events.progress[1]!.t).toBeCloseTo(10, 1);
    engine.pause();
    clock.flush();
    expect(events.progress.at(-1)).toMatchObject({ reason: "pause", shiurId: "yi-test-01", duration: 160 });
    expect(events.progress.at(-1)!.t).toBeCloseTo(12, 1);
    clock.tick(20_000);
    expect(events.progress).toHaveLength(3);
    lifecycle.dispatch("pagehide");
    expect(events.progress.at(-1)?.reason).toBe("pagehide");
  });

  it("reports the old shiur when another one is loaded", () => {
    const { clock, engine, events } = setup();
    engine.load(twoRecordings(), { start: 10, autoplay: true });
    clock.tick(1000);
    engine.load(twoRecordings({ id: "yi-test-02" }));
    expect(events.progress.at(-1)).toMatchObject({ shiurId: "yi-test-01", reason: "unload" });
  });
});

describe("Media Session", () => {
  it("sets metadata, position and handlers; prev/next are chapters", () => {
    const { clock, engine, ms } = setup();
    engine.load(twoRecordings(), { start: 5, autoplay: true });
    clock.flush();
    expect(ms.metadata()).toMatchObject({
      title: "Opening (yi)",
      artist: expect.stringContaining("זצ"),
      album: "Catalog title",
    });
    expect(ms.metadata()?.chapterInfo).toHaveLength(5);
    expect(ms.session.playbackState).toBe("playing");
    expect(ms.session.positions.at(-1)).toMatchObject({ duration: 160, playbackRate: 1 });

    for (const a of ["play", "pause", "previoustrack", "nexttrack", "seekbackward", "seekforward", "seekto"]) {
      expect(ms.session.handlers.has(a)).toBe(true);
    }
    const call = (action: MediaSessionAction, extra: Partial<MediaSessionActionDetails> = {}) =>
      ms.session.handlers.get(action)!({ action, ...extra });

    call("nexttrack");
    expect(engine.getState().t).toBe(60);
    clock.flush();
    expect(ms.metadata()?.title).toBe("Middle (yi)");
    call("seekforward");
    expect(engine.getState().t).toBe(75);
    call("seekbackward", { seekOffset: 10 });
    expect(engine.getState().t).toBe(65);
    call("seekto", { seekTime: 110 });
    clock.flush();
    expect(engine.getState()).toMatchObject({ t: 110, recordingId: "b" });
    expect(ms.session.positions.at(-1)).toMatchObject({ position: 110 });
    call("previoustrack");
    expect(engine.getState().t).toBe(100);
    call("pause");
    clock.flush();
    expect(engine.getState().status).toBe("paused");
    expect(ms.session.playbackState).toBe("paused");

    engine.setReadingLanguage("en");
    expect(ms.metadata()).toMatchObject({ title: "Second tape (en)", artist: 'Harav Moshe Wolfson zt"l' });
  });

  it("works without a Media Session", () => {
    const clock = new FakeClock();
    const audio = new FakeAudio(clock, { [A]: 100, [B]: 60 });
    const engine = createPlayerEngine({ audio, clock, mediaSession: null, lifecycle: null });
    engine.load(twoRecordings(), { autoplay: true });
    clock.tick(1000);
    expect(engine.getState().status).toBe("playing");
  });
});

describe("store contract", () => {
  it("getState is stable between changes and subscribe notifies", () => {
    const { clock, engine } = setup();
    const seen: number[] = [];
    const off = engine.subscribe(() => seen.push(engine.getState().t));
    expect(engine.getState()).toBe(engine.getState());
    engine.load(twoRecordings(), { start: 10 });
    const s1 = engine.getState();
    clock.tick(1000); // paused: nothing changes
    expect(engine.getState()).toBe(s1);
    expect(seen.length).toBeGreaterThan(0);
    off();
    const n = seen.length;
    engine.seek(50);
    expect(seen.length).toBe(n);
  });

  it("destroy removes every listener", () => {
    const { audio, engine, ms } = setup();
    engine.load(twoRecordings());
    engine.destroy();
    expect(audio.listenerCount()).toBe(0);
    expect(ms.session.handlers.size).toBe(0);
  });

  it("a PublicShiur from the corpus is a PlayerShiur", () => {
    const real = golden as unknown as PublicShiur;
    const s: PlayerShiur = real;
    expect(s.recordings).toHaveLength(2);
    // HTMLAudioElement and navigator.mediaSession satisfy the engine's element/session types.
    type Check<T extends MediaElementLike> = T;
    type CheckSession<T extends MediaSessionLike> = T;
    const ok: [Check<HTMLAudioElement>?, CheckSession<MediaSession>?] = [];
    expect(ok).toEqual([]);
  });

  it("the engine has no React import", () => {
    const dir = join(dirname(fileURLToPath(import.meta.url)), "..");
    const files = readdirSync(dir).filter((f) => /\.tsx?$/.test(f));
    expect(files.length).toBeGreaterThanOrEqual(4);
    for (const f of files) {
      const src = readFileSync(join(dir, f), "utf8");
      expect(src, f).not.toMatch(/from\s+["'](react|react-dom)(\/[^"']*)?["']/);
      expect(src, f).not.toMatch(/require\(["']react/);
    }
  });
});

describe("audio versions (cleaned-audio-ux §6)", () => {
  const CA = "https://media.example.org/fixed/sidon/shiurim/a.mp3";
  const CB = "https://media.example.org/fixed/sidon/shiurim/b.mp3";
  const withCleaned = (over: Partial<PlayerShiur> = {}) =>
    twoRecordings({
      recordings: [
        { id: "a", offset: 0, duration: 100, audioUrl: A, cleanedUrl: CA },
        { id: "b", offset: 100, duration: 60, audioUrl: B, cleanedUrl: CB },
      ],
      ...over,
    });

  it("plays the improved copy by default and the original when chosen", () => {
    const { clock, audio, engine } = setup(withCleaned());
    engine.load(withCleaned(), { start: 10 });
    clock.flush();
    expect(audio.src).toBe(CA);
    expect(engine.getState()).toMatchObject({ audioVersion: "cleaned", playingVersion: "cleaned", cleanedAvailable: true });

    const b = setup(withCleaned(), { audioVersion: "original" });
    b.engine.load(withCleaned(), { start: 10 });
    b.clock.flush();
    expect(b.audio.src).toBe(A);
    expect(b.engine.getState()).toMatchObject({ audioVersion: "original", playingVersion: "original", cleanedAvailable: true });
  });

  it("has no line (state C) when the recording has no improved copy", () => {
    const { clock, audio, engine } = setup();
    engine.load(twoRecordings(), { start: 10 });
    clock.flush();
    expect(audio.src).toBe(A);
    expect(engine.getState()).toMatchObject({ playingVersion: "original", cleanedAvailable: false });
  });

  it("switching keeps the position, the playing state and the speed", () => {
    const { clock, audio, engine } = setup(withCleaned(), { skip: { enabled: false } });
    engine.setRate(1.5);
    engine.load(withCleaned(), { start: 40, autoplay: true });
    clock.flush();
    clock.tick(2000);
    const before = engine.getState().t;
    expect(before).toBeCloseTo(43, 1);
    engine.setAudioVersion("original");
    expect(engine.getState().t).toBeCloseTo(before, 1);
    clock.flush();
    expect(audio.src).toBe(A);
    expect(audio.currentTime).toBeCloseTo(before, 1);
    expect(audio.playbackRate).toBe(1.5);
    expect(audio.defaultPlaybackRate).toBe(1.5);
    expect(engine.getState()).toMatchObject({ status: "playing", rate: 1.5, playingVersion: "original", audioVersion: "original" });
    clock.tick(2000);
    expect(engine.getState().t).toBeCloseTo(before + 3, 1);

    engine.setAudioVersion("cleaned");
    clock.flush();
    expect(audio.src).toBe(CA);
    expect(engine.getState()).toMatchObject({ status: "playing", playingVersion: "cleaned" });
  });

  it("switching while paused stays paused", () => {
    const { clock, audio, engine } = setup(withCleaned());
    engine.load(withCleaned(), { start: 110 });
    clock.flush();
    expect(audio.src).toBe(CB);
    engine.setAudioVersion("original");
    clock.flush();
    expect(audio.src).toBe(B);
    expect(audio.currentTime).toBeCloseTo(10, 6);
    expect(audio.paused).toBe(true);
    expect(engine.getState()).toMatchObject({ status: "paused", t: 110 });
  });

  it("the next recording follows the chosen version", () => {
    const { clock, audio, engine } = setup(withCleaned(), { skip: { enabled: false }, audioVersion: "original" });
    engine.load(withCleaned(), { start: 98, autoplay: true });
    clock.flush();
    expect(audio.src).toBe(A);
    clock.tick(3000);
    expect(audio.src).toBe(B);
  });

  it("falls back once to the original when the improved file fails, keeping the preference", () => {
    const { clock, audio, engine, events } = setup(withCleaned({ id: "yi-test-02" }), { skip: { enabled: false } });
    const shiur = withCleaned({
      recordings: [
        { id: "a", offset: 0, duration: 100, audioUrl: A, cleanedUrl: "https://media.example.org/fixed/sidon/gone.mp3" },
        { id: "b", offset: 100, duration: 60, audioUrl: B, cleanedUrl: CB },
      ],
    });
    engine.load(shiur, { start: 20, autoplay: true });
    clock.flush();
    clock.flush();
    expect(audio.src).toBe(A);
    expect(audio.currentTime).toBeCloseTo(20, 1);
    expect(events.error).toHaveLength(0);
    expect(engine.getState()).toMatchObject({
      status: "playing",
      audioVersion: "cleaned",
      playingVersion: "original",
      versionFallback: false,
    });
    // The next recording still tries its improved copy.
    engine.seek(110);
    clock.flush();
    expect(audio.src).toBe(CB);
  });

  it("an explicit switch that cannot load (offline) falls back to the stored original with a brief notice", () => {
    const { clock, audio, engine } = setup(withCleaned(), { canTryCleaned: () => false, skip: { enabled: false } });
    // The improved copy is not reachable: only the downloaded originals load.
    const offline = withCleaned({
      recordings: [
        { id: "a", offset: 0, duration: 100, audioUrl: A, cleanedUrl: "https://media.example.org/fixed/sidon/offline-a.mp3" },
        { id: "b", offset: 100, duration: 60, audioUrl: B, cleanedUrl: CB },
      ],
    });
    engine.load(offline, { start: 30, autoplay: true });
    clock.flush();
    expect(audio.src).toBe(A);
    expect(engine.getState()).toMatchObject({ audioVersion: "cleaned", playingVersion: "original", versionFallback: false });

    engine.setAudioVersion("cleaned");
    clock.flush();
    clock.flush();
    expect(audio.src).toBe(A);
    expect(engine.getState()).toMatchObject({ status: "playing", playingVersion: "original", versionFallback: true });
    expect(engine.getState().t).toBeCloseTo(30, 0);
    clock.tick(9000);
    expect(engine.getState().versionFallback).toBe(false);
  });
});
