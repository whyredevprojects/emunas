// @vitest-environment jsdom
/**
 * The room header's plain download links: the file the listener hears (improved copy or original),
 * following a version switch, one link per playable part, nothing when no part is playable.
 */
import { act, cleanup, render } from "@testing-library/react";
import { AUDIO_VERSION_KEY, type AudioVersion } from "@emunas/i18n";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPlayerEngine, type PlayerEngine, type PlayerShiur } from "../../player-engine/index.ts";
import { FakeAudio, FakeClock, fakeMediaSession } from "../../player-engine/test/fakes.ts";
import { IDLE_STATE, appDescribe, chooseAudioVersion, installEngine } from "../../player-ui/index.ts";
import type { RoomContext } from "./context.ts";
import { DownloadLinks, downloadTargets } from "./DownloadLink.tsx";
import { roomT } from "./strings.ts";
import { brshys, clone, tvbb } from "./test-fixtures.ts";
import type { ShiurFile } from "./data.ts";

const state = (over: Partial<typeof IDLE_STATE>) => ({ ...IDLE_STATE, ...over });
const rec = (s: ShiurFile, i: number) => s.recordings[i]!;

describe("downloadTargets", () => {
  it("links the improved copy for the default choice and the original when that is chosen", () => {
    expect(downloadTargets(state({ audioVersion: "cleaned" }), brshys)).toEqual([
      { part: 1, url: rec(brshys, 0).cleanedUrl, version: "cleaned" },
    ]);
    expect(downloadTargets(state({ audioVersion: "original" }), brshys)).toEqual([
      { part: 1, url: rec(brshys, 0).audioUrl, version: "original" },
    ]);
  });

  it("links the original for a recording with no improved copy", () => {
    const s = clone(brshys);
    (s.recordings[0] as { cleanedUrl: string | null }).cleanedUrl = null;
    expect(downloadTargets(state({ audioVersion: "cleaned" }), s)).toEqual([
      { part: 1, url: rec(s, 0).audioUrl, version: "original" },
    ]);
  });

  it("for the loaded shiur, the current recording follows what plays (a fallback to the original)", () => {
    const st = state({
      shiurId: tvbb.id,
      recordingIndex: 0,
      audioVersion: "cleaned",
      playingVersion: "original",
      cleanedAvailable: true,
      versionFallback: true,
    });
    expect(downloadTargets(st, tvbb)).toEqual([
      { part: 1, url: rec(tvbb, 0).audioUrl, version: "original" },
      { part: 2, url: rec(tvbb, 1).cleanedUrl, version: "cleaned" },
    ]);
  });

  it("skips recordings that cannot be played; none playable gives no targets", () => {
    const s = clone(tvbb);
    s.recordings[0] = { ...s.recordings[0]!, audioUrl: null, cleanedUrl: null, playable: false } as never;
    expect(downloadTargets(state({}), s).map((t) => t.part)).toEqual([2]);
    s.recordings[1] = { ...s.recordings[1]!, audioUrl: null, cleanedUrl: null, playable: false } as never;
    expect(downloadTargets(state({}), s)).toEqual([]);
  });
});

describe("DownloadLinks", () => {
  let clock: FakeClock;
  let engine: PlayerEngine;

  const make = (audioVersion: AudioVersion) => {
    clock = new FakeClock();
    const durations = new Proxy({} as Record<string, number>, { get: () => 5000 });
    engine = createPlayerEngine({
      audio: new FakeAudio(clock, durations),
      clock,
      mediaSession: fakeMediaSession().env,
      lifecycle: null,
      describe: appDescribe,
      audioVersion,
    });
    installEngine(engine);
  };
  const room = (shiur: ShiurFile, ui: "en" | "yi" | "he" = "en") =>
    ({ shiur, ui, rt: roomT(ui) }) as unknown as RoomContext;
  const links = (c: HTMLElement) => [...c.querySelectorAll<HTMLAnchorElement>("a[data-room-download]")];

  beforeEach(() => make("cleaned"));
  afterEach(() => {
    cleanup();
    engine.destroy();
  });
  afterAll(() => {
    installEngine(null);
    localStorage.removeItem(AUDIO_VERSION_KEY);
  });

  it("a single recording gets one plain link named for its version", () => {
    const { container } = render(<DownloadLinks room={room(brshys)} className="x" />);
    const [a, ...rest] = links(container);
    expect(rest).toEqual([]);
    expect(a!.textContent).toBe("Download");
    expect(a!.getAttribute("href")).toBe(rec(brshys, 0).cleanedUrl);
    expect(a!.hasAttribute("download")).toBe(true);
    expect(a!.className).toBe("x");
    expect(a!.getAttribute("aria-label")).toBe("Download, sound improved by AI");
  });

  it("uses the stored choice of the original for a shiur that is not loaded", () => {
    engine.destroy();
    make("original");
    const { container } = render(<DownloadLinks room={room(brshys)} />);
    expect(links(container)[0]!.getAttribute("href")).toBe(rec(brshys, 0).audioUrl);
    expect(links(container)[0]!.getAttribute("aria-label")).toBe("Download, original recording");
  });

  it("labels parts and follows a version switch while the shiur is loaded", async () => {
    const { container } = render(<DownloadLinks room={room(tvbb)} />);
    expect(links(container).map((a) => a.textContent)).toEqual(["Download part 1", "Download part 2"]);
    expect(links(container).map((a) => a.getAttribute("href"))).toEqual([rec(tvbb, 0).cleanedUrl, rec(tvbb, 1).cleanedUrl]);
    await act(async () => {
      engine.load(tvbb as unknown as PlayerShiur);
      clock.flush();
    });
    expect(links(container).map((a) => a.getAttribute("href"))).toEqual([rec(tvbb, 0).cleanedUrl, rec(tvbb, 1).cleanedUrl]);
    await act(async () => {
      chooseAudioVersion("original");
      clock.flush();
    });
    expect(links(container).map((a) => a.getAttribute("href"))).toEqual([rec(tvbb, 0).audioUrl, rec(tvbb, 1).audioUrl]);
    expect(links(container)[1]!.getAttribute("aria-label")).toBe("Download part 2, original recording");
    await act(async () => {
      chooseAudioVersion("cleaned");
      clock.flush();
    });
    expect(links(container).map((a) => a.getAttribute("data-version"))).toEqual(["cleaned", "cleaned"]);
  });

  it("uses the Library's wording in Yiddish and Hebrew", () => {
    const yi = render(<DownloadLinks room={room(tvbb, "yi")} />);
    expect(links(yi.container)[1]!.textContent).toBe("אראפלאדן טייל 2");
    cleanup();
    const he = render(<DownloadLinks room={room(brshys, "he")} />);
    expect(links(he.container)[0]!.textContent).toBe("הורדה");
  });

  it("renders nothing when no recording is playable", () => {
    const s = clone(brshys);
    s.recordings[0] = { ...s.recordings[0]!, audioUrl: null, cleanedUrl: null, playable: false } as never;
    const { container } = render(<DownloadLinks room={room(s)} />);
    expect(container.innerHTML).toBe("");
  });
});
