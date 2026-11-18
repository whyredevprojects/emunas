/** Pure parts of the "this week" script: the visitor's civil day and which built day to show. */
import { describe, expect, it } from "vitest";
import { dayToShow, localIsoDay, parseBlocks, type WeekDay } from "../src/scripts/this-week.ts";

describe("localIsoDay", () => {
  it("reads the local civil day, padded", () => {
    expect(localIsoDay(new Date(2026, 10, 16, 0, 0, 1))).toBe("2026-11-16");
    expect(localIsoDay(new Date(2026, 10, 15, 23, 59, 59))).toBe("2026-11-15");
    expect(localIsoDay(new Date(2027, 0, 5, 12))).toBe("2027-01-05");
  });
});

describe("parseBlocks", () => {
  it("splits on spaces and drops empties", () => {
    expect(parseBlocks("parsha:vayeitzei zman:chanukah:soon")).toEqual(["parsha:vayeitzei", "zman:chanukah:soon"]);
    expect(parseBlocks("")).toEqual([]);
    expect(parseBlocks(undefined)).toEqual([]);
  });
});

describe("dayToShow", () => {
  const sun: WeekDay = { lead: "… as of 13 Kislev 5787.", blocks: ["parsha:vayishlach", "zman:chanukah:soon"] };
  const days = new Map<string, WeekDay>([
    ["2026-11-21", { lead: "… as of 12 Kislev 5787.", blocks: ["parsha:vayeitzei", "zman:chanukah:soon"] }],
    ["2026-11-22", sun],
    ["2026-11-23", { lead: "", blocks: [] }],
  ]);
  const carried = new Set(["parsha:vayeitzei", "parsha:vayishlach", "zman:chanukah:soon"]);

  it("swaps to the visitor's day when the page shows another", () => {
    expect(dayToShow(days, "2026-11-21", "2026-11-22", carried)).toBe(sun);
  });

  it("leaves the page as built for the shown day, a day outside the window or an empty day", () => {
    expect(dayToShow(days, "2026-11-22", "2026-11-22", carried)).toBeNull();
    expect(dayToShow(days, "2026-11-21", "2026-12-01", carried)).toBeNull();
    expect(dayToShow(days, "2026-11-21", "2026-11-23", carried)).toBeNull();
  });

  it("leaves the page as built when a block is not carried", () => {
    expect(dayToShow(days, "2026-11-21", "2026-11-22", new Set(["parsha:vayishlach"]))).toBeNull();
  });
});
