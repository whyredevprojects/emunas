// @vitest-environment jsdom
/**
 * The Maasios library and the story page in the real route tree, over the committed fixtures (the
 * emitter's output for the mini corpus) with a fetch spy:
 * - the library renders from `stories-index.json` (and the small topic tree) and never fetches a
 *   story file or a shiur file, so no retelling arrives until the listener opens a telling;
 * - cards: title, merged people as links, raw names as plain text, "told N times", one play button;
 * - facets: person, topic (section join), told more than once, and the audio-language setting;
 * - a story told once opens in place from its shiur file and links to the moment;
 * - the story page: merged retelling once under the label, every telling with year, language, shiur
 *   title and section title, a switcher that plays the chosen telling, each telling's own retelling
 *   collapsed and loaded on expand;
 * - stories-only mode plays one telling per story back to back and skips stories heard in this visit;
 * - a retired story id is a 404; axe finds no violations.
 */
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import axe from "axe-core";
import { RouterProvider } from "react-router";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { configureData, resetDataConfig, topicNodes, type DataFetch, type StoriesIndexFile, type StoryFile, type TopicsFile } from "../../../data/index.ts";
import { fixtureFetch } from "../../../data/fixtures/fetch.ts";
import storiesIndexJson from "../../../data/fixtures/data/stories-index.json" with { type: "json" };
import chizkiyahuJson from "../../../data/fixtures/data/story/chizkiyahu-sleeps-during-sanherivs-siege.json" with { type: "json" };
import topicsJson from "../../../data/fixtures/data/topics.json" with { type: "json" };
import { createPlayerEngine } from "../../../player-engine/engine.ts";
import { FakeAudio, FakeClock } from "../../../player-engine/test/fakes.ts";
import type { PlayerEngine, PlayerShiur } from "../../../player-engine/types.ts";
import { settingsStore } from "../../../shell/settings.ts";
import { createTestRouter } from "../../../shell/test-router.tsx";
import { MemoryBackend } from "../../../store/backend.ts";
import { createPersonal, setPersonal, type Personal } from "../../../store/personal.ts";
import { createQueuePlayer, setQueuePlayer } from "../../../store/queue-player.ts";
import { clearHeard, heardStore, markHeard } from "../heard.ts";
import { STEP } from "../MaasiosPage.tsx";
import { storyTopics, topicChains } from "../model.ts";

const index = storiesIndexJson as StoriesIndexFile;
const chizkiyahu = chizkiyahuJson as StoryFile;

/** A story told in both languages, served beside the fixtures (the mini corpus has none with a page). */
const BILINGUAL_ID = "test-bilingual-story";
const bilingual: StoryFile = {
  ...chizkiyahu,
  id: BILINGUAL_ID,
  attributionVaries: true,
  tellings: [
    chizkiyahu.tellings[0]!,
    {
      shiurId: "en-parsha-en-ky-sb-01",
      momentId: "en-parsha-en-ky-sb-01~st1",
      t: 2628.25,
      year: null,
      lang: "en",
      title: "Ki Savo",
      chapterTitle: null,
    },
    chizkiyahu.tellings[1]!,
  ],
};

let requested: string[] = [];
const spy: DataFetch = async (input, init) => {
  const path = new URL(input, "http://x.invalid").pathname;
  requested.push(path);
  if (path === `/data/story/${BILINGUAL_ID}.json`) {
    return new Response(JSON.stringify(bilingual), { status: 200, headers: { "content-type": "application/json" } });
  }
  return fixtureFetch(input, init);
};

let clock: FakeClock;
let engine: PlayerEngine;
let personal: Personal;

const shiur = (id: string): PlayerShiur => ({
  id,
  lang: id.startsWith("en") ? "en" : "yi",
  duration: 8000,
  catalog: { titleOriginal: id },
  recordings: [{ id: `${id}-r`, offset: 0, duration: 8000, audioUrl: `https://media.example.invalid/${id}.mp3` }],
});

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
});

beforeEach(() => {
  requested = [];
  configureData({ fetch: spy });
  settingsStore.getState().reset();
  clearHeard();
  clock = new FakeClock();
  const durations = new Proxy({} as Record<string, number>, { get: () => 8000 });
  engine = createPlayerEngine({ audio: new FakeAudio(clock, durations), clock, lifecycle: null, mediaSession: null });
  personal = createPersonal({ open: async () => ({ backend: new MemoryBackend(), fallbackReason: null }), channel: null });
  setPersonal(personal);
  setQueuePlayer(createQueuePlayer({ engine, personal, loadShiur: async (id) => shiur(id) }));
});

afterEach(() => {
  cleanup();
  setQueuePlayer(null);
  engine.destroy();
  resetDataConfig();
});

afterAll(() => {
  setQueuePlayer(null);
  setPersonal(null);
});

async function renderRaw(path: string) {
  const router = createTestRouter(path);
  const utils = render(<RouterProvider router={router} />);
  await act(async () => {});
  return { router, ...utils };
}

async function renderAt(path: string) {
  const r = await renderRaw(path);
  await waitFor(() => expect(r.container.querySelector("article[aria-busy=false]")).not.toBeNull());
  return r;
}

async function run(seconds: number): Promise<void> {
  for (let i = 0; i < seconds * 10; i++) {
    clock.tick(100);
    await new Promise((r) => setImmediate(r));
  }
}

async function noAxeViolations(): Promise<void> {
  const result = await axe.run(document, { rules: { "color-contrast": { enabled: false }, "document-title": { enabled: false } } });
  expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

const cards = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>("li[data-story]")];
const ids = (c: HTMLElement) => cards(c).map((li) => li.getAttribute("data-story"));
const card = (c: HTMLElement, id: string) => c.querySelector<HTMLElement>(`li[data-story="${id}"]`)!;
/** Requests that would carry a retelling: a story file or a shiur file. */
const retellingFetches = () => requested.filter((p) => p.startsWith("/data/story/") || p.startsWith("/data/shiur/"));

// ---------------------------------------------------------------------------------- library

describe("the Maasios library", () => {
  it("renders from the stories index alone and never fetches a retelling", async () => {
    const { container, router } = await renderAt("/en/maasios");
    expect(ids(container)).toEqual(index.stories.slice(0, STEP).map((s) => s.id));
    expect(container.textContent).toContain(`${index.stories.length} of ${index.stories.length} stories`);
    expect(container.querySelectorAll("[data-corpus-label]")).toHaveLength(1);
    expect(container.textContent).not.toContain(chizkiyahu.retelling.en);

    // Facets, show more and the language setting do not fetch either.
    const person = container.querySelector<HTMLAnchorElement>("a[data-person]")!;
    await act(async () => {
      await router.navigate(person.getAttribute("href")!);
    });
    await act(async () => {
      await router.navigate("/en/maasios?many=1");
    });
    await act(async () => {
      settingsStore.getState().setAudio("yi");
    });
    expect(requested.sort()).toEqual(["/data/stories-index.json", "/data/topics.json"]);
    expect(retellingFetches()).toEqual([]);
    await noAxeViolations();
  });

  it("a card: title, merged people as links, raw names as plain text, told N times, one play button", async () => {
    const { container } = await renderAt("/en/maasios");
    const row = index.stories.find((s) => s.page && s.names.length > 0 && s.people.length > 0)!;
    const li = card(container, row.id);
    expect(li.querySelector("h3")!.textContent).toBe(row.title.en);
    const people = li.querySelector("[data-testid=story-people]")!;
    expect([...people.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual(row.people.map((id) => `/en/p/${id}`));
    const names = [...people.querySelectorAll("[data-name]")];
    expect(names.map((n) => n.textContent)).toEqual(row.names);
    for (const n of names) expect(n.querySelector("a")).toBeNull();
    expect(li.querySelector("[data-testid=story-told]")!.textContent).toBe(`told ${row.tellings} times`);
    expect(li.querySelectorAll("button[data-action=play]")).toHaveLength(1);
    expect(li.querySelector(`a[data-story-link="${row.id}"]`)!.getAttribute("href")).toBe(`/en/maasios/${row.id}`);
    // A story told once says so and has no page link.
    const once = card(container, index.stories.find((s) => !s.page)!.id);
    expect(once.querySelector("[data-testid=story-told]")!.textContent).toBe("told once");
    expect(once.querySelector("a[data-story-link]")).toBeNull();
    // Raw names are never a facet.
    const facetPeople = [...container.querySelectorAll("a[data-person]")].map((a) => a.getAttribute("data-person"));
    for (const p of facetPeople) expect(Object.keys(index.people)).toContain(p);
  });

  it("facets: person, topic through the section join, told more than once", async () => {
    const { container, router } = await renderAt("/en/maasios");
    const person = "baal-shem-tov";
    await act(async () => {
      await router.navigate(`/en/maasios?p=${person}`);
    });
    expect(ids(container)).toEqual(index.stories.filter((s) => s.people.includes(person)).map((s) => s.id));
    expect(container.querySelector(`a[data-person="${person}"]`)!.getAttribute("aria-current")).toBe("true");

    const chains = topicChains(topicNodes(topicsJson as TopicsFile));
    const select = container.querySelector<HTMLSelectElement>("select[data-facet=topic]")!;
    const topic = "hashgacha-pratis";
    expect([...select.options].map((o) => o.value)).toContain(topic);
    await act(async () => {
      fireEvent.change(select, { target: { value: topic } });
    });
    await waitFor(() => expect(router.state.location.search).toBe(`?p=${person}&topic=${topic}`));
    expect(ids(container)).toEqual(index.stories.filter((s) => s.people.includes(person) && storyTopics(s, chains).has(topic)).map((s) => s.id));

    await act(async () => {
      await router.navigate("/en/maasios?many=1");
    });
    expect(ids(container)).toEqual(index.stories.filter((s) => s.tellings > 1).map((s) => s.id));
    expect(container.querySelector("a[data-facet=many]")!.getAttribute("aria-current")).toBe("true");
    await noAxeViolations();
  });

  it("follows the audio-language setting (a story with a telling in that language)", async () => {
    settingsStore.getState().setAudio("en");
    const { container } = await renderAt("/yi/maasios");
    const en = index.stories.filter((s) => s.langs.includes("en"));
    expect(ids(container)).toEqual(en.slice(0, STEP).map((s) => s.id));
    for (const li of cards(container)) {
      const moment = li.querySelector("button[data-action=play]")?.getAttribute("data-moment");
      if (moment) expect(moment.startsWith("en-")).toBe(true);
    }
    await noAxeViolations();
  });

  it("a story told once opens in place from its shiur file and links to the moment", async () => {
    const { container } = await renderAt("/en/maasios");
    const row = index.stories.find((s) => !s.page)!;
    const li = card(container, row.id);
    const expand = li.querySelector<HTMLButtonElement>("button[data-action=expand]")!;
    expect(expand.getAttribute("aria-expanded")).toBe("false");
    await act(async () => {
      fireEvent.click(expand);
    });
    await waitFor(() => expect(li.querySelector(`[data-retelling] a[data-moment="${row.first.momentId}"]`)).not.toBeNull());
    expect(expand.getAttribute("aria-expanded")).toBe("true");
    const link = li.querySelector(`[data-retelling] a[data-moment="${row.first.momentId}"]`)!.getAttribute("href")!;
    expect(link.startsWith(`/en/s/${row.first.shiurId}`)).toBe(true);
    expect(link).toContain(`m=${row.first.momentId}`);
    expect(li.querySelector("[data-retelling] p")!.textContent!.length).toBeGreaterThan(20);
    expect(retellingFetches()).toEqual([`/data/shiur/${row.first.shiurId}.json`]);
    await noAxeViolations();
  });

  it("the play button plays one telling and marks the story heard", async () => {
    const { container } = await renderAt("/en/maasios");
    const row = index.stories.find((s) => s.plays[0]?.t !== null)!;
    await act(async () => {
      fireEvent.click(card(container, row.id).querySelector("button[data-action=play]")!);
    });
    await waitFor(() => expect(personal.store.getState().queue.map((q) => q.momentId)).toEqual([row.plays[0]!.momentId]));
    expect(personal.store.getState().queue[0]!.end).toBe(row.plays[0]!.end);
    expect(heardStore.getState().heard.has(row.id)).toBe(true);
  });
});

// ---------------------------------------------------------------------------------- stories only

describe("stories-only mode", () => {
  it("plays one telling per listed story back to back and skips stories heard in this visit", async () => {
    const heardBefore = index.stories[1]!.id;
    markHeard(heardBefore);
    const { container } = await renderAt("/en/maasios");
    const expected = index.stories.filter((s) => s.id !== heardBefore && s.plays[0]?.t !== null);
    expect(container.querySelector("[data-testid=heard-skipped]")!.textContent).toContain("1 story you heard in this visit is skipped.");
    const play = container.querySelector<HTMLButtonElement>("button[data-action=stories-only]")!;
    expect(play.textContent).toBe(`Play ${expected.length} stories`);
    await act(async () => {
      fireEvent.click(play);
    });
    await waitFor(() => expect(personal.store.getState().queue.length).toBe(expected.length));
    const queue = personal.store.getState().queue;
    expect(queue.map((q) => q.momentId)).toEqual(expected.map((s) => s.plays[0]!.momentId));
    // No two tellings of one story next to each other.
    const storyOf = new Map(index.stories.flatMap((s) => s.plays.map((p) => [p.momentId, s.id] as const)));
    for (let i = 1; i < queue.length; i++) expect(storyOf.get(queue[i]!.momentId!)).not.toBe(storyOf.get(queue[i - 1]!.momentId!));

    // Two stories in a row: each plays from its start to its end, then the next starts; each is heard.
    for (const st of expected.slice(0, 2)) {
      const p = st.plays[0]!;
      await act(async () => {
        await run(0.5);
      });
      expect(engine.getState().shiurId).toBe(p.shiurId);
      expect(engine.getState().t).toBeGreaterThanOrEqual(p.t! - 0.01);
      expect(heardStore.getState().heard.has(st.id)).toBe(true);
      await act(async () => {
        await run(p.end! - engine.getState().t + 0.3);
      });
    }
    expect(engine.getState().shiurId).toBe(expected[2]!.plays[0]!.shiurId);
    // The stories heard are now skipped by the button.
    await waitFor(() => expect(play.textContent).toBe(`Play ${expected.length - 3} stories`));
    await act(async () => {
      fireEvent.click(container.querySelector("button[data-action=heard-reset]")!);
    });
    expect(play.textContent).toBe(`Play ${index.stories.filter((s) => s.plays[0]?.t !== null).length} stories`);
  }, 120_000);
});

// ---------------------------------------------------------------------------------- story page

describe("the story page", () => {
  it("shows the merged retelling once under the label, then every telling", async () => {
    const { container } = await renderAt(`/en/maasios/${chizkiyahu.id}`);
    expect(container.querySelector("h1")!.textContent).toBe(chizkiyahu.title.en);
    expect(container.querySelectorAll("[data-corpus-label]")).toHaveLength(1);
    expect(container.textContent!.split(chizkiyahu.retelling.en).length - 1).toBe(1);
    const people = container.querySelector("[data-testid=story-people]")!;
    expect([...people.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual(["/en/p/yeshayahu-hanavi"]);
    expect([...people.querySelectorAll("[data-name]")].map((n) => n.textContent)).toEqual(["Chizkiyahu HaMelech", "Sancheiriv"]);
    const rows = [...container.querySelectorAll<HTMLElement>("[data-testid=story-tellings] > li")];
    expect(rows.map((r) => r.getAttribute("data-telling"))).toEqual(chizkiyahu.tellings.map((t) => t.momentId));
    for (const [i, t] of chizkiyahu.tellings.entries()) {
      const text = rows[i]!.textContent!;
      expect(text).toContain("Yiddish");
      expect(text).toContain(t.title);
      expect(text).toContain(t.chapterTitle!.en);
      expect(rows[i]!.querySelector("a")!.getAttribute("href")!.startsWith(`/en/s/${t.shiurId}`)).toBe(true);
    }
    expect(container.querySelector("[data-testid=story-attribution-varies]")).toBeNull();
    // Nothing but the story file until a telling is opened or played.
    expect(requested).toEqual([`/data/story/${chizkiyahu.id}.json`]);
    await noAxeViolations();
  });

  it("each telling's own retelling is collapsed and loaded from its shiur file on expand", async () => {
    const { container } = await renderAt(`/yi/maasios/${chizkiyahu.id}`);
    const row = container.querySelector<HTMLElement>(`[data-telling="${chizkiyahu.tellings[0]!.momentId}"]`)!;
    const toggle = row.querySelector<HTMLButtonElement>("button[data-action=own-retelling]")!;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(row.querySelector("[data-retelling]")!.hasAttribute("hidden")).toBe(true);
    await act(async () => {
      fireEvent.click(toggle);
    });
    await waitFor(() => expect(row.querySelector("[data-retelling] p[lang]")).not.toBeNull());
    const p = row.querySelector("[data-retelling] p[lang]")!;
    expect(p.getAttribute("lang")).toBe("yi");
    expect(p.textContent).not.toBe(chizkiyahu.retelling.yi);
    expect(requested).toEqual([`/data/story/${chizkiyahu.id}.json`, `/data/shiur/${chizkiyahu.tellings[0]!.shiurId}.json`]);
    await act(async () => {
      fireEvent.click(toggle);
    });
    expect(row.querySelector("[data-retelling]")!.hasAttribute("hidden")).toBe(true);
    await noAxeViolations();
  });

  it("the telling switcher: the play button starts with the filter's language, a row plays its own telling", async () => {
    settingsStore.getState().setAudio("en");
    const { container } = await renderAt(`/en/maasios/${BILINGUAL_ID}`);
    expect(container.querySelector("[data-testid=story-attribution-varies]")!.textContent).toBe("The tellings differ on whom this happened with.");
    const langs = [...container.querySelectorAll("[data-testid=story-tellings] > li")].map((li) => li.getAttribute("data-lang"));
    expect(langs).toEqual(["yi", "en", "yi"]);
    await act(async () => {
      fireEvent.click(container.querySelector("button[data-action=play]")!);
    });
    await waitFor(() => expect(personal.store.getState().queue.map((q) => q.momentId)).toEqual(["en-parsha-en-ky-sb-01~st1"]));
    const en = container.querySelector<HTMLElement>('[data-telling="en-parsha-en-ky-sb-01~st1"]')!;
    expect(en.getAttribute("aria-current")).toBe("true");
    // The end comes from the shiur file, so the telling stops where the story ends.
    expect(personal.store.getState().queue[0]!.end).toBeGreaterThan(2628.25);

    // Switch to the second Yiddish telling.
    const other = container.querySelector<HTMLElement>(`[data-telling="${chizkiyahu.tellings[1]!.momentId}"]`)!;
    await act(async () => {
      fireEvent.click(other.querySelector("button[data-action=play-telling]")!);
    });
    await waitFor(() => expect(other.getAttribute("aria-current")).toBe("true"));
    expect(en.getAttribute("aria-current")).toBeNull();
    await waitFor(() => expect(personal.store.getState().queue.map((q) => q.momentId)).toContain(chizkiyahu.tellings[1]!.momentId));
    expect(heardStore.getState().heard.has(BILINGUAL_ID)).toBe(true);
    await noAxeViolations();
  });

  it("a retired story id is a 404", async () => {
    const retired = "avrahams-dust-against-the-four-kings";
    expect(index.stories.some((s) => s.id === retired)).toBe(false);
    const { container, router } = await renderRaw(`/en/maasios/${retired}`);
    await waitFor(() => expect(container.textContent).toContain("There is no page at this address."));
    expect(router.state.location.pathname).toBe(`/en/maasios/${retired}`);
    expect(requested).toEqual([`/data/story/${retired}.json`]);
  });

  it("a story told once has no page: its id is a 404 too", async () => {
    const once = index.stories.find((s) => !s.page)!;
    const { container } = await renderRaw(`/en/maasios/${once.id}`);
    await waitFor(() => expect(container.textContent).toContain("There is no page at this address."));
  });
});
