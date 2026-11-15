import { describe, expect, it } from "vitest";
import { collectShiurItems } from "../src/items.ts";
import { SHIUR, shiurJson } from "./fixtures.ts";

describe("collectShiurItems", () => {
  const units = collectShiurItems(shiurJson())!;
  const idsOf = (field: string) => [...new Set(units.items.filter((i) => i.field === field).map((i) => i.id))];

  it("reads recordings and skips catalog text by default", () => {
    expect(units.shiurId).toBe(SHIUR);
    expect(units.recordingIds).toEqual(["yi-test-rec-01"]);
    expect(units.items.some((i) => i.field.startsWith("catalog"))).toBe(false);
    const all = collectShiurItems(shiurJson(), { skipTopLevel: [] })!;
    expect(all.items.some((i) => i.field === "catalog.titleOriginal")).toBe(true);
  });

  it("uses moment ids where present", () => {
    expect(idsOf("notes.summary.keyPoints[].text.en")).toEqual([`${SHIUR}~kp0`]);
    expect(idsOf("notes.insights[].text.en")).toEqual([`${SHIUR}~i0`]);
    expect(idsOf("notes.takeaways[].text.en")).toEqual([`${SHIUR}~tk0`]);
  });

  it("derives ids for summary, chapters, subsections and write-up paragraphs", () => {
    expect(idsOf("notes.summary.oneLiner.en")).toEqual([`${SHIUR}~ol0`]);
    expect(idsOf("notes.summary.abstract.yi")).toEqual([`${SHIUR}~ab0`]);
    expect(idsOf("notes.chapters[].summary.en")).toEqual([`${SHIUR}~s0`]);
    expect(idsOf("notes.chapters[].sub[].summary.en")).toEqual([`${SHIUR}~s0.0`]);
    expect(idsOf("notes.writeup.en[].heading")).toEqual([`${SHIUR}~w-en-0-h`]);
    expect(idsOf("notes.writeup.en[].paragraphs[].text")).toEqual([`${SHIUR}~w-en-0-p0`]);
    expect(idsOf("notes.writeup.yi[].paragraphs[].text")).toEqual([`${SHIUR}~w-yi-0-p0`]);
  });

  it("qualifies bare moment ids and falls back to a path id", () => {
    const u = collectShiurItems({ id: "s1", recordings: [], notes: { insights: [{ id: "i3", text: { en: "x" } }], extra: ["y"] } })!;
    expect(u.items.find((i) => i.text === "x")!.id).toBe("s1~i3");
    expect(u.items.find((i) => i.text === "y")!.id).toBe("s1~notes.extra.0");
  });

  it("rejects non-shiur input", () => {
    expect(collectShiurItems(null)).toBeNull();
    expect(collectShiurItems({ notes: {} })).toBeNull();
  });
});
