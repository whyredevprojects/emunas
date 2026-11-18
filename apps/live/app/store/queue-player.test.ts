/**
 * The queue of moments plays across shiurim with the real player engine over a fake media element:
 * each moment pauses at its end and the next entry (another shiur) starts; whole-shiur entries run to
 * the end; unavailable shiurim are skipped; playing something else releases the queue. Progress
 * events land in the personal store.
 */
import { afterEach, describe, expect, it } from "vitest";
import { createPlayerEngine } from "../player-engine/engine.ts";
import { FakeAudio, FakeClock } from "../player-engine/test/fakes.ts";
import type { PlayerShiur } from "../player-engine/types.ts";
import { MemoryBackend } from "./backend.ts";
import { createPersonal, queueCurrentKey, type Personal } from "./personal.ts";
import { attachProgressRecorder } from "./progress-recorder.ts";
import { createQueuePlayer, type QueuePlayer } from "./queue-player.ts";

const url = (id: string) => `https://media.example.org/${id}.mp3`;

function shiur(id: string, duration: number, playable = true): PlayerShiur {
  return {
    id,
    lang: "yi",
    duration,
    catalog: { titleOriginal: id },
    recordings: [{ id: `${id}-r`, offset: 0, duration, audioUrl: playable ? url(id) : null, cleanedUrl: null }],
    notes: {
      chapters: [
        { idx: 0, t: 0, end: duration / 2, title: { en: "one", yi: "איינס" } },
        { idx: 1, t: duration / 2, end: duration, title: { en: "two", yi: "צוויי" } },
      ],
      skip: [],
    },
  };
}

const SHIURIM: Record<string, PlayerShiur> = {
  "yi-x-01": shiur("yi-x-01", 100),
  "en-y-01": shiur("en-y-01", 60),
  "yi-z-01": shiur("yi-z-01", 50, false),
};

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const c of cleanups.splice(0)) c();
});

function setup() {
  const clock = new FakeClock();
  const durations: Record<string, number> = {};
  for (const s of Object.values(SHIURIM)) for (const r of s.recordings) if (r.audioUrl) durations[r.audioUrl] = r.duration;
  const audio = new FakeAudio(clock, durations);
  const engine = createPlayerEngine({ audio, clock, lifecycle: null, mediaSession: null });
  let n = 0;
  const personal: Personal = createPersonal({
    open: async () => ({ backend: new MemoryBackend(), fallbackReason: null }),
    channel: null,
    newId: () => `k${++n}`,
    now: () => 1_000 + clock.now(),
  });
  const loads: string[] = [];
  const queue: QueuePlayer = createQueuePlayer({
    engine,
    personal,
    loadShiur: async (id) => {
      loads.push(id);
      const s = SHIURIM[id];
      if (!s) throw new Error(`404 ${id}`);
      return s;
    },
  });
  const detach = attachProgressRecorder(engine, personal);
  cleanups.push(() => {
    queue.destroy();
    detach();
    engine.destroy();
  });

  /** Advance the fake clock in small steps, letting promises (shiur loads, store writes) settle. */
  async function run(seconds: number): Promise<void> {
    for (let i = 0; i < seconds * 10; i++) {
      clock.tick(100);
      await new Promise((r) => setImmediate(r));
    }
  }
  return { clock, audio, engine, personal, queue, loads, run };
}

describe("queue of moments", () => {
  it("plays moments back to back across shiurim, skipping an unavailable one", async () => {
    const { audio, engine, personal, queue, loads, run } = setup();
    const keys = await personal.replaceQueue([
      { shiurId: "yi-x-01", start: 10, end: 20 },
      { shiurId: "en-y-01", start: 5, end: 8 },
      { shiurId: "yi-z-01", start: 0 },
      { shiurId: "yi-x-01", start: 90 },
    ]);

    await queue.start();
    await run(0.5);
    expect(engine.getState()).toMatchObject({ shiurId: "yi-x-01", status: "playing" });
    expect(engine.getState().t).toBeGreaterThanOrEqual(10);
    expect(queue.store.getState().activeKey).toBe(keys[0]);

    await run(10);
    // Moment 1 ended at 20 s; moment 2 (another shiur) is playing from 5 s.
    expect(engine.getState()).toMatchObject({ shiurId: "en-y-01", status: "playing" });
    expect(audio.src).toBe(url("en-y-01"));
    expect(queue.store.getState().activeKey).toBe(keys[1]);
    expect(queueCurrentKey(personal.store.getState())).toBe(keys[1]);

    await run(4);
    // Moment 2 ended at 8 s; the unplayable shiur was skipped; the last entry plays from 90 s.
    expect(queue.store.getState().failed).toEqual([keys[2]]);
    expect(engine.getState()).toMatchObject({ shiurId: "yi-x-01", status: "playing" });
    expect(queue.store.getState().activeKey).toBe(keys[3]);
    expect(engine.getState().t).toBeGreaterThanOrEqual(90);

    await run(11);
    // The whole-shiur entry ran to the end; the queue is finished.
    expect(engine.getState().status).toBe("ended");
    expect(queue.store.getState()).toMatchObject({ activeKey: null, finished: true });
    expect(loads).toEqual(["yi-x-01", "en-y-01", "yi-z-01", "yi-x-01"]);

    // Listening was recorded: positions, history (most recent first), the finished shiur.
    await personal.ready();
    const s = personal.store.getState();
    expect(s.progress["en-y-01"]?.t).toBeCloseTo(8, 0);
    expect(s.progress["yi-x-01"]?.completedAt).not.toBeNull();
    expect(s.progress["yi-x-01"]?.completedChapters).toContain(1);
    expect(s.history.map((h) => h.shiurId)).toEqual(["yi-x-01", "en-y-01"]);
  });

  it("an entry whose shiur cannot be loaded is skipped", async () => {
    const { engine, personal, queue, run } = setup();
    const keys = await personal.replaceQueue([
      { shiurId: "yi-missing-01", start: 0, end: 5 },
      { shiurId: "en-y-01", start: 1, end: 2 },
    ]);
    await queue.start();
    await run(0.5);
    expect(queue.store.getState().failed).toEqual([keys[0]]);
    expect(engine.getState()).toMatchObject({ shiurId: "en-y-01", status: "playing" });
  });

  it("next / prev move through the queue", async () => {
    const { engine, personal, queue, run } = setup();
    const keys = await personal.replaceQueue([
      { shiurId: "yi-x-01", start: 10, end: 20 },
      { shiurId: "en-y-01", start: 5, end: 8 },
    ]);
    await queue.start();
    await run(0.2);
    await queue.next();
    await run(0.2);
    expect(engine.getState().shiurId).toBe("en-y-01");
    await queue.prev();
    await run(0.2);
    expect(engine.getState().shiurId).toBe("yi-x-01");
    expect(queue.store.getState().activeKey).toBe(keys[0]);
  });

  it("playing another shiur releases the queue; the next moment end does not advance it", async () => {
    const { engine, personal, queue, run } = setup();
    await personal.replaceQueue([
      { shiurId: "yi-x-01", start: 10, end: 20 },
      { shiurId: "en-y-01", start: 5, end: 8 },
    ]);
    await queue.start();
    await run(1);
    engine.load(SHIURIM["en-y-01"]!, { start: 30, end: 32, autoplay: true });
    await run(0.2);
    expect(queue.store.getState().activeKey).toBeNull();
    await run(3);
    // The listener's own moment ended and nothing else was loaded.
    expect(engine.getState()).toMatchObject({ shiurId: "en-y-01", momentEnded: true });
  });
});
