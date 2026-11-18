import { describe, expect, it } from "vitest";
import {
  DEFAULT_SKIP,
  chapterIndexAt,
  clampRate,
  locate,
  nextChapterTarget,
  planSkips,
  prevChapterTarget,
  recordingAudioUrl,
} from "../plan.ts";
import type { PlayerChapter, PlayerShiur, SkipRange } from "../types.ts";

const l = { en: "", yi: "" };

describe("planSkips", () => {
  it("applies the default kinds and the 20 s minimum", () => {
    const ranges: SkipRange[] = [
      [0, 10, "noise"],
      [100, 130, "singing"],
      [200, 260, "main"],
      [300, 325, "other_speaker"],
      [400, 419.9, "pause"],
      [500, 520, "pause"],
    ];
    expect(planSkips(ranges, DEFAULT_SKIP, 1000).map((p) => [p.start, p.end, p.kind])).toEqual([
      [100, 130, "singing"],
      [300, 325, "other_speaker"],
      [500, 520, "pause"],
    ]);
  });

  it("merges neighbouring ranges before the length check, naming the longest kind", () => {
    const ranges: SkipRange[] = [
      [10, 22, "noise"],
      [22.3, 40, "singing"],
    ];
    expect(planSkips(ranges, DEFAULT_SKIP, 100)).toEqual([{ start: 10, end: 40, kind: "singing", key: "10-40" }]);
  });

  it("clips to the shiur and honours disabled", () => {
    expect(planSkips([[70, 130, "noise"]], DEFAULT_SKIP, 100)).toMatchObject([{ start: 70, end: 100 }]);
    expect(planSkips([[90, 130, "noise"]], DEFAULT_SKIP, 100)).toEqual([]);
    expect(planSkips([[0, 100, "noise"]], { ...DEFAULT_SKIP, enabled: false }, 100)).toEqual([]);
  });
});

describe("timeline and chapters", () => {
  const shiur: PlayerShiur = {
    id: "x",
    lang: "en",
    duration: 30,
    catalog: { titleOriginal: "x" },
    recordings: [
      { id: "r1", offset: 0, duration: 10, audioUrl: "u1" },
      { id: "r2", offset: 10, duration: 20, audioUrl: "u2" },
    ],
  };

  it("locates global seconds", () => {
    expect(locate(shiur, 0)).toEqual({ index: 0, local: 0 });
    expect(locate(shiur, 9.5)).toEqual({ index: 0, local: 9.5 });
    expect(locate(shiur, 10)).toEqual({ index: 1, local: 0 });
    expect(locate(shiur, 25)).toEqual({ index: 1, local: 15 });
    expect(locate(shiur, 99)).toEqual({ index: 1, local: 20 });
    expect(locate(shiur, -3)).toEqual({ index: 0, local: 0 });
  });

  const chapters: PlayerChapter[] = [
    { t: 0, end: 10, title: l },
    { t: 10, end: 20, title: l },
    { t: 20, end: 30, title: l },
  ];

  it("finds the chapter at t", () => {
    expect(chapterIndexAt(chapters, 0)).toBe(0);
    expect(chapterIndexAt(chapters, 9.9)).toBe(0);
    expect(chapterIndexAt(chapters, 10)).toBe(1);
    expect(chapterIndexAt(chapters, 29)).toBe(2);
    expect(chapterIndexAt([], 5)).toBe(-1);
  });

  it("previous: restart after more than 3 s, else previous chapter, else 0", () => {
    const none = new Set<string>();
    expect(prevChapterTarget(chapters, 13.5, [], none)).toBe(10);
    expect(prevChapterTarget(chapters, 13, [], none)).toBe(0);
    expect(prevChapterTarget(chapters, 12, [], none)).toBe(0);
    expect(prevChapterTarget(chapters, 22, [], none)).toBe(10);
    expect(prevChapterTarget(chapters, 2, [], none)).toBe(0);
  });

  it("next: following chapter, null after the last", () => {
    const none = new Set<string>();
    expect(nextChapterTarget(chapters, 3, [], none)).toBe(10);
    expect(nextChapterTarget(chapters, 25, [], none)).toBeNull();
  });
});

describe("misc", () => {
  it("clamps rate", () => {
    expect(clampRate(0.5)).toBe(0.75);
    expect(clampRate(1.25)).toBe(1.25);
    expect(clampRate(9)).toBe(2);
    expect(clampRate(Number.NaN)).toBe(1);
  });

  it("uses audioUrl (A1); null or empty means unavailable", () => {
    expect(recordingAudioUrl({ id: "a", offset: 0, duration: 1, audioUrl: "https://m/a.mp3" })).toBe("https://m/a.mp3");
    expect(recordingAudioUrl({ id: "a", offset: 0, duration: 1, audioUrl: null })).toBeNull();
    expect(recordingAudioUrl({ id: "a", offset: 0, duration: 1, audioUrl: "" })).toBeNull();
  });
});
