// @vitest-environment jsdom
/**
 * The listening room in a DOM, through the real route table and shell, with the committed data
 * fixtures and the player engine on a fake clock and fake media element: header, chapters and tabs;
 * deep links (`?t=`, `&m=` with fallback); clickable catalog topics; hear the question / answer;
 * catalog-only shiurim; the dock bound to the engine and never remounted across route changes; no
 * transcript tab; the AI label on every generated-text surface; axe.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AUDIO_VERSION_KEY } from "@emunas/i18n";
import axe from "axe-core";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RouterProvider } from "react-router";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { configureData, resetDataConfig } from "./data.ts";
import { brshys, fixtureFetch, tvbb, tvbbWriteupEn as writeupEn } from "./test-fixtures.ts";
import { createPlayerEngine, type PlayerEngine } from "../../player-engine/index.ts";
import { FakeAudio, FakeClock, fakeMediaSession } from "../../player-engine/test/fakes.ts";
import { DOCK_CLASSES } from "../../player-ui/styles.ts";
import { appDescribe, installEngine } from "../../player-ui/index.ts";
import { settingsStore } from "../../shell/settings.ts";
import { createTestRouter } from "../../shell/test-router.tsx";
import { ROOM_CLASSES } from "./styles.ts";


let clock: FakeClock;
let engine: PlayerEngine;
let media: ReturnType<typeof fakeMediaSession>;

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
  configureData({ fetch: fixtureFetch });
});

afterAll(() => {
  resetDataConfig();
  installEngine(null);
});

beforeEach(() => {
  settingsStore.getState().reset();
  clock = new FakeClock();
  // Any media URL loads, with a length longer than every fixture recording.
  const durations = new Proxy({} as Record<string, number>, { get: () => 5000 });
  media = fakeMediaSession();
  engine = createPlayerEngine({
    audio: new FakeAudio(clock, durations),
    clock,
    mediaSession: media.env,
    lifecycle: null,
    describe: appDescribe,
  });
  installEngine(engine);
});

afterEach(() => {
  cleanup();
  engine.destroy();
});

async function settle(): Promise<void> {
  for (let i = 0; i < 3; i++) {
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

async function go(router: ReturnType<typeof createTestRouter>, to: string) {
  await act(async () => {
    await router.navigate(to);
  });
  await settle();
}

function near(a: number, b: number, eps = 0.5): boolean {
  return Math.abs(a - b) <= eps;
}

describe("header, chapters and tabs", () => {
  it("renders the catalog title, facts, chapters and the companion tabs", async () => {
    const { container } = await openAt("/en/s/yi-zmanim-tv-bb-04");
    const h1 = container.querySelector("main h1")!;
    expect(h1.textContent).toBe(tvbb.catalog.titleOriginal);
    expect(h1.getAttribute("lang")).toBe("yi");
    expect(container.querySelectorAll("main h1")).toHaveLength(1);
    expect(screen.getByText(tvbb.notes!.summary.oneLiner.en)).toBeTruthy();
    const chapters = container.querySelectorAll("[data-chapter]");
    expect(chapters).toHaveLength(tvbb.notes!.chapters.length);
    const tabs = within(screen.getByRole("tablist")).getAllByRole("tab").map((t) => t.textContent);
    expect(tabs).toEqual(["Read", "Sources", "Insights", "Questions", "Stories", "Related"]);
  });

  it("has no transcript tab or transcript content", async () => {
    const { container } = await openAt("/en/s/yi-zmanim-tv-bb-04");
    expect(container.innerHTML.toLowerCase()).not.toContain("transcript");
    for (const tab of screen.getAllByRole("tab")) expect(tab.textContent?.toLowerCase()).not.toContain("transcript");
  });

  it("puts the AI label on every generated-text surface", async () => {
    const { container } = await openAt("/en/s/yi-zmanim-tv-bb-04");
    expect(container.querySelector("header [data-ai-label]")).not.toBeNull();
    expect(container.querySelector("section[aria-labelledby='room-chapters'] [data-ai-label]")).not.toBeNull();
    for (const name of ["Read", "Sources", "Insights", "Questions", "Stories"]) {
      fireEvent.click(screen.getByRole("tab", { name }));
      await settle();
      const panel = screen.getByRole("tabpanel");
      expect(panel.querySelector("[data-ai-label]"), name).not.toBeNull();
      expect(panel.textContent).toContain("Notes prepared by AI");
    }
  });

  it("greys and marks skipped chapter kinds, marks stories and collapses intro/closing", async () => {
    const { container } = await openAt("/en/s/yi-zmanim-tv-bb-04");
    const noise = container.querySelector("li[data-kind='noise']")!;
    expect(noise.textContent).toContain("skipped while listening");
    const story = container.querySelector("li[data-kind='story']")!;
    expect(story.textContent).toContain("Story");
    const intro = container.querySelector("li[data-kind='intro']")!;
    expect(intro.querySelector("details")).not.toBeNull();
    const main = container.querySelector("li[data-kind='main']")!;
    expect(main.querySelector("details")).toBeNull();
  });

  it("links resolved sources to Sefaria only", async () => {
    await openAt("/en/s/yi-zmanim-tv-bb-04");
    fireEvent.click(screen.getByRole("tab", { name: "Sources" }));
    await settle();
    // Merged-work page links (Live `/seforim/<id>`) stay inside the site; only Sefaria goes out.
    const links = within(screen.getByRole("tabpanel"))
      .getAllByRole("link")
      .filter((a) => !a.getAttribute("href")!.startsWith("/"));
    const resolved = tvbb.notes!.sources.filter((s) => s.resolution === "resolved" && s.sefariaRef);
    expect(links).toHaveLength(resolved.length);
    expect(links[0]!.getAttribute("href")).toBe("https://www.sefaria.org/Deuteronomy.10.12");
    expect(links[0]!.getAttribute("rel")).toBe("noopener noreferrer");
  });
});

describe("engine binding and deep links", () => {
  it("?t=754 loads the shiur paused at 754 and Play starts there", async () => {
    await openAt("/en/s/yi-zmanim-tv-bb-04?t=754");
    let st = engine.getState();
    expect(st.shiurId).toBe("yi-zmanim-tv-bb-04");
    expect(st.status).toBe("paused");
    expect(near(st.t, 754)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Play this shiur" }));
    await settle();
    await act(async () => clock.tick(500));
    st = engine.getState();
    expect(st.status).toBe("playing");
    expect(st.t).toBeGreaterThanOrEqual(754);
    expect(st.t).toBeLessThan(755);
  });

  it("&m= focuses the moment, opens its tab and starts at it", async () => {
    const story = tvbb.notes!.stories[0]!;
    const { container } = await openAt(`/en/s/yi-zmanim-tv-bb-04?t=10&m=${encodeURIComponent(story.id)}`);
    expect(near(engine.getState().t, story.t!)).toBe(true);
    expect(screen.getByRole("tab", { name: "Stories", selected: true })).toBeTruthy();
    expect(container.querySelector(`[data-moment="${story.id}"]`)!.getAttribute("aria-current")).toBe("location");
  });

  it("an unknown &m= falls back to t", async () => {
    await openAt("/en/s/yi-zmanim-tv-bb-04?t=754&m=yi-zmanim-tv-bb-04~st99");
    expect(near(engine.getState().t, 754)).toBe(true);
    expect(screen.getByRole("tab", { name: "Read", selected: true })).toBeTruthy();
  });

  it("a query-only change to ?t= seeks within the loaded shiur", async () => {
    const { router } = await openAt("/en/s/yi-zmanim-tv-bb-04?t=100");
    expect(near(engine.getState().t, 100)).toBe(true);
    await go(router, "/en/s/yi-zmanim-tv-bb-04?t=754");
    expect(near(engine.getState().t, 754)).toBe(true);
  });

  it("a catalog topic seeks to the chapter the extraction tied to it", async () => {
    const { container } = await openAt("/en/s/yi-parshas-hashavua-brshys-01");
    const topic = container.querySelector<HTMLButtonElement>("button[data-topic='0']")!;
    const target = brshys.notes!.chapters.find((c) => c.catalogTopicIdx.includes(0))!;
    fireEvent.click(topic);
    await settle();
    const st = engine.getState();
    expect(near(st.t, target.t)).toBe(true);
    expect(["playing", "loading"]).toContain(st.status);
  });

  it("hear the question pauses where the answer starts; hear the answer seeks to it", async () => {
    await openAt("/en/s/yi-zmanim-tv-bb-04");
    fireEvent.click(screen.getByRole("tab", { name: "Questions" }));
    await settle();
    const q = tvbb.notes!.questions[0]!;
    const panel = screen.getByRole("tabpanel");
    fireEvent.click(panel.querySelector(`button[data-hear='question'][data-seek='${q.tq}']`)!);
    await settle();
    expect(near(engine.getState().t, q.tq!)).toBe(true);
    expect(engine.getState().momentEnd).toBe(q.ta);
    fireEvent.click(panel.querySelector(`button[data-hear='answer'][data-seek='${q.ta}']`)!);
    await settle();
    expect(near(engine.getState().t, q.ta!)).toBe(true);
  });

  it("highlights the chapter and the paragraph being spoken about", async () => {
    const { container } = await openAt("/en/s/yi-zmanim-tv-bb-04");
    const chapter = tvbb.notes!.chapters[4]!;
    fireEvent.click(container.querySelector(`button[data-chapter='4']`)!);
    await settle();
    expect(container.querySelector("li[aria-current='true'][data-kind]")!.getAttribute("data-moment")).toBe(chapter.id);
    await waitFor(() => expect(container.querySelector("[data-section-index]")).not.toBeNull());
    const para = writeupEn.blocks[2]!.paragraphs[0]!;
    const row = container.querySelector(`[data-paragraph="${para.id}"]`)!;
    expect(row.getAttribute("aria-current")).toBeNull();
    fireEvent.click(row.querySelector("button[data-seek]")!);
    await settle();
    expect(near(engine.getState().t, para.t!)).toBe(true);
    expect(container.querySelector("[data-paragraph][aria-current='true']")!.getAttribute("data-paragraph")).toBe(para.id);
  });

  it("switches the reading language in place", async () => {
    const { container } = await openAt("/en/s/yi-zmanim-tv-bb-04");
    await waitFor(() => expect(container.querySelector("[data-section-index]")).not.toBeNull());
    expect(container.querySelector("[data-section-index]")!.getAttribute("lang")).toBe("en");
    fireEvent.click(screen.getByRole("button", { name: "אידיש" }));
    await settle();
    expect(settingsStore.getState().read).toBe("yi");
    await waitFor(() => expect(container.querySelector("[data-section-index]")?.getAttribute("lang")).toBe("yi"));
    expect(engine.getState().readingLang).toBe("yi");
  });

  it("does not interrupt another shiur that is playing", async () => {
    engine.load(brshys, { start: 100, autoplay: true });
    clock.flush();
    await openAt("/en/s/yi-zmanim-tv-bb-04?t=754");
    expect(engine.getState().shiurId).toBe(brshys.id);
    fireEvent.click(screen.getByRole("button", { name: "Play this shiur" }));
    await settle();
    expect(engine.getState().shiurId).toBe(tvbb.id);
    expect(near(engine.getState().t, 754)).toBe(true);
  });

  it("uses the series title as the Media Session album", async () => {
    await openAt("/en/s/yi-tanya-1-01");
    expect(media.metadata()?.album).toBe("Tanya (Yiddish)");
    expect(screen.getByText(/Tanya \(Yiddish\), part 2 of 4/)).toBeTruthy();
  });
});

describe("catalog-only shiur", () => {
  it("shows the catalog outline untimed, says notes are coming, and plays", async () => {
    const { container } = await openAt("/en/s/yi-tanya-1-01");
    expect(screen.getByText("Notes for this shiur have not been prepared yet.")).toBeTruthy();
    const outline = container.querySelector("#room-topics")!.parentElement!;
    expect(within(outline).getAllByRole("listitem")).toHaveLength(3);
    expect(within(outline).queryAllByRole("button")).toHaveLength(0);
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Related"]);
    fireEvent.click(screen.getByRole("button", { name: "Play this shiur" }));
    await settle();
    await act(async () => clock.tick(1000));
    const st = engine.getState();
    expect(st.shiurId).toBe("yi-tanya-1-01");
    expect(st.status).toBe("playing");
    expect(st.t).toBeGreaterThan(0.5);
  });

  it("renders not found for an unknown shiur", async () => {
    const router = createTestRouter("/en/s/no-such-shiur");
    const { container } = render(<RouterProvider router={router} />);
    await screen.findByText("This shiur was not found");
    expect(container.querySelectorAll("main h1")).toHaveLength(1);
  });
});

describe("the dock", () => {
  it("binds to the engine and is never remounted across five route changes", async () => {
    const { router, container } = await openAt("/en/s/yi-zmanim-tv-bb-04");
    const dock = () => container.querySelector<HTMLElement>("[data-dock-slot] [data-player-shiur]");
    expect(dock()!.getAttribute("data-player-shiur")).toBe(tvbb.id);
    fireEvent.click(within(container.querySelector("[data-dock-slot]")!).getByRole("button", { name: "Play" }));
    await settle();
    const el = dock()!;
    (el as HTMLElement & { __probe?: number }).__probe = 7;
    for (const p of ["explore", "seforim", "maasios", "series", "shelf"]) {
      await go(router, `/en/${p}`);
      await act(async () => clock.tick(1000));
      expect(dock(), p).toBe(el);
      expect((dock() as HTMLElement & { __probe?: number }).__probe).toBe(7);
      expect(engine.getState().status, p).toBe("playing");
    }
    expect(engine.getState().t).toBeGreaterThan(4);
  });

  it("moves by chapter (next, and previous restarting after 3 s)", async () => {
    const { container } = await openAt("/en/s/yi-zmanim-tv-bb-04?t=300");
    const slot = within(container.querySelector("[data-dock-slot]")!);
    const ch = tvbb.notes!.chapters;
    fireEvent.click(slot.getByRole("button", { name: "Next chapter" }));
    await settle();
    // Chapter 2 is noise (skipped by default), so next lands on chapter 3.
    expect(near(engine.getState().t, ch[3]!.t)).toBe(true);
    fireEvent.click(slot.getByRole("button", { name: "Play" }));
    await settle();
    await act(async () => clock.tick(5000));
    fireEvent.click(slot.getByRole("button", { name: "Previous chapter" }));
    await settle();
    expect(near(engine.getState().t, ch[3]!.t, 0.6)).toBe(true);
    fireEvent.click(slot.getByRole("button", { name: "Previous chapter" }));
    await settle();
    expect(near(engine.getState().t, ch[1]!.t, 0.6)).toBe(true);
  });

  it("has a named slider with a chapter-aware value text", async () => {
    const { container } = await openAt("/en/s/yi-zmanim-tv-bb-04?t=300");
    const slider = within(container.querySelector("[data-dock-slot]")!).getByRole("slider", { name: "Position" });
    expect(slider.getAttribute("aria-valuetext")).toMatch(/^5:00 of 50:27, chapter 2: /);
    fireEvent.change(slider, { target: { value: "1000" } });
    await settle();
    expect(near(engine.getState().t, 1000)).toBe(true);
  });
});

describe("the improved-audio line (cleaned-audio-ux)", () => {
  const dockSlot = (c: HTMLElement) => within(c.querySelector<HTMLElement>("[data-dock-slot]")!);
  const roomLine = (c: HTMLElement) => c.querySelector<HTMLElement>("[data-room-version]");

  beforeEach(() => {
    try {
      localStorage.removeItem(AUDIO_VERSION_KEY);
    } catch {
      /* no storage */
    }
  });

  it("plays the improved copy by default and says so in the dock and under the play button", async () => {
    const { container } = await openAt("/en/s/yi-zmanim-tv-bb-04?t=300");
    expect(engine.audio.src).toBe(tvbb.recordings[0]!.cleanedUrl);
    expect(roomLine(container)!.textContent).toBe("Sound improved by AI·Switch to the original");
    const notice = container.querySelector("[data-dock-slot] [data-dock-notice]")!;
    expect(notice.getAttribute("data-dock-notice")).toBe("version");
    const button = dockSlot(container).getByRole("button", { name: "Switch to the original" });
    expect(button.tagName).toBe("BUTTON");
    expect(document.getElementById(button.getAttribute("aria-describedby")!)!.textContent).toBe("Sound improved by AI");
  });

  it("switching keeps position, play state and speed, is announced, remembered and switchable back", async () => {
    const { container } = await openAt("/en/s/yi-zmanim-tv-bb-04?t=300");
    const dock = dockSlot(container);
    engine.setRate(1.5);
    fireEvent.click(dock.getByRole("button", { name: "Play" }));
    await settle();
    await act(async () => clock.tick(2000));
    const before = engine.getState().t;
    fireEvent.click(dock.getByRole("button", { name: "Switch to the original" }));
    await settle();
    expect(engine.audio.src).toBe(tvbb.recordings[0]!.audioUrl);
    expect(near(engine.getState().t, before, 0.2)).toBe(true);
    expect(engine.getState()).toMatchObject({ status: "playing", rate: 1.5, audioVersion: "original", playingVersion: "original" });
    expect(engine.audio.playbackRate).toBe(1.5);
    expect(localStorage.getItem(AUDIO_VERSION_KEY)).toBe("original");
    expect(container.querySelector("[data-version-status]")!.textContent).toBe("Now playing the original recording.");
    // Both places now offer the improved copy.
    expect(roomLine(container)!.textContent).toBe("A version with the sound improved by AI is also available·Listen to it");
    const back = within(roomLine(container)!).getByRole("button", { name: "Listen to it" });
    back.focus();
    fireEvent.click(back);
    await settle();
    expect(engine.audio.src).toBe(tvbb.recordings[0]!.cleanedUrl);
    expect(engine.getState().status).toBe("playing");
    expect(localStorage.getItem(AUDIO_VERSION_KEY)).toBe("cleaned");
    expect(container.querySelector("[data-version-status]")!.textContent).toBe("Now playing the version improved by AI.");
  });

  it("the dock's notice row gives a skip notice priority over the version line; the room keeps the line", async () => {
    const { container } = await openAt("/en/s/yi-zmanim-tv-bb-04?t=300");
    const ch = tvbb.notes!.chapters;
    // Chapter 2 is noise and skipped by default: play into it from just before.
    engine.seek(ch[2]!.t - 1);
    fireEvent.click(dockSlot(container).getByRole("button", { name: "Play" }));
    await settle();
    await act(async () => clock.tick(2000));
    await settle();
    expect(engine.getState().lastSkip).not.toBeNull();
    expect(container.querySelector("[data-dock-slot] [data-dock-notice]")!.getAttribute("data-dock-notice")).toBe("skip");
    expect(roomLine(container)).not.toBeNull();
  });

  for (const ui of ["en", "yi"] as const) {
    it(`axe finds no violations with the line in the dock and the room, state B (${ui})`, async () => {
      const { container } = await openAt(`/${ui}/s/yi-zmanim-tv-bb-04?t=300`);
      fireEvent.click(within(roomLine(container)!).getByRole("button"));
      await settle();
      expect(container.querySelector("[data-dock-slot] [data-dock-notice]")!.getAttribute("data-dock-notice")).toBe("version");
      const result = await axe.run(container, {
        rules: { "color-contrast": { enabled: false }, "document-title": { enabled: false }, region: { enabled: false } },
      });
      expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`)).toEqual([]);
    });
  }
});

describe("accessibility and styles", () => {
  for (const ui of ["en", "yi"] as const) {
    it(`axe finds no violations in the room (${ui})`, async () => {
      const { container } = await openAt(`/${ui}/s/yi-zmanim-tv-bb-04?t=300`);
      const result = await axe.run(container, {
        rules: { "color-contrast": { enabled: false }, "document-title": { enabled: false }, region: { enabled: false } },
      });
      expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`)).toEqual([]);
    });
  }

  it("lists exactly the classes defined in the stylesheets", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const classesIn = (file: string) =>
      [...new Set([...readFileSync(file, "utf8").matchAll(/\.([a-zA-Z][a-zA-Z0-9]*)\b/g)].map((m) => m[1]!))].sort();
    expect(classesIn(join(here, "Room.module.css"))).toEqual([...ROOM_CLASSES].sort());
    expect(classesIn(join(here, "../../player-ui/PlayerDock.module.css"))).toEqual([...DOCK_CLASSES].sort());
  });
});
