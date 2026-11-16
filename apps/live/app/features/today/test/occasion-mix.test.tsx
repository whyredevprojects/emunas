// @vitest-environment jsdom
/**
 * C3.4 acceptance: Today's occasion mix in the real route tree, over the fixture files, with a fetch
 * spy. First paint needs only today.json; pressing play starts the inline head without a request,
 * then loads the occasion topic's file and at most one moments page; corpus.json is never requested.
 */
import { act, cleanup, render, waitFor } from "@testing-library/react";
import axe from "axe-core";
import { RouterProvider } from "react-router";
import { createStore } from "zustand/vanilla";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clearDataCache, configureData, resetDataConfig, type DataFetch, type TodayFile, type TopicFile } from "../live-data.ts";
import { fixtureFetch, todayFixture } from "./fixtures.ts";
import { settingsStore } from "../../../shell/settings.ts";
import { createTestRouter } from "../../../shell/test-router.tsx";
import { MemoryBackend } from "../../../store/backend.ts";
import { createPersonal, setPersonal, type Personal } from "../../../store/personal.ts";
import { setQueuePlayer, type QueuePlayer, type QueuePlayerState } from "../../../store/queue-player.ts";
import { MIX_SIZE } from "../../mix/model.ts";
import noachTopic from "../../../data/fixtures/data/topic/noach-mabul.json" with { type: "json" };

// Noach 5787 is read on Shabbos 17 Oct 2026; Wednesday 14 Oct is in its week. Noach's topic is noach-mabul.
const NOACH_WEEK = "2026-10-14";
const TOPIC = "/data/topic/noach-mabul.json";

let requested: string[] = [];
let overrides = new Map<string, unknown>();
let failing = new Set<string>();
let holdShiurFiles = false;
const spy: DataFetch = (input, init) => {
  const path = new URL(input, "http://x.invalid").pathname;
  requested.push(path);
  if (failing.has(path)) return Promise.resolve(new Response("", { status: 500 }));
  // The moment of the day's shiur file never arrives: the page must not need it to paint.
  if (holdShiurFiles && path.startsWith("/data/shiur/")) return new Promise<Response>(() => {});
  const o = overrides.get(path);
  if (o !== undefined) return Promise.resolve(new Response(JSON.stringify(o), { status: 200, headers: { "content-type": "application/json" } }));
  return fixtureFetch(input, init);
};

let personal: Personal;
let played: string[] = [];

function fakeQueuePlayer(): QueuePlayer {
  const store = createStore<QueuePlayerState>()(() => ({ activeKey: null, loading: false, failed: [], finished: false }));
  return {
    store,
    play: async (key) => {
      played.push(key);
    },
    start: async () => {},
    next: async () => {},
    prev: async () => {},
    release: () => {},
    destroy: () => {},
  };
}

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
});

beforeEach(() => {
  requested = [];
  overrides = new Map();
  failing = new Set();
  holdShiurFiles = false;
  played = [];
  clearDataCache();
  configureData({ fetch: spy });
  settingsStore.getState().reset();
  let n = 0;
  personal = createPersonal({ open: async () => ({ backend: new MemoryBackend(), fallbackReason: null }), channel: null, newId: () => `id-${++n}` });
  setPersonal(personal);
  setQueuePlayer(fakeQueuePlayer());
});

afterEach(() => {
  cleanup();
  setQueuePlayer(null);
  setPersonal(null);
});

afterAll(() => resetDataConfig());

async function renderAt(path: string) {
  const router = createTestRouter(path);
  const utils = render(<RouterProvider router={router} />);
  await act(async () => {});
  await waitFor(() => expect(utils.container.querySelector("[data-testid=corpus-counter]")).not.toBeNull());
  return utils;
}

const queueMoments = () => personal.store.getState().queue.map((q) => q.momentId);
const isCorpusWide = (p: string) =>
  p === "/data/corpus.json" ||
  p === "/data/facets.json" ||
  p === "/data/topics.json" ||
  p === "/data/stories-index.json" ||
  p.startsWith("/data/glossary/") ||
  p.startsWith("/data/explore/");

function playButton(container: HTMLElement): HTMLButtonElement {
  const b = container.querySelector<HTMLButtonElement>("[data-testid=occasion-mix-play]");
  if (!b) throw new Error("no occasion mix button");
  return b;
}

const clone = <T,>(x: T): T => structuredClone(x);

describe("Today: the occasion mix", () => {
  it("first paint requests only today.json; the button is there before any other file arrives", async () => {
    holdShiurFiles = true;
    const { container } = await renderAt(`/en/?date=${NOACH_WEEK}`);
    const box = container.querySelector("[data-testid=occasion-mix]")!;
    expect(box).not.toBeNull();
    expect(box.getAttribute("data-occasion")).toBe("noach");
    expect(box.getAttribute("data-topic")).toBe("noach-mabul");
    expect(playButton(container).textContent).toBe("Play a mix on Noach and the Mabul");
    // Labelled once as assembled automatically from AI tags.
    expect(container.querySelectorAll("[data-mix-label=auto]")).toHaveLength(1);
    expect(box.textContent).toContain("Assembled automatically from AI tags.");
    expect(box.textContent).toContain("10 sections from 3 shiurim.");
    // Only today.json, plus the moment of the day's own shiur file (held, never answered).
    expect(requested.filter((p) => !p.startsWith("/data/shiur/"))).toEqual(["/data/today.json"]);
    expect(requested.filter((p) => p.startsWith("/data/shiur/")).length).toBeLessThanOrEqual(1);
    expect(requested.some(isCorpusWide)).toBe(false);
  });

  it("pressing play starts the inline head at once, then appends the rest from the topic file", async () => {
    const { container } = await renderAt(`/en/?date=${NOACH_WEEK}`);
    // The moment of the day loads its shiur file on its own; let that request land first so it is
    // not counted as one that pressing play made (on a slow runner it can come after first paint).
    await waitFor(() => expect(requested.some((p) => p.startsWith("/data/shiur/"))).toBe(true));
    const before = requested.length;
    await act(async () => {
      playButton(container).click();
    });
    await waitFor(() => expect(queueMoments().length).toBe(10));
    const head = (todayFixture as unknown as TodayFile).occasions["noach"]!.mix!.first.map((x) => x.id);
    expect(queueMoments().slice(0, head.length)).toEqual(head);
    // The occasion's own shiur (catalog) leads, one section per shiur until the pool runs out.
    expect(queueMoments()).toEqual([
      "en-parsha-en-nch-01~s3",
      "yi-parshas-hashavua-brshys-03~s6",
      "yi-zmanim-svkvs-08~s5",
      "en-parsha-en-nch-01~s4",
      "en-parsha-en-nch-01~s5",
      "en-parsha-en-nch-01~s6",
      "en-parsha-en-nch-01~s7",
      "en-parsha-en-nch-01~s8",
      "en-parsha-en-nch-01~s9",
      "en-parsha-en-nch-01~s11",
    ]);
    expect(played).toHaveLength(1);
    const after = requested.slice(before);
    expect(after).toEqual([TOPIC]);
    expect(after.filter((p) => p.includes(".moments-")).length).toBeLessThanOrEqual(1);
    expect(requested).not.toContain("/data/corpus.json");
    expect(requested.some(isCorpusWide)).toBe(false);
  });

  it("the head plays even when the topic file fails; no error is shown", async () => {
    failing.add(TOPIC);
    const { container } = await renderAt(`/en/?date=${NOACH_WEEK}`);
    await act(async () => {
      playButton(container).click();
    });
    await waitFor(() => expect(played).toHaveLength(1));
    expect(queueMoments()).toEqual(["en-parsha-en-nch-01~s3", "yi-parshas-hashavua-brshys-03~s6"]);
    expect(container.querySelector("[data-testid=occasion-mix] [role=status]")!.textContent).toBe("");
  });

  it("fetches at most one topic moments page when the topic file cannot fill the mix", async () => {
    const topic = clone(noachTopic) as TopicFile;
    topic.moments = topic.moments.slice(0, 3);
    topic.momentPages = 3;
    overrides.set(TOPIC, topic);
    const refs = Array.from({ length: 20 }, (_, i) => ({ id: `other-${i}~s1`, shiurId: `other-${i}`, t: 10, end: 400, lang: "en" as const }));
    overrides.set("/data/topic/noach-mabul.moments-1.json", { schemaVersion: topic.schemaVersion, topicId: "noach-mabul", page: 1, moments: refs });
    const { container } = await renderAt(`/en/?date=${NOACH_WEEK}`);
    await act(async () => {
      playButton(container).click();
    });
    await waitFor(() => expect(queueMoments().length).toBe(MIX_SIZE));
    expect(requested.filter((p) => p.includes(".moments-"))).toEqual(["/data/topic/noach-mabul.moments-1.json"]);
    expect(requested).not.toContain("/data/corpus.json");
  });

  it("leaves out what the build marks as not featured (D7), head and rest", async () => {
    const today = clone(todayFixture) as unknown as TodayFile;
    today.occasions["noach"]!.mix!.skip = ["yi-parshas-hashavua-brshys-03", "en-parsha-en-nch-01~s5"];
    overrides.set("/data/today.json", today);
    const { container } = await renderAt(`/en/?date=${NOACH_WEEK}`);
    await act(async () => {
      playButton(container).click();
    });
    await waitFor(() => expect(queueMoments().length).toBe(8));
    expect(queueMoments().some((m) => m?.startsWith("yi-parshas-hashavua-brshys-03~"))).toBe(false);
    expect(queueMoments()).not.toContain("en-parsha-en-nch-01~s5");
    expect(queueMoments()[0]).toBe("en-parsha-en-nch-01~s3");
  });

  it("with no head in the listener's language, play assembles the mix from the topic file first", async () => {
    const today = clone(todayFixture) as unknown as TodayFile;
    today.occasions["noach"]!.mix!.first = today.occasions["noach"]!.mix!.first.filter((x) => x.id.startsWith("en-"));
    overrides.set("/data/today.json", today);
    const { container } = await renderAt(`/en/?date=${NOACH_WEEK}&audio=yi`);
    expect(container.querySelector("[data-testid=occasion-mix]")!.textContent).not.toContain("sections from");
    await act(async () => {
      playButton(container).click();
    });
    await waitFor(() => expect(played).toHaveLength(1));
    expect(queueMoments()).toEqual(["yi-parshas-hashavua-brshys-03~s6", "yi-zmanim-svkvs-08~s5"]);
  });

  it("no button in a week whose occasions have no mix", async () => {
    const today = clone(todayFixture) as unknown as TodayFile;
    for (const o of Object.values(today.occasions)) o.mix = null;
    overrides.set("/data/today.json", today);
    const { container } = await renderAt(`/en/?date=${NOACH_WEEK}`);
    expect(container.querySelector("[data-testid=occasion-mix]")).toBeNull();
  });

  it("renders in Yiddish with the topic's Yiddish name", async () => {
    const { container } = await renderAt(`/yi/?date=${NOACH_WEEK}`);
    expect(playButton(container).textContent).toBe("שפילט א מיקס איבער נח און דער מבול");
  });

  it("has no axe violations", async () => {
    await renderAt(`/en/?date=${NOACH_WEEK}`);
    const result = await axe.run(document, { rules: { "color-contrast": { enabled: false }, "document-title": { enabled: false } } });
    expect(result.violations.map((v) => v.id)).toEqual([]);
  });
});
