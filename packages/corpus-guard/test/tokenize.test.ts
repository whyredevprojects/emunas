import { describe, expect, it } from "vitest";
import { ShingleIndex, Vocabulary, concatWithBreaks, BREAK } from "../src/shingles.ts";
import { tokenize } from "../src/tokenize.ts";

describe("tokenize", () => {
  it("lowercases and keeps only letters/digits", () => {
    expect(tokenize("Hello, World! 42 times—again.")).toEqual(["hello", "world", "42", "times", "again"]);
  });

  it("strips nikud and cantillation (U+0591–U+05C7)", () => {
    expect(tokenize("בְּרֵאשִׁ֖ית בָּרָ֣א")).toEqual(["בראשית", "ברא"]);
  });

  it("splits on maqaf and sof pasuq instead of gluing words", () => {
    expect(tokenize("עַל־פִּי הַשָּׁמָֽיִם׃ וְהָאָרֶץ")).toEqual(["על", "פי", "השמים", "והארץ"]);
  });

  it("unifies quote marks: gershayim, ASCII and typographic quotes give the same token", () => {
    const a = tokenize("חז״ל");
    expect(tokenize('חז"ל')).toEqual(a);
    expect(tokenize("חז”ל")).toEqual(a);
    expect(tokenize("חזל")).toEqual(a);
    expect(tokenize("don’t")).toEqual(tokenize("don't"));
    expect(tokenize("ר׳ משה")).toEqual(tokenize("ר' משה"));
  });

  it("applies NFC so composed and decomposed forms match", () => {
    expect(tokenize("café")).toEqual(tokenize("café"));
  });

  it("quotes at word edges separate", () => {
    expect(tokenize('"quoted" words')).toEqual(["quoted", "words"]);
  });
});

describe("ShingleIndex", () => {
  const vocab = new Vocabulary();
  const enc = (s: string, add: boolean) =>
    Int32Array.from(tokenize(s).map((t) => (add ? vocab.intern(t) : vocab.lookup(t))));

  const source = "a b c d e f g h i j k l m n o p q r s t u v w x y z";
  const idx = new ShingleIndex(enc(source, true), 5);

  it("finds the exact length of a shared run", () => {
    const runs = idx.findRuns(enc("zz yy c d e f g h i yy", false));
    expect(runs).toEqual([{ start: 2, length: 7 }]);
  });

  it("ignores runs shorter than K", () => {
    expect(idx.findRuns(enc("c d e f yy", false))).toEqual([]);
  });

  it("does not match across a BREAK", () => {
    const left = enc("one two three four", true);
    const right = enc("five six seven eight", true);
    const broken = new ShingleIndex(concatWithBreaks([left, right]), 5);
    expect(broken.tokens.includes(BREAK)).toBe(true);
    expect(broken.findRuns(enc("one two three four five six", false))).toEqual([]);
  });

  it("unknown tokens never match", () => {
    expect(idx.findRuns(enc("a b c unknownword d e f g h", false))).toEqual([{ start: 4, length: 5 }]);
  });

  it("reports separate maximal runs", () => {
    const runs = idx.findRuns(enc("a b c d e f xx m n o p q r", false));
    expect(runs.map((r) => r.length)).toEqual([6, 6]);
  });

  it("handles an empty index", () => {
    const empty = new ShingleIndex(new Int32Array(0), 5);
    expect(empty.findRuns(enc(source, false))).toEqual([]);
  });
});
