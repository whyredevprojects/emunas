// @vitest-environment jsdom
/**
 * Topic pages in the real route tree with a fetch spy over the committed fixtures (and fixture
 * copies with the parts the mini corpus lacks): every part renders in order, a null description is
 * absent, opening the page loads only `topic/<id>.json`, two-shiur threads are lines and not links,
 * "touched on in" rows link straight to their section, further rows load on request, and the mix
 * plays, saves and shares through the moment queue and the playlist link.
 */
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import axe from "axe-core";
import { RouterProvider } from "react-router";
import { createStore } from "zustand";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { clearDataCache, configureData, resetDataConfig, type DataFetch, type TopicFile, type TopicShiurimFile } from "../../../data/index.ts";
import { fixtureFetch } from "../../../data/fixtures/fetch.ts";
import { settingsStore } from "../../../shell/settings.ts";
import { createTestRouter } from "../../../shell/test-router.tsx";
import { MemoryBackend } from "../../../store/backend.ts";
import { decodePlaylist } from "../../../store/playlist-link.ts";
import { createPersonal, setPersonal, type Personal } from "../../../store/personal.ts";
import { setQueuePlayer, type QueuePlayer, type QueuePlayerState } from "../../../store/queue-player.ts";
import { MIX_SIZE } from "../../mix/model.ts";
import { MIX_CLASSES } from "../../mix/styles.ts";
import { TOPICS_CLASSES } from "../styles.ts";
import hischadshus from "../../../data/fixtures/data/topic/hischadshus.json" with { type: "json" };
import avodas from "../../../data/fixtures/data/topic/avodas-hashem.json" with { type: "json" };
import avodasPage from "../../../data/fixtures/data/topic/avodas-hashem.moments-1.json" with { type: "json" };
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

let requested: string[] = [];
let overrides = new Map<string, unknown>();
const spy: DataFetch = (input, init) => {
  const path = new URL(input, "http://x.invalid").pathname;
  requested.push(path);
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
  document.documentElement.removeAttribute("lang");
  document.documentElement.removeAttribute("dir");
});

afterAll(() => resetDataConfig());

async function renderAt(path: string) {
  const router = createTestRouter(path);
  const utils = render(<RouterProvider router={router} />);
  await act(async () => {});
  await waitFor(() => expect(utils.container.querySelector("article[data-topic][aria-busy=false]")).not.toBeNull());
  return { router, ...utils };
}

async function noAxeViolations(): Promise<void> {
  const result = await axe.run(document, { rules: { "color-contrast": { enabled: false }, "document-title": { enabled: false } } });
  expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

const clone = <T,>(x: T): T => structuredClone(x);

/** A fixture topic with every part present: page threads and stories, a two-shiur thread, chips, paging. */
function fullTopic(): TopicFile {
  const f = clone(hischadshus) as TopicFile;
  f.threads = [
    { id: "hiding-within-hiding", label: { en: "Hiding within hiding", yi: "הסתר בתוך הסתר" }, shiurCount: 5, page: true },
    { id: "kotzker-reply", label: { en: "The Kotzker's reply", yi: "דעם קאצקער'ס תשובה" }, shiurCount: 2, page: false },
  ];
  f.threadTotal = 4;
  f.stories = [
    { id: "sugar-sled", title: { en: "The sugar sled", yi: "די צוקער שליטן" }, tellings: 3, page: true },
    { id: "one-telling", title: { en: "Told once", yi: "איינמאל" }, tellings: 1, page: false },
  ];
  f.storyTotal = 2;
  f.children = [{ id: "bitachon", label: { en: "Bitachon", yi: "בטחון" }, count: 4 }];
  f.coTopics = [{ id: "emunah", label: { en: "Emunah", yi: "אמונה" }, sections: 3 }];
  f.person = { id: "avraham-avinu", label: { en: "Avraham Avinu", yi: "אברהם אבינו" }, page: true };
  f.shiurPages = 1;
  f.shiurTotal = f.shiurim.length + 1;
  return f;
}

describe("topic page", () => {
  it("renders every part in order from the topic file alone", async () => {
    const f = fullTopic();
    overrides.set(`/data/topic/${f.id}.json`, f);
    const { container } = await renderAt(`/en/t/${f.id}`);
    const article = container.querySelector("article[data-topic]")!;
    expect(article.querySelector("h1")!.textContent).toBe(f.label.en);
    expect(article.querySelector("[data-testid=topic-breadcrumb] a")!.getAttribute("href")).toBe(`/en/t/${f.breadcrumb[0]!.id}`);
    // the AI label sits once, under the title
    expect(container.querySelectorAll("[data-corpus-label]")).toHaveLength(1);
    expect(container.querySelector("[data-corpus-label]")!.getAttribute("data-corpus-label")).toBe("ai");
    expect(article.textContent).toContain(f.description!.en);
    expect(article.querySelector(`[data-term="${f.term!.conceptId}"]`)!.textContent).toContain(f.term!.definition.en);
    expect(article.querySelector('[data-person="avraham-avinu"]')!.getAttribute("href")).toBe("/en/p/avraham-avinu");

    // order: mix, start here, threads, stories, all shiurim, sub-topics, often together
    const order = ["topic-mix", "topic-hubs", "topic-threads", "topic-stories", "topic-shiurim", "topic-children", "topic-cotopics"].map((id) => {
      const el = article.querySelector(`[data-testid=${id}]`);
      expect(el, id).not.toBeNull();
      return el!;
    });
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(article.querySelectorAll("[data-testid=topic-hubs] a[data-shiur]")).toHaveLength(f.hubs.length);

    // a thread with a page links to it; a two-shiur thread is a line, not a link
    expect(article.querySelector('[data-thread="hiding-within-hiding"] a')!.getAttribute("href")).toBe("/en/th/hiding-within-hiding");
    expect(article.querySelector('[data-thread="kotzker-reply"] a')).toBeNull();
    expect(article.querySelector('[data-thread="kotzker-reply"]')!.textContent).toContain("The Kotzker's reply");
    expect(article.querySelector("[data-testid=topic-threads]")!.parentElement!.textContent).toContain("and 2 more");
    expect(article.querySelector('[data-story="sugar-sled"] a')!.getAttribute("href")).toBe("/en/maasios/sugar-sled");
    expect(article.querySelector('[data-story="one-telling"] a')).toBeNull();
    expect(article.querySelector('[data-topic-link="bitachon"]')!.getAttribute("href")).toBe("/en/t/bitachon");
    expect(article.querySelector('[data-topic-link="emunah"]')!.getAttribute("href")).toBe("/en/t/emunah");

    // opening the page loaded the topic file and nothing else
    expect(requested).toEqual([`/data/topic/${f.id}.json`]);
    await noAxeViolations();
  });

  it("all shiurim: main, discussed, then 'touched on in' rows that link to the tagged section; more on request", async () => {
    const f = fullTopic();
    overrides.set(`/data/topic/${f.id}.json`, f);
    const extra: TopicShiurimFile = {
      schemaVersion: f.schemaVersion,
      topicId: f.id,
      page: 1,
      shiurim: [{ id: "en-extra-01", lang: "en", title: "An extra shiur", year: null, grade: "touched", salience: 0, section: { id: "en-extra-01~s2", t: 75, title: { en: "A part", yi: "א טייל" }, count: 2 } }],
    };
    overrides.set(`/data/topic-shiurim/${f.id}.1.json`, extra);
    const { container } = await renderAt(`/en/t/${f.id}`);
    const list = container.querySelector("[data-testid=topic-shiurim]")!;
    const ids = [...list.querySelectorAll("[data-shiur-row]")].map((li) => li.getAttribute("data-shiur-row"));
    expect(ids).toEqual(f.shiurim.map((r) => r.id));
    const grades = [...list.querySelectorAll("ul[data-grade]")].map((ul) => ul.getAttribute("data-grade"));
    expect(grades).toEqual(["main", "discussed", "touched"].filter((g) => f.shiurim.some((r) => r.grade === g)));
    const touched = f.shiurim.find((r) => r.grade === "touched")!;
    const a = list.querySelector(`[data-shiur-row="${touched.id}"] a`)!;
    expect(a.getAttribute("href")).toBe(`/en/s/${touched.id}?t=${Math.round(touched.section!.t * 1000) / 1000}&m=${encodeURIComponent(touched.section!.id).replace(/%7E/gu, "~")}`);
    const main = f.shiurim.find((r) => r.grade === "main")!;
    expect(list.querySelector(`[data-shiur-row="${main.id}"] a`)!.getAttribute("href")).toBe(`/en/s/${main.id}`);
    // each row carries its own language
    for (const li of list.querySelectorAll("[data-shiur-row]")) expect(["en", "yi"]).toContain(li.getAttribute("data-lang"));

    expect(requested).toEqual([`/data/topic/${f.id}.json`]);
    await act(async () => {
      fireEvent.click(container.querySelector("[data-testid=topic-shiurim-more]")!);
    });
    await waitFor(() => expect(list.querySelector('[data-shiur-row="en-extra-01"]')).not.toBeNull());
    expect(requested).toEqual([`/data/topic/${f.id}.json`, `/data/topic-shiurim/${f.id}.1.json`]);
    expect(container.querySelector("[data-testid=topic-shiurim-more]")).toBeNull();
    expect(list.querySelector('[data-shiur-row="en-extra-01"]')!.textContent).toContain("and 1 more section");
  });

  it("a null description is absent and the label stands alone", async () => {
    const f = clone(hischadshus) as TopicFile;
    f.description = null;
    f.term = null;
    overrides.set(`/data/topic/${f.id}.json`, f);
    const { container } = await renderAt(`/en/t/${f.id}`);
    expect(container.querySelector("article h1")!.textContent).toBe(f.label.en);
    expect(container.textContent).not.toContain(hischadshus.description!.en);
    expect(container.querySelector("[data-term]")).toBeNull();
    expect(container.querySelectorAll("[data-corpus-label]")).toHaveLength(1);
  });

  it("a reviewed topic swaps in the reviewed label", async () => {
    const f = clone(hischadshus) as TopicFile;
    f.reviewed = true;
    overrides.set(`/data/topic/${f.id}.json`, f);
    const { container } = await renderAt(`/en/t/${f.id}`);
    expect(container.querySelector("[data-corpus-label]")!.getAttribute("data-corpus-label")).toBe("reviewed");
  });

  it("an unknown topic is not found after one request", async () => {
    const { container } = await renderAt("/en/t/no-such-topic");
    expect(container.querySelector("article[data-topic]")!.textContent).toContain("There is no page at this address.");
    expect(requested).toEqual(["/data/topic/no-such-topic.json"]);
    expect(container.querySelector("[data-corpus-label]")).toBeNull();
  });

  it("renders mirrored in Yiddish with the label in Yiddish and no axe violations", async () => {
    const { container } = await renderAt(`/yi/t/${hischadshus.id}`);
    expect(container.querySelector("[data-ui=yi]")!.getAttribute("dir")).toBe("rtl");
    expect(container.querySelector("article h1")!.textContent).toBe(hischadshus.label.yi);
    await noAxeViolations();
  });
});

describe("topic mix on the page", () => {
  it("states sections, shiurim and duration, and is labelled as assembled from AI tags", async () => {
    const { container } = await renderAt(`/en/t/${avodas.id}`);
    const header = container.querySelector("[data-testid=mix-header]")!;
    expect(header.getAttribute("data-sections")).toBe(String(avodas.momentTotal));
    expect(header.getAttribute("data-shiurim")).toBe(String(avodas.momentShiurim));
    expect(header.textContent).toContain(`${avodas.momentTotal} sections from ${avodas.momentShiurim} shiurim.`);
    expect(header.textContent).toMatch(/Playing 12, about \d+ minutes\./u);
    expect(container.querySelector("[data-mix-label=auto]")!.textContent).toContain("AI tags");
    const items = [...container.querySelectorAll("[data-testid=mix-items] [data-moment]")];
    expect(items).toHaveLength(MIX_SIZE);
    // one per shiur first
    const shiurim = items.map((li) => li.getAttribute("data-moment")!.split("~")[0]);
    expect(new Set(shiurim).size).toBe(Math.min(MIX_SIZE, avodas.momentShiurim));
    expect(requested).toEqual([`/data/topic/${avodas.id}.json`]);
  });

  it("follows the listener's language filter and loads the moment pages only when play needs them", async () => {
    settingsStore.getState().setAudio("en");
    const { container } = await renderAt(`/en/t/${avodas.id}`);
    const header = container.querySelector("[data-testid=mix-header]")!;
    expect(header.getAttribute("data-sections")).toBe(String(avodas.momentLangs.en.sections));
    expect(header.getAttribute("data-shiurim")).toBe(String(avodas.momentLangs.en.shiurim));
    for (const li of container.querySelectorAll("[data-testid=mix-items] [data-moment]")) expect(li.getAttribute("data-lang")).toBe("en");
    const firstEn = avodas.moments.filter((m) => m.lang === "en");
    expect(firstEn.length).toBeLessThan(MIX_SIZE);
    expect(requested).toEqual([`/data/topic/${avodas.id}.json`]);

    await act(async () => {
      fireEvent.click(container.querySelector("[data-testid=mix-play]")!);
    });
    await waitFor(() => expect(played).toHaveLength(1));
    expect(requested).toEqual([`/data/topic/${avodas.id}.json`, `/data/topic/${avodas.id}.moments-1.json`]);
    const queue = personal.store.getState().queue;
    const enPool = [...avodas.moments, ...avodasPage.moments].filter((m) => m.lang === "en");
    expect(queue).toHaveLength(Math.min(MIX_SIZE, enPool.length));
    expect(played[0]).toBe(queue[0]!.key);
    const byId = new Map(enPool.map((m) => [m.id, m]));
    for (const q of queue) {
      const m = byId.get(q.momentId!)!;
      expect(m, q.momentId!).toBeDefined();
      expect([q.shiurId, q.start, q.end]).toEqual([m.shiurId, m.t, m.end]);
    }
  });

  it("saves as a playlist and shares as a playlist link with the same items", async () => {
    const { container } = await renderAt(`/en/t/${avodas.id}`);
    const shown = [...container.querySelectorAll("[data-testid=mix-items] [data-moment]")].map((li) => li.getAttribute("data-moment"));
    await act(async () => {
      fireEvent.click(container.querySelector("[data-testid=mix-save]")!);
    });
    await waitFor(() => expect(personal.store.getState().playlists).toHaveLength(1));
    const pl = personal.store.getState().playlists[0]!;
    expect(pl.name).toBe(`${avodas.label.en} (mix)`);
    expect(pl.items.map((x) => x.momentId)).toEqual(shown);

    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await act(async () => {
      fireEvent.click(container.querySelector("[data-testid=mix-share]")!);
    });
    const input = await waitFor(() => {
      const el = container.querySelector<HTMLInputElement>("[data-testid=mix-link]");
      expect(el).not.toBeNull();
      return el!;
    });
    const url = new URL(input.value);
    expect(url.pathname).toBe("/en/pl");
    const decoded = decodePlaylist(url.hash.slice(1))!;
    expect(decoded.map((d) => [d.shiurId, d.start, d.end])).toEqual(pl.items.map((x) => [x.shiurId, Math.round(x.start * 10) / 10, Math.round(x.end! * 10) / 10]));
    expect(writeText).toHaveBeenCalledWith(input.value);
  });
});

describe("styles", () => {
  it("every class the components use exists in the CSS modules", () => {
    const css = (f: string) => readFileSync(join(here, f), "utf8");
    const topics = css("../Topics.module.css");
    for (const c of TOPICS_CLASSES) expect(topics, c).toMatch(new RegExp(`\\.${c}\\b`, "u"));
    const mix = css("../../mix/Mix.module.css");
    for (const c of MIX_CLASSES) expect(mix, c).toMatch(new RegExp(`\\.${c}\\b`, "u"));
  });
});
