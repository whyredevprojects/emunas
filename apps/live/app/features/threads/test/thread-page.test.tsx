// @vitest-environment jsdom
/**
 * The thread page (C3.3) in the real route tree, over the committed fixtures with a fetch spy. The mini
 * corpus has no thread of three shiurim, so two thread files are served beside the fixtures; their
 * members are real fixture insights, so playing them reads real ends from the shiur files.
 *
 * - heading "A teaching the Rav returns to", the label, the AI label once, the summary, topic links;
 * - timeline vs plain list (the build's flag), year order, the undated group last;
 * - each row: year, audio language, catalog title linking to the moment, section title, insight text;
 *   tapping the insight plays that moment;
 * - "Play the thread" queues the members in year order through the shiur-language filter, with a
 *   note on what was left out ("3 more in Yiddish");
 * - a two-shiur cluster has no file and its address is a 404; the route is noindex with no canonical;
 * - the page loads only its own file until something is played; axe finds no violations.
 */
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { formatHebrewYear } from "@emunas/i18n";
import axe from "axe-core";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { configureData, resetDataConfig, type DataFetch, type ThreadFile } from "../../../data/index.ts";
import { fixtureFetch } from "../../../data/fixtures/fetch.ts";
import { LIVE_DATA_SCHEMA_VERSION } from "../../../data/types.ts";
import { createPlayerEngine } from "../../../player-engine/engine.ts";
import { FakeAudio, FakeClock } from "../../../player-engine/test/fakes.ts";
import type { PlayerEngine, PlayerShiur } from "../../../player-engine/types.ts";
import { headTags } from "../../../seo/head.ts";
import { SeoHead } from "../../../seo/SeoHead.tsx";
import { classifyLivePath, isIndexable } from "../../../seo/policy.ts";
import { settingsStore } from "../../../shell/settings.ts";
import { createTestRouter } from "../../../shell/test-router.tsx";
import { MemoryBackend } from "../../../store/backend.ts";
import { createPersonal, setPersonal, type Personal } from "../../../store/personal.ts";
import { createQueuePlayer, setQueuePlayer } from "../../../store/queue-player.ts";
import { threadsEn, threadsYi } from "../strings.ts";

type Member = ThreadFile["members"][number];
const L = (en: string, yi = en) => ({ en, yi });

// Real fixture insights (ids, times, years and titles as the shiur files have them).
const PARSHA: Member = {
  shiurId: "yi-parshas-hashavua-hzynv-01",
  momentId: "yi-parshas-hashavua-hzynv-01~i4",
  t: 2528.94,
  year: 5732,
  lang: "yi",
  title: 'פרשה של אמונה. עשי"ת - זמן לנקות חציצות האמונה',
  chapterTitle: L("The shofar's hundred sounds", "די הונדערט קולות"),
  text: L("The hundred sounds of the shofar.", "די הונדערט קולות פונעם שופר."),
};
const MISC2: Member = {
  shiurId: "en-miscellaneous-en-02",
  momentId: "en-miscellaneous-en-02~i1",
  t: 555.04,
  year: 5735,
  lang: "en",
  title: "The Greatness of the חכמי התורה and the קדושה that Exists in their names",
  chapterTitle: L("A Chacham's name"),
  text: L("Saying a Chacham's name."),
};
const MISC1: Member = {
  shiurId: "en-miscellaneous-en-01",
  momentId: "en-miscellaneous-en-01~i0",
  t: 189.76,
  year: 5738,
  lang: "en",
  title: "פרק ששי: The קדושה of צדיקים and the חשיבות of Learning תורה",
  chapterTitle: null,
  text: L("The Mishnah names its Tannaim."),
};
const ZMANIM: Member = {
  shiurId: "en-zmanim-en-chvdsh-tbs-02",
  momentId: "en-zmanim-en-chvdsh-tbs-02~i3",
  t: 2454.48,
  year: 5764,
  lang: "en",
  title: "An Explanation of ניטל and the Month of טבת",
  chapterTitle: L("The last galus"),
  text: L("The Jews of the last galus are the most precious."),
};
const SHONOS: Member = {
  shiurId: "yi-shonos-31",
  momentId: "yi-shonos-31~i6",
  t: 2014.07,
  year: 5771,
  lang: "yi",
  title: "חשיבות מסירת נפש בזמננו",
  chapterTitle: null,
  text: L("The 101st review.", "די הונדערט און ערשטע חזרה."),
};
const UNDATED: Member = {
  shiurId: "yi-zmanim-svds-pvrym-ktn-03",
  momentId: "yi-zmanim-svds-pvrym-ktn-03~i5",
  t: 1761.78,
  year: null,
  lang: "yi",
  title: "האור של מגילת אסתר יותר נעלה מאור של תורת משה (חתם סופר)",
  chapterTitle: null,
  text: L("A small avodah of a Jew today."),
};
const ENDS: Record<string, number> = {
  [PARSHA.momentId]: 2603,
  [MISC2.momentId]: 586,
  [MISC1.momentId]: 251.66,
  [ZMANIM.momentId]: 2512.11,
  [SHONOS.momentId]: 2048.45,
  [UNDATED.momentId]: 1780.46,
};

const TIMELINE_ID = "test-thread-timeline";
const LIST_ID = "test-thread-list";

/** Members deliberately out of order: the page orders them. */
const timelineFile: ThreadFile = {
  schemaVersion: LIVE_DATA_SCHEMA_VERSION,
  id: TIMELINE_ID,
  label: L("A name is the essence", "א נאמען איז דער עצם"),
  summary: L("The shiurim draw different lessons from the same point.", "די שיעורים לערנען ארויס פארשידענע זאכן."),
  reviewed: false,
  topics: [{ id: "ahavas-hashem", label: { en: "Love of Hashem", yi: "אהבת השם" } }],
  members: [SHONOS, UNDATED, MISC1, PARSHA, ZMANIM, MISC2],
  shiurCount: 6,
  datedCount: 5,
  years: [5732, 5771],
  timeline: true,
};

const listFile: ThreadFile = {
  ...timelineFile,
  id: LIST_ID,
  label: L("Few dates"),
  members: [UNDATED, MISC1, SHONOS],
  shiurCount: 3,
  datedCount: 2,
  years: [5738, 5771],
  timeline: false,
};

/** A two-shiur cluster in the mini corpus: shown as a line at the insight, it has no thread file. */
const TWO_MEMBER_ID = "zmanim-small-avodah-today-precious";

let requested: string[] = [];
const spy: DataFetch = async (input, init) => {
  const path = new URL(input, "http://x.invalid").pathname;
  requested.push(path);
  for (const f of [timelineFile, listFile]) {
    if (path === `/data/thread/${f.id}.json`) {
      return new Response(JSON.stringify(f), { status: 200, headers: { "content-type": "application/json" } });
    }
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

async function renderAt(path: string) {
  const router = createTestRouter(path);
  const utils = render(<RouterProvider router={router} />);
  await act(async () => {});
  await waitFor(() => expect(utils.container.querySelector("article[aria-busy=false]")).not.toBeNull());
  return { router, ...utils };
}

async function noAxeViolations(): Promise<void> {
  const result = await axe.run(document, { rules: { "color-contrast": { enabled: false }, "document-title": { enabled: false } } });
  expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

const rows = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>("[data-testid=thread-members] li[data-member]")];
const rowIds = (c: HTMLElement) => rows(c).map((li) => li.getAttribute("data-member"));
const queueIds = () => personal.store.getState().queue.map((q) => q.momentId);

// ---------------------------------------------------------------------------------- the page

describe("the thread page", () => {
  it("shows the heading, the label, the AI label once, the summary and the topics, from its own file only", async () => {
    const { container } = await renderAt(`/en/th/${TIMELINE_ID}`);
    const article = container.querySelector("article")!;
    expect(article.querySelector("[data-testid=thread-heading]")!.textContent).toBe("A teaching the Rav returns to");
    expect(article.querySelectorAll("h1")).toHaveLength(1);
    expect(article.querySelector("h1")!.textContent).toBe("A name is the essence");
    expect(article.querySelectorAll("[data-corpus-label]")).toHaveLength(1);
    expect(article.querySelector("[data-corpus-label]")!.getAttribute("data-corpus-label")).toBe("ai");
    expect(article.textContent).toContain("The shiurim draw different lessons from the same point.");
    expect(article.querySelector("[data-testid=thread-count]")!.textContent).toMatch(/^In 6 shiurim · .+ to .+$/u);
    expect(article.querySelector('[data-topic-link="ahavas-hashem"]')!.getAttribute("href")).toBe("/en/t/ahavas-hashem");
    expect(requested).toEqual([`/data/thread/${TIMELINE_ID}.json`]);
    await noAxeViolations();
  });

  it("puts three or more dated members on a year line, earliest first, the undated group last", async () => {
    const { container } = await renderAt(`/en/th/${TIMELINE_ID}`);
    const members = container.querySelector<HTMLElement>("[data-testid=thread-members]")!;
    expect(members.getAttribute("data-layout")).toBe("timeline");
    const years = [...members.querySelectorAll("li[data-year]")].map((li) => Number(li.getAttribute("data-year")));
    expect(years).toEqual([5732, 5735, 5738, 5764, 5771]);
    expect(rowIds(container)).toEqual([PARSHA, MISC2, MISC1, ZMANIM, SHONOS, UNDATED].map((m) => m.momentId));
    const undated = members.querySelector<HTMLElement>("[data-testid=thread-undated]")!;
    expect(undated.querySelector("h3")!.textContent).toBe("Year not known");
    expect([...undated.querySelectorAll("li[data-member]")].map((li) => li.getAttribute("data-member"))).toEqual([UNDATED.momentId]);
    expect(members.lastElementChild).toBe(undated);
  });

  it("shows a plain list when the build says the thread has too few dated members, undated still last", async () => {
    const { container } = await renderAt(`/en/th/${LIST_ID}`);
    const members = container.querySelector<HTMLElement>("[data-testid=thread-members]")!;
    expect(members.getAttribute("data-layout")).toBe("list");
    expect(members.querySelector("li[data-year]")).toBeNull();
    expect(rowIds(container)).toEqual([MISC1, SHONOS, UNDATED].map((m) => m.momentId));
    expect(members.lastElementChild!.getAttribute("data-testid")).toBe("thread-undated");
    await noAxeViolations();
  });

  it("each row: year, audio language, catalog title linking to the moment, section title, the insight", async () => {
    const { container } = await renderAt(`/en/th/${TIMELINE_ID}`);
    const row = container.querySelector<HTMLElement>(`li[data-member="${PARSHA.momentId}"]`)!;
    expect(row.getAttribute("data-lang")).toBe("yi");
    expect(row.querySelector("[data-year]")!.textContent).toBe(formatHebrewYear(5732, "en"));
    expect(row.querySelector("[data-lang-mark]")!.textContent).toBe("Yiddish");
    const link = row.querySelector("a[data-moment]")!;
    expect(link.textContent).toBe(PARSHA.title);
    expect(link.getAttribute("href")).toBe(`/en/s/${PARSHA.shiurId}?t=2528.94&m=${PARSHA.momentId}`);
    expect(row.textContent).toContain("The shofar's hundred sounds");
    expect(row.querySelector("button[data-action=play-member]")!.textContent).toContain("The hundred sounds of the shofar.");
    const undated = container.querySelector<HTMLElement>(`li[data-member="${UNDATED.momentId}"]`)!;
    expect(undated.querySelector("[data-year]")!.textContent).toBe("Year not known");
  });

  it("a Yiddish page shows the Yiddish heading and insight text", async () => {
    const { container } = await renderAt(`/yi/th/${TIMELINE_ID}`);
    expect(container.querySelector("[data-testid=thread-heading]")!.textContent).toBe("א לימוד צו וועלכן דער משגיח קומט צוריק");
    expect(container.querySelector("h1")!.textContent).toBe("א נאמען איז דער עצם");
    expect(container.querySelector(`li[data-member="${PARSHA.momentId}"]`)!.textContent).toContain("די הונדערט קולות פונעם שופר.");
  });
});

// ---------------------------------------------------------------------------------- playing

describe("playing the thread", () => {
  it("with both languages queues every member in year order, undated last, with the insights' ends", async () => {
    const { container } = await renderAt(`/en/th/${TIMELINE_ID}`);
    expect(container.querySelector("[data-testid=thread-left-out]")).toBeNull();
    const play = container.querySelector<HTMLButtonElement>("button[data-action=play-thread]")!;
    expect(play.textContent).toBe("Play the thread (6 shiurim)");
    fireEvent.click(play);
    const order = [PARSHA, MISC2, MISC1, ZMANIM, SHONOS, UNDATED];
    await waitFor(() => expect(queueIds()).toEqual(order.map((m) => m.momentId)));
    const queue = personal.store.getState().queue;
    expect(queue.map((q) => [q.shiurId, q.start, q.end])).toEqual(order.map((m) => [m.shiurId, m.t, ENDS[m.momentId]]));
    await waitFor(() => expect(container.querySelector("[role=status]")!.textContent).toBe("Playing 6 parts in the queue."));
  });

  it("honours the shiur-language filter and says how many were left out", async () => {
    settingsStore.getState().setAudio("en");
    const { container } = await renderAt(`/en/th/${TIMELINE_ID}`);
    expect(container.querySelector("[data-testid=thread-left-out]")!.textContent).toBe(
      "3 more in Yiddish. Not played: your shiur language setting.",
    );
    // The members stay on the page whatever the filter: language is a property of each row.
    expect(rows(container)).toHaveLength(6);
    const play = container.querySelector<HTMLButtonElement>("button[data-action=play-thread]")!;
    expect(play.textContent).toBe("Play the thread (3 shiurim)");
    fireEvent.click(play);
    await waitFor(() => expect(queueIds()).toEqual([MISC2, MISC1, ZMANIM].map((m) => m.momentId)));
  });

  it("the note in Yiddish, and no play button when nothing is in the listener's language", async () => {
    settingsStore.getState().setAudio("en");
    const yiOnly: ThreadFile = { ...listFile, members: [PARSHA, SHONOS, UNDATED] };
    configureData({
      fetch: async (input, init) => {
        const path = new URL(input, "http://x.invalid").pathname;
        requested.push(path);
        if (path === `/data/thread/${LIST_ID}.json`) return new Response(JSON.stringify(yiOnly), { status: 200 });
        return fixtureFetch(input, init);
      },
    });
    const { container } = await renderAt(`/yi/th/${LIST_ID}`);
    expect(container.querySelector("[data-testid=thread-left-out]")!.textContent).toContain("נאך 3 אויף אידיש");
    expect(container.querySelector("button[data-action=play-thread]")).toBeNull();
  });

  it("tapping a row's insight plays that moment", async () => {
    const { container } = await renderAt(`/en/th/${TIMELINE_ID}`);
    const row = container.querySelector<HTMLElement>(`li[data-member="${ZMANIM.momentId}"]`)!;
    fireEvent.click(row.querySelector<HTMLButtonElement>("button[data-action=play-member]")!);
    await waitFor(() => expect(queueIds()).toEqual([ZMANIM.momentId]));
    expect(personal.store.getState().queue[0]).toMatchObject({ shiurId: ZMANIM.shiurId, start: ZMANIM.t, end: ENDS[ZMANIM.momentId] });
    await waitFor(() => expect(row.getAttribute("aria-current")).toBe("true"));
    expect(requested).toContain(`/data/shiur/${ZMANIM.shiurId}.json`);
  });
});

// ---------------------------------------------------------------------------------- 404 and noindex

describe("addresses", () => {
  it("a two-shiur cluster has no page: its address is a 404 after one request", async () => {
    const insight = await (await fixtureFetch("/data/shiur/en-zmanim-en-chvdsh-tbs-02.json")).json();
    expect(insight.corpus.insights.find((x: { threadId: string }) => x.threadId === TWO_MEMBER_ID)).toMatchObject({ shiurCount: 2, page: false });
    const { container } = await renderAt(`/en/th/${TWO_MEMBER_ID}`);
    expect(container.querySelector("h1")!.textContent).toBe("Page not found");
    expect(container.querySelector("[data-corpus-label]")).toBeNull();
    expect(container.querySelector("[data-testid=thread-members]")).toBeNull();
    expect(requested).toEqual([`/data/thread/${TWO_MEMBER_ID}.json`]);
  });

  it("the route is noindex with no canonical, with or without build-time page data", async () => {
    const hosts = { quiet: "https://example.org", live: "https://listen.example.org" };
    for (const path of [`/en/th/${TIMELINE_ID}`, `/yi/th/${TWO_MEMBER_ID}`]) {
      const info = classifyLivePath(path);
      expect(info.kind).toBe("thread");
      expect(isIndexable(info.kind)).toBe(false);
      const tags = headTags(path, { hosts, page: null });
      expect(tags).toContainEqual({ tag: "meta", name: "robots", content: "noindex" });
      expect(tags.some((t) => t.tag === "link")).toBe(false);
    }
    // Rendered the way the root layout renders it.
    const router = createMemoryRouter([{ path: "*", Component: SeoHead }], { initialEntries: [`/en/th/${TIMELINE_ID}`] });
    render(<RouterProvider router={router} />);
    await act(async () => {});
    expect(document.querySelector('meta[name="robots"]')!.getAttribute("content")).toBe("noindex");
    expect(document.querySelector('link[rel="canonical"]')).toBeNull();
  });
});

// ---------------------------------------------------------------------------------- wording

describe("wording", () => {
  it("never claims the wording is the same, that the Rav always says it, or pairs languages", () => {
    const all = JSON.stringify([threadsEn, threadsYi]);
    expect(all).not.toMatch(/same words|same wording|word for word|always says|counterpart|translation|other language/iu);
  });
});
