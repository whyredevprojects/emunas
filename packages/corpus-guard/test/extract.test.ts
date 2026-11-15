import { describe, expect, it } from "vitest";
import { decodeHtmlEntities, decodeJsEscapes, htmlProse, htmlToText } from "../src/extract.ts";
import { findKeysInText, findSubstrings } from "../src/rules.ts";
import { tokenize } from "../src/tokenize.ts";

describe("extract", () => {
  it("decodes HTML entities", () => {
    expect(decodeHtmlEntities("a &amp; b &#1488;&#x5D1; &quot;q&quot; &unknown;")).toBe('a & b אב "q" &unknown;');
  });

  it("decodes JS escapes", () => {
    expect(decodeJsEscapes("\\u05d0\\u05d1 \\x41 \\u{1F600} \\\"x\\\" a\\/b")).toBe('אב A 😀 "x" a/b');
  });

  it("keeps script payload text with escapes decoded and drops styles", () => {
    const t = htmlToText(`<style>.x{color:red}</style><p>one <b>two</b></p><script>var d="\\u05e9\\u05dc\\u05d5\\u05dd"</script>`);
    expect(tokenize(t)).toEqual(["one", "two", "var", "d", "שלום"]);
  });

  it("appends attribute values after the text so inline tags don't split runs", () => {
    const t = htmlToText(`<p>alpha <a href="#s3" title="tip">beta</a> gamma</p>`);
    expect(tokenize(t)).toEqual(["alpha", "beta", "gamma", "s3", "tip"]);
  });

  it("htmlProse also offers a copy without short inline markers", () => {
    const t = htmlProse(`<p>alpha<sup>3</sup> beta</p>`);
    expect(t).toContain("alpha");
    expect(tokenize(t).join(" ")).toContain("alpha beta");
  });
});

describe("rules", () => {
  it("finds quoted forbidden keys and bare distinctive keys", () => {
    const found = findKeysInText(`{"segments":[1]} x={audioKey:1} y.heardAs:2 'asrNotes' : 3 {segments:1}`);
    expect(Object.fromEntries(found)).toEqual({ segments: 1, audioKey: 1, asrNotes: 1 });
  });

  it("counts forbidden substrings", () => {
    expect(Object.fromEntries(findSubstrings("transcripts/a transcripts/b .vtt"))).toEqual({ "transcripts/": 2, ".vtt": 1 });
  });
});
