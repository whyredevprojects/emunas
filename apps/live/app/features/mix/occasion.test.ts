/**
 * C3.4 acceptance for the occasion mix model: the pool (inline head + the topic's tagged sections,
 * the occasion's catalog shiurim first), featured eligibility (D7: other-speaker shiurim and
 * sections of excluded topics, named by the build in `skip`) and determinism.
 */
import { describe, expect, it } from "vitest";
import { MIX_SIZE, type MixSource } from "./model.ts";
import { headSources, isFeatured, occasionCatalog, occasionMix, shiurOf, skipSet } from "./occasion.ts";
import todayFixture from "../../data/fixtures/data/today.en.json" with { type: "json" };
import type { TodayFile } from "../../data/index.ts";

const today = todayFixture as unknown as TodayFile;

/** A section of shiur `s` (index `i`), 5 minutes long. */
function sec(s: string, i: number, lang: "en" | "yi" = "yi", kind?: string): MixSource {
  const t = 100 * i;
  return { id: `${s}~s${i}`, shiurId: s, t, end: t + 300, lang, ...(kind === undefined ? {} : { kind }) };
}

const ids = (xs: readonly MixSource[]) => xs.map((x) => x.id);

describe("occasion mix: pool", () => {
  it("the head plays first, in its order, then the topic's sections one per shiur", () => {
    const head = [sec("cat1", 3), sec("x", 1)];
    const topic = [sec("x", 1), sec("x", 2), sec("y", 1), sec("y", 2), sec("cat1", 3), sec("cat1", 4), sec("z", 1)];
    const mix = occasionMix({ head, topic, audio: "both" });
    // x~s1 and cat1~s3 are not repeated; shiurim already in the head wait for the next round.
    expect(ids(mix.items)).toEqual(["cat1~s3", "x~s1", "y~s1", "z~s1", "x~s2", "y~s2", "cat1~s4"]);
    expect(mix.sections).toBe(7);
    expect(mix.shiurim).toBe(4);
    expect(mix.seconds).toBe(7 * 300);
  });

  it("draws from both the occasion's catalog shiurim and the topic's tags: catalog shiurim lead each round", () => {
    const topic = [sec("a", 1), sec("b", 1), sec("cat", 1), sec("a", 2), sec("cat", 2), sec("c", 1)];
    const mix = occasionMix({ head: [], topic, catalog: ["cat", "not-in-pool"], audio: "both" });
    expect(ids(mix.items)).toEqual(["cat~s1", "a~s1", "b~s1", "c~s1", "cat~s2", "a~s2"]);
  });

  it("takes at most 12 items and every shiur once before any shiur twice", () => {
    const topic: MixSource[] = [];
    for (let s = 0; s < 9; s++) for (let i = 0; i < 3; i++) topic.push(sec(`s${s}`, i));
    const mix = occasionMix({ head: [sec("s4", 0)], topic, audio: "both" });
    expect(mix.items).toHaveLength(MIX_SIZE);
    expect(new Set(mix.items.slice(0, 9).map((x) => x.shiurId)).size).toBe(9);
    expect(mix.sections).toBe(27);
  });

  it("applies the audio filter to the head and the rest; nothing pairs languages", () => {
    const head = [sec("en1", 1, "en"), sec("yi1", 1, "yi")];
    const topic = [sec("en2", 1, "en"), sec("yi2", 1, "yi"), sec("yi1", 2, "yi")];
    const yi = occasionMix({ head, topic, audio: "yi" });
    expect(yi.items.every((x) => x.lang === "yi")).toBe(true);
    expect(ids(yi.items)).toEqual(["yi1~s1", "yi2~s1", "yi1~s2"]);
    const en = occasionMix({ head, topic, audio: "en" });
    expect(ids(en.items)).toEqual(["en1~s1", "en2~s1"]);
  });

  it("drops non-mix kinds, broken times and duplicates", () => {
    const topic = [sec("a", 1, "yi", "other_speaker"), { ...sec("b", 1), end: 50 }, sec("c", 1, "yi", "story"), sec("c", 1)];
    expect(ids(occasionMix({ head: [], topic, audio: "both" }).items)).toEqual(["c~s1"]);
  });

  it("an empty pool is an empty mix", () => {
    expect(occasionMix({ head: [], audio: "both" })).toEqual({ items: [], sections: 0, shiurim: 0, seconds: 0 });
  });
});

describe("occasion mix: featured eligibility (D7)", () => {
  it("a shiur mostly by another speaker is out, head and rest alike", () => {
    const head = [sec("other", 1), sec("ok", 1)];
    const topic = [sec("other", 2), sec("ok", 2), sec("fine", 1)];
    const mix = occasionMix({ head, topic, skip: ["other"], audio: "both" });
    expect(mix.items.some((x) => x.shiurId === "other")).toBe(false);
    expect(ids(mix.items)).toEqual(["ok~s1", "fine~s1", "ok~s2"]);
    expect(mix.shiurim).toBe(2);
  });

  it("a section tagged with an excluded topic is out; the rest of its shiur stays", () => {
    const topic = [sec("a", 1), sec("a", 2), sec("b", 1)];
    const mix = occasionMix({ head: [], topic, skip: ["a~s1"], audio: "both" });
    expect(ids(mix.items)).toEqual(["a~s2", "b~s1"]);
  });

  it("isFeatured checks the shiur and the section id", () => {
    const skip = new Set(["s", "t~s2"]);
    expect(isFeatured(sec("s", 1), skip)).toBe(false);
    expect(isFeatured(sec("t", 2), skip)).toBe(false);
    expect(isFeatured(sec("t", 1), skip)).toBe(true);
  });

  it("skipSet reads the build's list defensively", () => {
    expect([...skipSet({ topicId: "x", skip: ["a", "b~s1"] })]).toEqual(["a", "b~s1"]);
    expect([...skipSet({ topicId: "x" })]).toEqual([]);
    expect([...skipSet(null)]).toEqual([]);
    expect([...skipSet({ topicId: "x", skip: [1, "a"] as unknown as string[] })]).toEqual(["a"]);
  });
});

describe("occasion mix: determinism", () => {
  it("the same inputs give the same mix, and the input order of the catalog does not matter", () => {
    const topic: MixSource[] = [];
    for (let s = 0; s < 6; s++) for (let i = 0; i < 3; i++) topic.push(sec(`s${s}`, i, s % 2 ? "en" : "yi"));
    const a = occasionMix({ head: [sec("s3", 1, "en")], topic, catalog: ["s5", "s2"], skip: ["s1"], audio: "both" });
    const b = occasionMix({ head: [sec("s3", 1, "en")], topic: [...topic], catalog: ["s2", "s5"], skip: new Set(["s1"]), audio: "both" });
    expect(ids(b.items)).toEqual(ids(a.items));
    expect(ids(a.items).slice(0, 3)).toEqual(["s3~s1", "s2~s0", "s5~s0"]);
  });
});

describe("Today file inputs", () => {
  it("shiurOf takes the moment id's prefix", () => {
    expect(shiurOf("yi-zmanim-pvrym-07~s1")).toBe("yi-zmanim-pvrym-07");
    expect(shiurOf("plain")).toBe("plain");
  });

  it("headSources reads the inline items with each shiur's language from the cards; unknown cards drop", () => {
    const mix = today.occasions["pesach"]!.mix!;
    const head = headSources(mix, (id) => today.cards[id]?.lang);
    expect(head.length).toBe(mix.first.length);
    for (const h of head) {
      expect(h.shiurId).toBe(shiurOf(h.id));
      expect(h.lang).toBe(today.cards[h.shiurId]!.lang);
      expect(h.end).toBeGreaterThan(h.t);
    }
    expect(headSources(mix, () => undefined)).toEqual([]);
    expect(headSources(null, () => "en")).toEqual([]);
  });

  it("occasionCatalog joins the rows and the moment pools of every key, deduped", () => {
    const o = today.occasions;
    const cat = occasionCatalog([o["purim"], o["shushan-purim"], undefined]);
    expect(cat).toEqual([...new Set([...o["purim"]!.shiurIds, ...o["purim"]!.moments.map((m) => shiurOf(m.id)), ...o["shushan-purim"]!.shiurIds])]);
  });

  it("the build's head already prefers the occasion's own shiurim (same rule as the client's rest)", () => {
    // Fixture: Pesach's own shiur leads its mix.
    const o = today.occasions["pesach"]!;
    expect(shiurOf(o.mix!.first[0]!.id)).toBe(o.shiurIds[0]);
  });
});
