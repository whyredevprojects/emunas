// @vitest-environment jsdom
/**
 * The listening room on the corpus layer (corpus-wave-plan C3.2; concept-live-corpus D, C.1, E.2,
 * F.1, G), through the real route table with the committed fixtures and a fetch spy:
 * - first render needs only `shiur/<id>.json` (and the lazy write-up); a topic chip opens the topic
 *   beside the shiur and fetches `topic/<id>.json` on that tap, with the audio still playing;
 * - the header's top three topics; chapter topic chips; the corpus label once;
 * - thread marks (a page thread links to it; a two-shiur thread is an inline line with play);
 * - "told in N other shiurim"; sources grouped by merged work; Related in its order, no counterpart;
 * - the end of a shiur offers the next part, a thread or the top topic, and plays nothing by itself;
 * - axe.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import axe from "axe-core";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RouterProvider } from "react-router";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { configureData, resetDataConfig, type DataFetch, type ShiurFile } from "./data.ts";
import { brshys03, fixtureFetch, misc01, misc01WithThread, tanya, tvbb } from "./test-fixtures.ts";
import { createPlayerEngine, type PlayerEngine } from "../../player-engine/index.ts";
import { FakeAudio, FakeClock, fakeMediaSession } from "../../player-engine/test/fakes.ts";
import { appDescribe, installEngine } from "../../player-ui/index.ts";
import { settingsStore } from "../../shell/settings.ts";
import { createTestRouter } from "../../shell/test-router.tsx";

let clock: FakeClock;
let engine: PlayerEngine;
let requested: string[] = [];
/** Shiur files served instead of the committed fixture (by id). */
let overrides = new Map<string, ShiurFile>();

const spy: DataFetch = async (input, init) => {
  const path = new URL(input, "http://x.invalid").pathname;
  requested.push(path);
  const m = /^\/data\/shiur\/(.+)\.json$/u.exec(path);
  const over = m ? overrides.get(m[1]!) : undefined;
  if (over) return new Response(JSON.stringify(over), { status: 200, headers: { "content-type": "application/json" } });
  return fixtureFetch(input, init);
};

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
});

afterAll(() => {
  resetDataConfig();
  installEngine(null);
});

/** A fresh engine; every media URL loads with `length` seconds. */
function freshEngine(length = 5000): void {
  clock = new FakeClock();
  const durations = new Proxy({} as Record<string, number>, { get: () => length });
  engine = createPlayerEngine({
    audio: new FakeAudio(clock, durations),
    clock,
    mediaSession: fakeMediaSession().env,
    lifecycle: null,
    describe: appDescribe,
  });
  installEngine(engine);
}

beforeEach(() => {
  requested = [];
  overrides = new Map();
  configureData({ fetch: spy });
  settingsStore.getState().reset();
  freshEngine();
});

afterEach(() => {
  cleanup();
  engine.destroy();
});

async function settle(): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      clock.flush();
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

async function openAt(path: string) {
  const router = createTestRouter(path);
  const utils = render(<RouterProvider router={router} />);
  await settle();
  await screen.findByRole("tablist");
  await settle();
  return { router, ...utils };
}

async function tab(name: string): Promise<HTMLElement> {
  fireEvent.click(screen.getByRole("tab", { name }));
  await settle();
  return screen.getByRole("tabpanel");
}

const AXE = { rules: { "color-contrast": { enabled: false }, "document-title": { enabled: false }, region: { enabled: false } } };

describe("first render needs only the shiur file", () => {
  it("requests shiur/<id>.json (and the lazy write-up), then topic/<id>.json on a chip tap", async () => {
    const { container } = await openAt("/en/s/yi-zmanim-tv-bb-04");
    expect(requested).toContain("/data/shiur/yi-zmanim-tv-bb-04.json");
    expect(requested.filter((p) => p !== "/data/shiur/yi-zmanim-tv-bb-04.json" && !p.startsWith("/data/writeup/yi-zmanim-tv-bb-04."))).toEqual([]);
    // Topic chips, thread marks and story counts are on the page already.
    expect(container.querySelectorAll("[data-topic-chip]").length).toBeGreaterThan(3);

    // Play, then open a chapter's topic: the topic file is the one new request, the audio goes on.
    fireEvent.click(screen.getByRole("button", { name: "Play this shiur" }));
    await settle();
    await act(async () => clock.tick(1000));
    const before = requested.length;
    const chip = container.querySelector<HTMLButtonElement>("[data-chapter-topics='0'] [data-topic-chip='yiras-shamayim']")!;
    expect(chip.getAttribute("aria-haspopup")).toBe("dialog");
    fireEvent.click(chip);
    await settle();
    const pane = await screen.findByRole("dialog");
    expect(pane.getAttribute("data-topic-pane")).toBe("yiras-shamayim");
    await waitFor(() => expect(within(pane).getByRole("heading", { level: 1 }).textContent).toContain("Yiras Shamayim"));
    expect(requested.slice(before)).toEqual(["/data/topic/yiras-shamayim.json"]);
    expect(within(pane).getByRole("link", { name: "Open the topic page" }).getAttribute("href")).toBe("/en/t/yiras-shamayim");
    const t0 = engine.getState().t;
    await act(async () => clock.tick(2000));
    expect(engine.getState().status).toBe("playing");
    expect(engine.getState().shiurId).toBe(tvbb.id);
    expect(engine.getState().t).toBeGreaterThan(t0);

    fireEvent.click(within(pane).getByRole("button", { name: "Close" }));
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(engine.getState().status).toBe("playing");
  });

  it("the pane is a side pane, and a sheet on a phone (stylesheet)", () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "Room.module.css"), "utf8");
    expect(css).toMatch(/\.pane \{[^}]*inset-inline-end: 0;/u);
    expect(css).toMatch(/@media \(max-width: 40rem\) \{\s*\.pane \{[^}]*inset-block: auto 0;/u);
  });
});

describe("header and chapters", () => {
  it("shows the top three topics as one line and the corpus label once", async () => {
    const { container } = await openAt("/en/s/yi-zmanim-tv-bb-04");
    const nav = screen.getByRole("navigation", { name: "Topics of this shiur" });
    expect([...nav.querySelectorAll("[data-topic-chip]")].map((b) => b.getAttribute("data-topic-chip"))).toEqual([
      "tu-bav-nechamah",
      "yiras-shamayim",
      "tachlis-hagalus",
    ]);
    expect(container.querySelectorAll("[data-corpus-label]")).toHaveLength(1);
    fireEvent.click(within(nav).getByRole("button", { name: tvbb.corpus!.topicLabels["tu-bav-nechamah"]!.label.en }));
    await settle();
    expect((await screen.findByRole("dialog")).getAttribute("data-topic-pane")).toBe("tu-bav-nechamah");
  });

  it("gives each chapter its topic chips and none to a chapter without tags", async () => {
    const { container } = await openAt("/en/s/yi-zmanim-tv-bb-04");
    const chips = (idx: number) => [...container.querySelectorAll(`[data-chapter-topics='${idx}'] [data-topic-chip]`)].map((b) => b.getAttribute("data-topic-chip"));
    expect(chips(0)).toEqual(["yiras-shamayim", "sefer-devarim", "teshuvah"]);
    expect(container.querySelector("[data-chapter-topics='2']")).toBeNull();
  });

  it("a catalog-only shiur has no topic line, chips or corpus label", async () => {
    const { container } = await openAt("/en/s/yi-tanya-1-01");
    expect(container.querySelector("[data-room-topics]")).toBeNull();
    expect(container.querySelector("[data-topic-chip]")).toBeNull();
    expect(container.querySelector("[data-corpus-label]")).toBeNull();
  });
});

describe("insights: thread marks", () => {
  it("a thread with a page: 'taught in N other shiurim, Y1 to Y2' opens the thread", async () => {
    overrides.set(misc01.id, misc01WithThread());
    await openAt(`/en/s/${misc01.id}`);
    const panel = await tab("Insights");
    const mark = panel.querySelector("[data-thread-mark='torah-chacham-name-is-torah'] a")!;
    expect(mark.textContent).toBe('Taught in 7 other shiurim, תשל"ה to תשס"ט');
    expect(mark.getAttribute("href")).toBe("/en/th/torah-chacham-name-is-torah");
  });

  it("a two-shiur thread is one line with the other shiur and a play button, never a thread link", async () => {
    await openAt(`/en/s/${misc01.id}`);
    const panel = await tab("Insights");
    expect(panel.querySelector("a[href^='/en/th/']")).toBeNull();
    expect(panel.querySelectorAll("h3, h4")).toHaveLength([misc01.notes!.summary.keyPoints, misc01.notes!.insights, misc01.notes!.takeaways].filter((x) => x.length > 0).length);
    const line = panel.querySelector<HTMLElement>("[data-thread-pair='torah-chacham-name-is-torah']")!;
    expect(line.textContent).toContain("Also taught in");
    expect(line.textContent).toContain('תשל"ה');
    const link = within(line).getByRole("link");
    expect(link.getAttribute("href")).toBe("/en/s/en-miscellaneous-en-02?t=555&m=en-miscellaneous-en-02~i1");
    expect(link.textContent).toBe(misc01.related.titles["en-miscellaneous-en-02"]!.title);

    // Play loads the other shiur's file on the tap and plays its insight there.
    const before = requested.length;
    fireEvent.click(within(line).getByRole("button", { name: "Play it in the other shiur" }));
    await waitFor(async () => {
      await settle();
      expect(engine.getState().shiurId).toBe("en-miscellaneous-en-02");
    });
    await settle();
    expect(requested.slice(before)).toEqual(["/data/shiur/en-miscellaneous-en-02.json"]);
    expect(Math.abs(engine.getState().t - 555.04)).toBeLessThan(0.6);
  });
});

describe("stories and sources", () => {
  it("a story told elsewhere says 'told in N other shiurim' and opens the story page", async () => {
    await openAt("/en/s/yi-parshas-hashavua-brshys-03");
    const panel = await tab("Stories");
    const marks = panel.querySelectorAll("[data-story-mark]");
    expect(marks).toHaveLength(1);
    const a = marks[0]!.querySelector("a")!;
    expect(a.textContent).toBe("Told in 1 other shiur");
    expect(a.getAttribute("href")).toBe("/en/maasios/chizkiyahu-sleeps-during-sanherivs-siege");
    expect(panel.querySelector(`[data-moment='${brshys03.notes!.stories[1]!.id}'] [data-story-mark]`)).toBeNull();
  });

  it("groups sources by merged work and links a work with a Live page", async () => {
    await openAt(`/en/s/${misc01.id}`);
    const panel = await tab("Sources");
    const yoma = panel.querySelector("[data-work-group='yoma']")!;
    expect(yoma.querySelector("h3")!.textContent).toBe("Gemara Yoma");
    expect(yoma.querySelector("a[data-work-page]")!.getAttribute("href")).toBe("/en/seforim/yoma");
    const groups = [...panel.querySelectorAll("[data-work-group]")].map((g) => g.getAttribute("data-work-group"));
    expect(groups.filter((g) => g === "pirkei-avos")).toHaveLength(1);
    expect(panel.querySelectorAll("[data-moment]")).toHaveLength(misc01.notes!.sources.length);
  });
});

describe("Related, rebuilt", () => {
  it("runs threads, main topics, other years, then similar suggestions, with no counterpart", async () => {
    overrides.set(misc01.id, misc01WithThread());
    const { container } = await openAt(`/en/s/${misc01.id}`);
    const panel = await tab("Related");
    expect([...panel.querySelectorAll("[data-related]")].map((x) => x.getAttribute("data-related"))).toEqual(["threads", "topics", "neighbors", "series"]);
    expect(panel.querySelector("[data-related='threads'] a")!.getAttribute("href")).toBe("/en/th/torah-chacham-name-is-torah");
    expect([...panel.querySelectorAll("[data-related='topics'] a")].map((a) => a.textContent)).toEqual(
      ["pirkei-avos", "torah-lishmah", "kriyas-shem"].map((id) => `More on ${misc01.corpus!.topicLabels[id]!.label.en}`),
    );
    const similar = panel.querySelector("[data-related='neighbors']")!;
    expect(similar.querySelector("h3")!.textContent).toBe("Similar, suggested automatically");
    expect(container.textContent).not.toMatch(/counterpart|other language/iu);
  });

  it("lists other years of the same parsha after the main topics", async () => {
    await openAt("/en/s/yi-parshas-hashavua-brshys-03");
    const panel = await tab("Related");
    expect([...panel.querySelectorAll("[data-related]")].map((x) => x.getAttribute("data-related"))).toEqual(["topics", "occasion", "series"]);
    expect(panel.querySelector("[data-related='occasion'] a")!.getAttribute("href")).toBe("/en/s/yi-parshas-hashavua-brshys-01");
  });
});

describe("end of shiur", () => {
  async function playToEnd(shiur: ShiurFile) {
    cleanup();
    engine.destroy();
    freshEngine(shiur.duration);
    const utils = await openAt(`/en/s/${shiur.id}?t=${Math.floor(shiur.duration - 3)}`);
    fireEvent.click(screen.getByRole("button", { name: "Play this shiur" }));
    await settle();
    await act(async () => clock.tick(6000));
    await settle();
    expect(engine.getState().status).toBe("ended");
    return utils;
  }

  it("offers the next part of the series and does not play it", async () => {
    const { container } = await playToEnd(tanya);
    const panel = container.querySelector("[data-room-ended]")!;
    expect(panel.getAttribute("data-room-ended")).toBe("next");
    expect(panel.querySelector("a")!.getAttribute("href")).toBe("/en/s/yi-tanya-1-10");
    await act(async () => clock.tick(5000));
    expect(engine.getState().shiurId).toBe(tanya.id);
    expect(engine.getState().status).toBe("ended");
  });

  it("outside a series: continue a thread from this shiur", async () => {
    overrides.set(misc01.id, misc01WithThread());
    const { container } = await playToEnd(misc01);
    const panel = container.querySelector("[data-room-ended]")!;
    expect(panel.getAttribute("data-room-ended")).toBe("thread");
    expect(within(panel as HTMLElement).getByRole("link", { name: "Continue a thread from this shiur" }).getAttribute("href")).toBe("/en/th/torah-chacham-name-is-torah");
  });

  it("without a thread: more on the top topic", async () => {
    const { container } = await playToEnd(misc01);
    const panel = container.querySelector("[data-room-ended]")!;
    expect(panel.getAttribute("data-room-ended")).toBe("topic");
    expect(panel.querySelector("a")!.getAttribute("href")).toBe("/en/t/pirkei-avos");
    expect(engine.getState().shiurId).toBe(misc01.id);
  });
});

describe("accessibility", () => {
  for (const ui of ["en", "yi"] as const) {
    it(`axe finds no violations with marks, chips and the open pane (${ui})`, async () => {
      overrides.set(misc01.id, misc01WithThread());
      const { container } = await openAt(`/${ui}/s/${misc01.id}`);
      fireEvent.click(screen.getAllByRole("tab")[2]!);
      await settle();
      let result = await axe.run(container, AXE);
      expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`)).toEqual([]);
      fireEvent.click(container.querySelector<HTMLButtonElement>("[data-room-topics] [data-topic-chip]")!);
      await settle();
      const pane = await screen.findByRole("dialog");
      await waitFor(() => expect(within(pane).queryByRole("heading", { level: 1 })).not.toBeNull());
      result = await axe.run(document.body, AXE);
      expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`)).toEqual([]);
    });
  }
});
