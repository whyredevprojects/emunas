// @vitest-environment jsdom
/**
 * The report control on every item of the listening room (W4.7 "on every item"): the shiur itself,
 * each chapter, each Read paragraph, source, key point / insight / takeaway, question and story;
 * a report from an item carries that item's moment id; a catalog-only shiur can still be reported.
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { RouterProvider } from "react-router";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { configureData, resetDataConfig } from "../listening-room/data.ts";
import { fixtureFetch, tvbb, tvbbWriteupEn } from "../listening-room/test-fixtures.ts";
import { createPlayerEngine, type PlayerEngine } from "../../player-engine/index.ts";
import { FakeAudio, FakeClock, fakeMediaSession } from "../../player-engine/test/fakes.ts";
import { appDescribe, installEngine } from "../../player-ui/index.ts";
import { settingsStore } from "../../shell/settings.ts";
import { createTestRouter } from "../../shell/test-router.tsx";
import { configureFeedback, resetFeedbackConfig } from "./index.ts";
import { FakeTurnstile, recordingFetch } from "./test-fakes.ts";

let clock: FakeClock;
let engine: PlayerEngine;
let turnstile: FakeTurnstile;
let net: ReturnType<typeof recordingFetch>;

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
  const durations = new Proxy({} as Record<string, number>, { get: () => 5000 });
  engine = createPlayerEngine({
    audio: new FakeAudio(clock, durations),
    clock,
    mediaSession: fakeMediaSession().env,
    lifecycle: null,
    describe: appDescribe,
  });
  installEngine(engine);
  turnstile = new FakeTurnstile();
  net = recordingFetch();
  configureFeedback({ fetch: net.fetch, loadTurnstile: async () => turnstile, siteKey: () => "1x00000000000000000000AA" });
});

afterEach(() => {
  cleanup();
  engine.destroy();
  resetFeedbackConfig();
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
  const utils = render(<RouterProvider router={createTestRouter(path)} />);
  await settle();
  await screen.findByRole("tablist");
  await settle();
  return utils;
}

function reportIds(root: ParentNode): string[] {
  return [...root.querySelectorAll<HTMLElement>("[data-report]")].map((b) => b.dataset["report"]!);
}

async function tab(name: string): Promise<HTMLElement> {
  fireEvent.click(screen.getByRole("tab", { name }));
  await settle();
  return screen.getByRole("tabpanel");
}

describe("report control in the listening room", () => {
  it("is on the shiur, every chapter and every item in every tab", async () => {
    const { container } = await openAt("/en/s/yi-zmanim-tv-bb-04");
    const n = tvbb.notes!;
    expect(reportIds(container.querySelector("main article > header")!)).toEqual([tvbb.id]);
    const chapters = container.querySelector("section[aria-labelledby='room-chapters']")!;
    expect(reportIds(chapters)).toEqual(n.chapters.map((c) => c.id));

    const read = await tab("Read");
    expect(reportIds(read)).toEqual(tvbbWriteupEn.blocks.flatMap((b) => b.paragraphs.map((p) => p.id)));
    expect(reportIds(await tab("Sources")).sort()).toEqual(n.sources.map((x) => x.id).sort());
    expect(reportIds(await tab("Insights"))).toEqual([...n.summary.keyPoints, ...n.insights, ...n.takeaways].map((x) => x.id));
    expect(reportIds(await tab("Questions"))).toEqual(n.questions.map((x) => x.id));
    expect(reportIds(await tab("Stories"))).toEqual(n.stories.map((x) => x.id));
  });

  it("sends a report about one source with its moment id and the shiur's rev", async () => {
    await openAt("/en/s/yi-zmanim-tv-bb-04");
    const panel = await tab("Sources");
    const source = tvbb.notes!.sources[0]!;
    const item = panel.querySelector<HTMLElement>(`[data-moment="${source.id}"]`)!;
    fireEvent.click(within(item).getByRole("button", { name: "Something's wrong here" }));
    await settle();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Wrong source" }));
    await settle();
    expect(net.requests).toHaveLength(1);
    expect(net.requests[0]!.body).toEqual({
      target: { shiurId: tvbb.id, momentId: source.id, field: "source" },
      reason: "wrong-source",
      ui: "en",
      rev: tvbb.rev,
      audio: "original",
      turnstile: "token-1",
    });
  });

  it("lets a catalog-only shiur be reported as a whole, in Yiddish", async () => {
    const { container } = await openAt("/yi/s/yi-tanya-1-01");
    expect(reportIds(container.querySelector("main article > header")!)).toEqual(["yi-tanya-1-01"]);
    fireEvent.click(within(container.querySelector("main article > header")!).getByRole("button", { name: "עפעס איז דא נישט ריכטיג" }));
    await settle();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "עפעס אנדערש" }));
    await settle();
    expect(net.requests[0]!.body).toMatchObject({ target: { shiurId: "yi-tanya-1-01" }, reason: "other", ui: "yi" });
  });
});
