/** Pure parts of the player script (W3.2): hash parsing, the margin-mark search, chapter-back rule. */
import { describe, expect, it } from "vitest";
import { currentIndex, parseTimeHash, previousStart } from "../src/scripts/player.ts";

describe("parseTimeHash", () => {
  it("reads #t=<seconds> and nothing else", () => {
    expect(parseTimeHash("#t=754")).toBe(754);
    expect(parseTimeHash("#t=754.5")).toBe(754.5);
    expect(parseTimeHash("#t=0")).toBe(0);
    for (const h of ["", "#s3", "#t=", "#t=-4", "#t=1:02", "#t=12abc", "#src2", "#t=12345678"]) expect(parseTimeHash(h), h).toBeNull();
  });
});

describe("currentIndex", () => {
  const starts = [0, 30.05, 184.17, 284, 1855.544, 2000];

  it("finds the last item that has started (binary search)", () => {
    expect(currentIndex(starts, -1)).toBe(-1);
    expect(currentIndex(starts, 0)).toBe(0);
    expect(currentIndex(starts, 30)).toBe(0);
    expect(currentIndex(starts, 30.05)).toBe(1);
    expect(currentIndex(starts, 1855.6)).toBe(4);
    expect(currentIndex(starts, 1e9)).toBe(5);
    expect(currentIndex([], 10)).toBe(-1);
  });

  it("agrees with a linear scan", () => {
    const sorted = Array.from({ length: 57 }, (_, i) => i * 13.7);
    for (let now = -5; now < 800; now += 3.3) {
      let expected = -1;
      sorted.forEach((s, i) => {
        if (s <= now) expected = i;
      });
      expect(currentIndex(sorted, now)).toBe(expected);
    }
  });
});

describe("previousStart", () => {
  const starts = [0, 100, 200];

  it("restarts the chapter after 3 s, else goes to the previous one", () => {
    expect(previousStart(starts, 150)).toBe(100);
    expect(previousStart(starts, 102)).toBe(0);
    expect(previousStart(starts, 1)).toBe(0);
    expect(previousStart([], 50)).toBe(0);
  });
});
