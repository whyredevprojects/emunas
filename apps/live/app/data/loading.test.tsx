// @vitest-environment jsdom
/**
 * Loading rules (corpus-wave-plan §4, concept-live-corpus G, C1.7), through the real route tree over
 * the committed fixtures with a fetch spy:
 * - Today renders from `today.json` alone: no `corpus.json`, `facets.json`, topic tree, stories
 *   index, glossary shard or Explore file is requested (also with progress in the store);
 * - the listening room renders from its shiur file alone, and its Related tab has no "counterpart in
 *   the other language" item (F.1);
 * - the corpus-entry route stubs load one file each and carry the AI label once; an unknown id is
 *   "not found" after that one request (no redirect lookup: the site has never been published).
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RouterProvider } from "react-router";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPlayerEngine, type PlayerEngine } from "../player-engine/index.ts";
import { FakeAudio, FakeClock, fakeMediaSession } from "../player-engine/test/fakes.ts";
import { appDescribe, installEngine } from "../player-ui/index.ts";
import { settingsStore } from "../shell/settings.ts";
import { createTestRouter } from "../shell/test-router.tsx";
import { registerProgressSource } from "../features/today/personal.ts";
import { configureData, resetDataConfig, type DataFetch, type StoriesIndexFile, type TopicsFile } from "./index.ts";
import { fixtureFetch } from "./fixtures/fetch.ts";
import storiesIndex from "./fixtures/data/stories-index.json" with { type: "json" };
import topics from "./fixtures/data/topics.json" with { type: "json" };

/** Corpus-wide files that first paint must never wait on (plan §4). */
const NOT_ON_FIRST_PAINT = [
  /^\/data\/corpus\.json$/u,
  /^\/data\/facets\.json$/u,
  /^\/data\/topics\.json$/u,
  /^\/data\/stories-index\.json$/u,
  /^\/data\/glossary\//u,
  /^\/data\/explore\//u,
  /^\/data\/stories\.json$/u,
];

let requested: string[] = [];
const spy: DataFetch = (input, init) => {
  requested.push(new URL(input, "http://x.invalid").pathname);
  return fixtureFetch(input, init);
};
const forbidden = () => requested.filter((p) => NOT_ON_FIRST_PAINT.some((re) => re.test(p)));

let clock: FakeClock;
let engine: PlayerEngine;
let restore: () => void = () => {};

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
});

beforeEach(() => {
  requested = [];
  configureData({ fetch: spy });
  settingsStore.getState().reset();
  clock = new FakeClock();
  const durations = new Proxy({} as Record<string, number>, { get: () => 5000 });
  engine = createPlayerEngine({
    audio: new FakeAudio(clock, durations),
    clock,
    mediaSession: fakeMediaSession().env,
    lifecycle: null,
    describe: appDescribe,
  });
  installEngine(engine);
});

afterEach(() => {
  cleanup();
  restore();
  restore = () => {};
  engine.destroy();
  resetDataConfig();
});

afterAll(() => installEngine(null));

async function settle(): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      clock.flush();
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

async function renderAt(path: string) {
  const router = createTestRouter(path);
  const utils = render(<RouterProvider router={router} />);
  await settle();
  return { router, ...utils };
}

describe("Today loads from today.json alone", () => {
  it("first paint requests today.json and the moment's shiur file, nothing corpus-wide", async () => {
    const { container } = await renderAt("/en/?date=2026-10-14");
    await waitFor(() => expect(container.querySelector("[data-testid=corpus-counter]")).not.toBeNull());
    await waitFor(() => expect(container.querySelector("[data-moment] [lang]")).not.toBeNull());
    await settle();
    expect(requested).toContain("/data/today.json");
    expect(forbidden()).toEqual([]);
    expect(requested.filter((p) => !p.startsWith("/data/shiur/") && p !== "/data/today.json")).toEqual([]);
    // The parsha row renders from the cards in today.json.
    expect(container.querySelector('[data-parsha="noach"] a[data-shiur]')).not.toBeNull();
  });

  it("Continue loads only the heard shiurim's files", async () => {
    restore = registerProgressSource({
      progress: () => Promise.resolve([{ shiurId: "yi-parshas-hashavua-brshys-01", t: 300, completed: false, updatedAt: "2026-11-10T00:00:00Z" }]),
    });
    const { container } = await renderAt("/en/?date=2026-10-14");
    await waitFor(() => expect(container.querySelector('[aria-labelledby="today-continue"] a[data-shiur]')).not.toBeNull());
    expect(requested).toContain("/data/shiur/yi-parshas-hashavua-brshys-01.json");
    expect(forbidden()).toEqual([]);
  });
});

describe("the listening room loads from its shiur file alone", () => {
  it("requests no corpus-wide file, and Related has no counterpart in the other language", async () => {
    const { container } = await renderAt("/en/s/yi-tanya-1-01");
    await screen.findByRole("tablist");
    fireEvent.click(screen.getByRole("tab", { name: "Related" }));
    await settle();
    expect(forbidden()).toEqual([]);
    expect(requested.every((p) => p.startsWith("/data/shiur/") || p.startsWith("/data/writeup/"))).toBe(true);
    // The series link stays; no item points at the other language's course.
    expect(container.querySelector('a[href="/en/series/tanya-yi"]')).not.toBeNull();
    expect(container.querySelector('a[href="/en/series/tanya-en"]')).toBeNull();
    expect(container.textContent).not.toMatch(/other language/u);
    // Related titles come from the shiur file itself.
    const related = [...container.querySelectorAll('a[href^="/en/s/"]')];
    expect(related.length).toBeGreaterThan(0);
    for (const a of related) expect(a.textContent?.trim().length).toBeGreaterThan(0);
  });

  it("a full shiur's room also requests no corpus-wide file", async () => {
    await renderAt("/en/s/yi-parshas-hashavua-brshys-01");
    await screen.findByRole("tablist");
    await settle();
    expect(forbidden()).toEqual([]);
  });
});

describe("corpus-entry route stubs", () => {
  it("a topic page loads its one file and shows the AI label once", async () => {
    const id = (topics as TopicsFile).topics[0]![0];
    const { container } = await renderAt(`/en/t/${id}`);
    await waitFor(() => expect(container.querySelector("[data-corpus-label]")).not.toBeNull());
    expect(container.querySelectorAll("main h1")).toHaveLength(1);
    expect(container.querySelectorAll("[data-corpus-label]")).toHaveLength(1);
    expect(requested).toEqual([`/data/topic/${id}.json`]);
  });

  it("a story page lists its tellings, each linking to its moment", async () => {
    const story = (storiesIndex as StoriesIndexFile).stories.find((s) => s.page)!;
    const { container } = await renderAt(`/yi/maasios/${story.id}`);
    await waitFor(() => expect(container.querySelector("[data-testid=story-tellings]")).not.toBeNull());
    const links = [...container.querySelectorAll("[data-testid=story-tellings] a")].map((a) => a.getAttribute("href"));
    expect(links).toHaveLength(story.tellings);
    for (const h of links) expect(h).toMatch(/^\/yi\/s\/[^?]+\?t=\d+&m=.+~st\d+$/u);
    expect(container.querySelectorAll("[data-corpus-label]")).toHaveLength(1);
    expect(requested).toEqual([`/data/story/${story.id}.json`]);
  });

  it("a story id that has no file says not found, after that one request", async () => {
    const { router, container } = await renderAt("/en/maasios/the-sanzer-rav-and-the-business-competitor");
    await waitFor(() => expect(container.querySelector("article[aria-busy=false]")).not.toBeNull());
    expect(router.state.location.pathname).toBe("/en/maasios/the-sanzer-rav-and-the-business-competitor");
    expect(requested).toEqual(["/data/story/the-sanzer-rav-and-the-business-competitor.json"]);
    expect(container.querySelector("[data-corpus-label]")).toBeNull();
  });

  it("a thread without a page says not found", async () => {
    const { container } = await renderAt("/en/th/no-such-thread");
    await waitFor(() => expect(container.querySelector("article[aria-busy=false]")).not.toBeNull());
    expect(container.querySelectorAll("main h1")).toHaveLength(1);
    expect(container.querySelector("[data-corpus-label]")).toBeNull();
    expect(requested).toEqual(["/data/thread/no-such-thread.json"]);
  });
});
