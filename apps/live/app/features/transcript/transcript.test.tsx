// @vitest-environment jsdom
/**
 * The Transcript tab scaffold (W5.2), rendered directly (the room never shows it while
 * TRANSCRIPT_VIEW is false): file parsing, global times across recordings, loading with missing
 * files, the active cue, seeking. Synthetic fixture text only.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TRANSCRIPT_VIEW } from "../../config/feature-flags.ts";
import type { RoomContext } from "../listening-room/context.ts";
import { availableTabs } from "../listening-room/tabs.tsx";
import { roomT } from "../listening-room/strings.ts";
import { tvbb } from "../listening-room/test-fixtures.ts";
import { activeCue, globalCues, parseTranscriptFile, transcriptPath, type TranscriptFile } from "./contract.ts";
import { TranscriptTab } from "./TranscriptTab.tsx";
import { configureTranscriptFetch, loadTranscripts } from "./use-transcripts.ts";

const [rec0, rec1] = tvbb.recordings;
const file = (id: string, cues: [number, number, string][]): TranscriptFile => ({
  schemaVersion: 1,
  recordingId: id,
  quality: "reviewed",
  lang: "yi",
  version: "0123456789abcdef",
  cues,
});

afterEach(() => {
  cleanup();
  configureTranscriptFetch(null);
});

describe("contract", () => {
  it("parses only the exact public shape for the named recording", () => {
    const f = file("y-a", [[0, 2, "synthetic"]]);
    expect(parseTranscriptFile(f, "y-a")).toEqual(f);
    expect(parseTranscriptFile(f, "y-b")).toBeNull();
    expect(parseTranscriptFile({ ...f, cues: [[2, 1, "x"]] }, "y-a")).toBeNull();
    expect(parseTranscriptFile({ ...f, schemaVersion: 2 }, "y-a")).toBeNull();
    expect(parseTranscriptFile("<!doctype html>", "y-a")).toBeNull();
    expect(transcriptPath("y-a")).toBe("/data/transcript/y-a.json");
    expect(transcriptPath("../x")).toBeNull();
  });

  it("places cues on the shiur timeline and finds the one playing", () => {
    const files = new Map([
      ["a", file("a", [[0, 5, "one"], [5, 9, "two"]])],
      ["b", file("b", [[0, 4, "three"]])],
    ]);
    const cues = globalCues([{ id: "a", offset: 0 }, { id: "b", offset: 100 }], files);
    expect(cues.map((c) => [c.t, c.end, c.text])).toEqual([[0, 5, "one"], [5, 9, "two"], [100, 104, "three"]]);
    expect(activeCue(cues, 6)).toBe(1);
    expect(activeCue(cues, 50)).toBe(-1);
    expect(activeCue(cues, 101)).toBe(2);
    expect(activeCue(cues, null)).toBe(-1);
  });
});

describe("loading", () => {
  it("keeps the approved files and skips missing, HTML (SPA fallback) and malformed ones", async () => {
    const calls: string[] = [];
    configureTranscriptFetch(async (input) => {
      calls.push(input);
      if (input.endsWith("/y-ok.json")) return new Response(JSON.stringify(file("y-ok", [[0, 1, "synthetic"]])));
      if (input.endsWith("/y-html.json")) return new Response("<!doctype html><html></html>");
      if (input.endsWith("/y-bad.json")) return new Response(JSON.stringify({ cues: "no" }));
      return new Response("", { status: 404 });
    });
    const got = await loadTranscripts(["y-missing", "y-ok", "y-html", "y-bad", "../escape"]);
    expect([...got.keys()]).toEqual(["y-ok"]);
    expect(calls.sort()).toEqual(["/data/transcript/y-bad.json", "/data/transcript/y-html.json", "/data/transcript/y-missing.json", "/data/transcript/y-ok.json"]);
  });
});

function roomOf(over: Partial<RoomContext> = {}): RoomContext {
  return {
    ui: "en",
    rt: roomT("en"),
    shiur: tvbb,
    info: {} as RoomContext["info"],
    reading: "en",
    now: null,
    playing: false,
    start: 0,
    focusedMoment: null,
    skippedKinds: new Set(),
    playAt: vi.fn(),
    siblingSeries: null,
    playable: true,
    ...over,
  };
}

describe("TranscriptTab", () => {
  it("is not offered by the room while the flag is off", () => {
    expect(TRANSCRIPT_VIEW).toBe(false);
    expect(availableTabs(roomOf())).not.toContain("transcript");
  });

  it("lists the cues of the approved recordings at global times and seeks on click", () => {
    const room = roomOf({ now: rec1!.offset + 3 });
    const files = new Map([[rec1!.id, file(rec1!.id, [[0, 2, "synthetic first"], [2, 6, "synthetic second"]])]]);
    render(<TranscriptTab room={room} files={files} />);
    expect(screen.getByText("The words of the recording")).toBeTruthy();
    const items = screen.getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining("synthetic first"),
      expect.stringContaining("synthetic second"),
    ]);
    expect(items[1]!.getAttribute("aria-current")).toBe("true");
    expect(items[0]!.getAttribute("aria-current")).toBeNull();
    // Only the recording with a file is shown; with two recordings, its part is named.
    expect(screen.getByText("Part 2")).toBeTruthy();
    expect(rec0).toBeDefined();
    act(() => {
      fireEvent.click(items[0]!.querySelector("button")!);
    });
    expect(room.playAt).toHaveBeenCalledWith(rec1!.offset + 0, rec1!.offset + 2);
  });

  it("uses the Yiddish strings in the Yiddish UI", () => {
    render(<TranscriptTab room={roomOf({ ui: "yi", rt: roomT("yi") })} files={new Map()} />);
    expect(screen.getByText("די ווערטער פֿון דער אויפֿנאַמע")).toBeTruthy();
  });
});
