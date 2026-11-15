import { describe, expect, it } from "vitest";
import { normalizeQuery } from "../src/query.ts";
import { trigramMatch, wordsMatch } from "../src/fts.ts";
import { adjust, groupByShiur, rrf } from "../src/rank.ts";
import { decodeCursor, encodeCursor } from "../src/cursor.ts";
import { findMarks, makeSnippet, SNIPPET_LENGTH } from "../src/snippet.ts";
import { parseVectorId, vectorIdFor } from "../src/contract.ts";
import { canonicalSearchKey, parseSearchParams } from "../src/params.ts";

describe("normalizeQuery (search-core shim)", () => {
  it("folds Lag BaOmer spellings to the same tokens", () => {
    const forms = ['ל"ג בעומר', "ל”ג בעומר", "lag baomer", "Lag Ba'Omer"].map((q) => normalizeQuery(q).tokens.join(" "));
    expect(new Set(forms).size).toBe(1);
  });

  it("strips nikud and keeps the pre-variant spelling as an alternative", () => {
    expect(normalizeQuery("בְּרֵאשִׁית").tokens).toEqual(["בראשית"]);
    const q = normalizeQuery("lag baomer");
    expect(q.alternatives).toEqual([["lag", "baomer"]]);
  });

  it("caps the number of tokens", () => {
    expect(normalizeQuery(Array.from({ length: 30 }, (_, i) => `w${i}`).join(" ")).tokens).toHaveLength(12);
  });
});

describe("FTS expressions", () => {
  it("quotes every token and prefix-matches in the word table", () => {
    expect(wordsMatch(normalizeQuery("trust hashem"))).toBe('"trust"* "hashem"*');
    expect(wordsMatch(normalizeQuery("NOT OR AND"))).toBe('"not"* "or"* "and"*');
  });

  it("drops one-letter tokens when longer ones exist; ORs alternatives", () => {
    expect(wordsMatch(normalizeQuery("a trust"))).toBe('"trust"*');
    expect(wordsMatch(normalizeQuery("a"))).toBe('"a"*');
    expect(wordsMatch({ folded: "x", tokens: ["abc"], alternatives: [["de", "fg"]] })).toBe('("abc"*) OR ("de"* "fg"*)');
  });

  it("uses only tokens of three or more characters for trigrams", () => {
    expect(trigramMatch(normalizeQuery("לג בעומר"))).toBe('"בעומר"');
    expect(trigramMatch(normalizeQuery("ab"))).toBeNull();
    expect(wordsMatch(normalizeQuery("   "))).toBeNull();
  });
});

describe("rank fusion and grouping", () => {
  it("adds reciprocal ranks across lists", () => {
    const s = rrf([["a", "b"], ["b", "c"]], 60);
    expect(s.get("a")).toBeCloseTo(1 / 61);
    expect(s.get("b")).toBeCloseTo(1 / 62 + 1 / 61);
    expect(s.get("c")).toBeCloseTo(1 / 62);
  });

  it("boosts catalogued items and damps low confidence", () => {
    expect(adjust(1, { shiurId: "s", catalogued: true, confidence: null })).toBeCloseTo(1.1);
    expect(adjust(1, { shiurId: "s", catalogued: false, confidence: 0.6 })).toBeCloseTo(0.9);
  });

  it("groups by shiur ordered by best moment, deterministic on ties", () => {
    const { ordered, groups } = groupByShiur([
      { id: "x~s1", shiurId: "x", score: 0.2 },
      { id: "y~s0", shiurId: "y", score: 0.5 },
      { id: "x~s0", shiurId: "x", score: 0.4 },
      { id: "z~s0", shiurId: "z", score: 0.4 },
    ]);
    expect(ordered.map((o) => o.id)).toEqual(["y~s0", "x~s0", "x~s1", "z~s0"]);
    expect(groups).toEqual([
      { shiurId: "y", count: 1 },
      { shiurId: "x", count: 2 },
      { shiurId: "z", count: 1 },
    ]);
  });
});

describe("cursor", () => {
  it("round-trips and rejects junk", () => {
    const c = encodeCursor({ offset: 40, rev: "abc" });
    expect(c).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCursor(c)).toEqual({ offset: 40, rev: "abc" });
    expect(decodeCursor("!!!")).toBeNull();
    expect(decodeCursor(encodeCursor({ offset: -1, rev: "x" }))).toBeNull();
    expect(decodeCursor(btoa(JSON.stringify({ o: 1.5, r: "x" })))).toBeNull();
  });
});

describe("snippets", () => {
  it("marks whole words including Hebrew prefixes and in-word quotes", () => {
    const text = 'ל"ג בעומר לערנט מען בתורה';
    const marks = findMarks(text, normalizeQuery('לג תורה').tokens);
    expect(marks.map(([a, b]) => text.slice(a, b))).toEqual(['ל"ג', "בתורה"]);
  });

  it("does not mark unrelated words that merely end with the token after a non-prefix", () => {
    expect(findMarks("גתורה", ["תורה"]).length).toBe(1); // substring rule for ≥3 letters (trigram semantics)
    expect(findMarks("abc xy", ["xy"]).map(([a, b]) => "abc xy".slice(a, b))).toEqual(["xy"]);
    expect(findMarks("axy", ["xy"])).toEqual([]);
  });

  it("returns short texts whole and windows long ones with shifted offsets", () => {
    expect(makeSnippet("Short text about trust.", "en", ["trust"])).toEqual({ text: "Short text about trust.", lang: "en", marks: [[17, 22]] });
    const long = `${"filler words here ".repeat(20)}the key idea is trust in Hashem ${"and more words ".repeat(20)}`;
    const s = makeSnippet(long, "en", ["trust"]);
    expect(s.text.startsWith("…")).toBe(true);
    expect(s.text.endsWith("…")).toBe(true);
    expect(s.text.length).toBeLessThanOrEqual(SNIPPET_LENGTH + 2);
    expect(s.marks.map(([a, b]) => s.text.slice(a, b))).toEqual(["trust"]);
    const none = makeSnippet(long, "en", ["absent"]);
    expect(none.text.startsWith("filler")).toBe(true);
    expect(none.marks).toEqual([]);
  });
});

describe("vector ids and params", () => {
  it("round-trips vector ids", () => {
    expect(parseVectorId(vectorIdFor("a-b~s3", "yi"))).toEqual({ momentId: "a-b~s3", lang: "yi" });
    expect(parseVectorId("a-b~s3")).toBeNull();
    expect(parseVectorId("a@fr")).toBeNull();
  });

  it("canonical cache key ignores parameter and list order", () => {
    const a = parseSearchParams(new URLSearchParams("q=Trust&audio=yi,en&kind=story,section"));
    const b = parseSearchParams(new URLSearchParams("kind=section,story&audio=en,yi&q=Trust"));
    expect(canonicalSearchKey(a)).toBe(canonicalSearchKey(b));
  });
});
