import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { normalizeMarks, splitMarks } from "../highlight.ts";
import { groupByShiur, hitHref, hitTitle, suggestionHref } from "../model.ts";
import { searchEn, searchYi } from "../strings.ts";
import { SEARCH_CLASSES } from "../styles.ts";
import { apiResponse, apiResult } from "./data.ts";

const here = dirname(fileURLToPath(import.meta.url));

describe("highlights", () => {
  it("splits text into marked and plain runs without losing characters", () => {
    const runs = splitMarks("the lion ate grass", [[4, 8], [13, 18]]);
    expect(runs).toEqual([
      { text: "the ", mark: false },
      { text: "lion", mark: true },
      { text: " ate ", mark: false },
      { text: "grass", mark: true },
    ]);
    expect(runs.map((r) => r.text).join("")).toBe("the lion ate grass");
  });

  it("sorts, clamps and merges overlapping marks", () => {
    expect(normalizeMarks([[5, 9], [0, 2], [1, 3], [8, 100]], 10)).toEqual([[0, 3], [5, 10]]);
    expect(splitMarks("abc", [[-5, 1], [2, 2]])).toEqual([
      { text: "a", mark: true },
      { text: "bc", mark: false },
    ]);
  });

  it("works on Hebrew text (UTF-16 offsets)", () => {
    const text = "די תיבה פון נח";
    const at = text.indexOf("נח");
    expect(splitMarks(text, [[at, at + 2]]).filter((r) => r.mark).map((r) => r.text)).toEqual(["נח"]);
  });
});

describe("grouping", () => {
  it("groups by shiur in first-appearance order and keeps the API's per-shiur count", () => {
    const a1 = apiResult({ momentId: "a~s0", shiurId: "a" });
    const b1 = apiResult({ momentId: "b~i0", shiurId: "b", kind: "insight" });
    const a2 = apiResult({ momentId: "a~st1", shiurId: "a", kind: "story" });
    const page1 = { ...apiResponse([a1, b1, a2]), groups: [{ shiurId: "a", count: 5 }, { shiurId: "b", count: 1 }] };
    const page2 = apiResponse([apiResult({ momentId: "c~q0", shiurId: "c" }), a1]);
    const groups = groupByShiur([page1, page2]);
    expect(groups.map((g) => [g.shiurId, g.hits.map((h) => h.momentId), g.count])).toEqual([
      ["a", ["a~s0", "a~st1"], 5],
      ["b", ["b~i0"], 1],
      ["c", ["c~q0"], 1],
    ]);
  });

  it("titles fall back to the other language", () => {
    expect(hitTitle({ title: { en: null, yi: "שאלה" } }, "en")).toEqual({ text: "שאלה", lang: "yi" });
    expect(hitTitle({ title: { en: "Q", yi: "שאלה" } }, "en")).toEqual({ text: "Q", lang: "en" });
    expect(hitTitle({ title: { en: null, yi: null } }, "yi")).toBeNull();
  });
});

describe("links", () => {
  it("moment links carry ?t= and &m= for page moment ids, ?t= only otherwise", () => {
    expect(hitHref("en", { shiurId: "x-01", momentId: "x-01~s3", t: 754.4 })).toBe("/en/s/x-01?t=754&m=x-01~s3");
    expect(hitHref("yi", { shiurId: "x-01", momentId: "x-01~wen2.1", t: 10 })).toBe("/yi/s/x-01?t=10");
    expect(hitHref("en", { shiurId: "x-01", momentId: "other~s1", t: 0 })).toBe("/en/s/x-01?t=0");
  });

  it("suggestions link to entity, series, shiur and Explore pages", () => {
    const label = { en: "L", yi: "L" };
    expect(suggestionHref("en", { type: "occasion", key: "noach", label, count: 1 })).toBe("/en/o/noach");
    expect(suggestionHref("en", { type: "work", key: "rambam", label, count: 1 })).toBe("/en/seforim/rambam");
    expect(suggestionHref("yi", { type: "person", key: "noach", label, count: 1 })).toBe("/yi/p/noach");
    expect(suggestionHref("en", { type: "concept", key: "קדושה", label, count: 1 })).toBe(`/en/c/${encodeURIComponent("קדושה")}`);
    expect(suggestionHref("en", { type: "series", key: "tanya-yi", label, count: 1 })).toBe("/en/series/tanya-yi");
    expect(suggestionHref("en", { type: "series-part", seriesKey: "tanya-yi", label, how: "perek", n: 12, shiurId: "yi-tanya-1-03" })).toBe(
      "/en/s/yi-tanya-1-03",
    );
    expect(suggestionHref("yi", { type: "year", year: 5736, count: 1 })).toBe("/yi/explore?year=5736");
  });
});

describe("strings and styles", () => {
  it("Yiddish provides every key", () => {
    expect(Object.keys(searchYi).sort()).toEqual(Object.keys(searchEn).sort());
  });

  it("class list matches the stylesheet", () => {
    const css = readFileSync(join(here, "../Search.module.css"), "utf8");
    const classes = [...new Set([...css.matchAll(/\.([A-Za-z][A-Za-z0-9]*)/g)].map((m) => m[1]!))].sort();
    expect(classes).toEqual([...SEARCH_CLASSES].sort());
  });

  it("the stylesheet uses logical properties only", () => {
    const css = readFileSync(join(here, "../Search.module.css"), "utf8");
    expect(css).not.toMatch(/\b(margin|padding|border)-(left|right)\b|\b(left|right)\s*:|text-align:\s*(left|right)/);
  });
});
