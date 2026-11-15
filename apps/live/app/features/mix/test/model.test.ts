import { describe, expect, it } from "vitest";
import { aboutMinutes, interleave, MIX_SIZE, mixPool, rankShiurim, topicMix, type MixSource } from "../model.ts";

/** A section of shiur `s` (index `i`), 5 minutes long. */
function sec(s: string, i: number, lang: "en" | "yi" = "yi", kind?: string): MixSource {
  const t = 100 * i;
  return { id: `${s}~s${i}`, shiurId: s, t, end: t + 300, lang, ...(kind === undefined ? {} : { kind }) };
}

describe("topic mix model", () => {
  it("one section per shiur until the pool runs out, in the order of first appearance", () => {
    const src = [sec("a", 1), sec("a", 2), sec("a", 3), sec("b", 1), sec("c", 4), sec("c", 5)];
    const mix = topicMix(src, { audio: "both" });
    expect(mix.items.map((x) => x.id)).toEqual(["a~s1", "b~s1", "c~s4", "a~s2", "c~s5", "a~s3"]);
    expect(mix.sections).toBe(6);
    expect(mix.shiurim).toBe(3);
  });

  it("takes 12 items and every shiur once before any shiur twice", () => {
    const src: MixSource[] = [];
    for (let s = 0; s < 9; s++) for (let i = 0; i < 4; i++) src.push(sec(`s${s}`, i));
    const mix = topicMix(src, { audio: "both" });
    expect(mix.items).toHaveLength(MIX_SIZE);
    expect(new Set(mix.items.slice(0, 9).map((x) => x.shiurId)).size).toBe(9);
    expect(mix.items.slice(9).map((x) => x.shiurId)).toEqual(["s0", "s1", "s2"]);
    expect(mix.seconds).toBe(12 * 300);
    expect(aboutMinutes(mix.seconds)).toBe(60);
  });

  it("high-salience shiurim first when a salience table is given; ties keep input order", () => {
    const src = [sec("low", 1), sec("mid", 1), sec("high", 1), sec("unknown", 1), sec("mid2", 1)];
    const salience = new Map([
      ["low", 0.2],
      ["mid", 0.6],
      ["mid2", 0.6],
      ["high", 1],
    ]);
    expect(rankShiurim(src, salience)).toEqual(["high", "mid", "mid2", "low", "unknown"]);
    expect(topicMix(src, { audio: "both", salience }).items.map((x) => x.shiurId)).toEqual(["high", "mid", "mid2", "low", "unknown"]);
  });

  it("applies the listener's language filter; language is per item, nothing is paired", () => {
    const src = [sec("y1", 1, "yi"), sec("e1", 1, "en"), sec("y2", 1, "yi"), sec("e1", 2, "en")];
    expect(topicMix(src, { audio: "en" }).items.map((x) => x.id)).toEqual(["e1~s1", "e1~s2"]);
    const yi = topicMix(src, { audio: "yi" });
    expect(yi.items.every((x) => x.lang === "yi")).toBe(true);
    expect([yi.sections, yi.shiurim]).toEqual([2, 2]);
    expect(topicMix(src, { audio: "both" }).items).toHaveLength(4);
  });

  it("keeps main and story sections only: never other_speaker or any other kind", () => {
    const src = [sec("a", 1, "yi", "main"), sec("a", 2, "yi", "other_speaker"), sec("b", 1, "yi", "story"), sec("c", 1, "yi", "intro"), sec("d", 1, "yi")];
    const mix = topicMix(src, { audio: "both" });
    expect(mix.items.map((x) => x.id)).toEqual(["a~s1", "b~s1", "d~s1"]);
    expect(mix.items.some((x) => x.kind === "other_speaker")).toBe(false);
  });

  it("is deterministic and drops duplicates and sections without a playable span", () => {
    const src = [sec("a", 1), sec("a", 1), { ...sec("b", 1), end: 100 }, { ...sec("c", 1), t: Number.NaN }, sec("d", 2)];
    expect(mixPool(src, "both").map((x) => x.id)).toEqual(["a~s1", "d~s2"]);
    const once = topicMix(src, { audio: "both" });
    const twice = topicMix([...src], { audio: "both" });
    expect(twice).toEqual(once);
  });

  it("an empty pool gives an empty mix; size is honoured", () => {
    expect(topicMix([], { audio: "both" })).toEqual({ items: [], sections: 0, shiurim: 0, seconds: 0 });
    expect(aboutMinutes(0)).toBe(0);
    expect(aboutMinutes(20)).toBe(1);
    expect(topicMix([sec("a", 1), sec("b", 1), sec("c", 1)], { audio: "both", size: 2 }).items).toHaveLength(2);
    expect(interleave([sec("a", 1)], ["a", "missing"]).map((x) => x.id)).toEqual(["a~s1"]);
  });
});
