import { describe, expect, it } from "vitest";
import { evaluateConditionals, ifRangeHolds, parseRangeHeader, resolveRange } from "../../src/http.ts";
import { audioEnabled } from "../../src/handler.ts";

describe("parseRangeHeader", () => {
  it("parses the three single-range forms", () => {
    expect(parseRangeHeader("bytes=0-")).toEqual({ kind: "range", range: { offset: 0 } });
    expect(parseRangeHeader("bytes=100-199")).toEqual({ kind: "range", range: { offset: 100, length: 100 } });
    expect(parseRangeHeader("bytes=-500")).toEqual({ kind: "range", range: { suffix: 500 } });
    expect(parseRangeHeader("Bytes = 5 - 9")).toEqual({ kind: "range", range: { offset: 5, length: 5 } });
  });

  it("ignores everything else", () => {
    for (const v of [null, "", "bytes=", "bytes=-", "bytes=9-5", "bytes=0-1,3-4", "items=0-1", "bytes=a-b", "bytes=99999999999999999999-"]) {
      expect(parseRangeHeader(v), String(v)).toEqual({ kind: "none" });
    }
  });
});

describe("resolveRange", () => {
  it("resolves and clamps", () => {
    expect(resolveRange({ offset: 0 }, 1000)).toEqual({ start: 0, end: 999 });
    expect(resolveRange({ offset: 100, length: 100 }, 1000)).toEqual({ start: 100, end: 199 });
    expect(resolveRange({ offset: 900, length: 500 }, 1000)).toEqual({ start: 900, end: 999 });
    expect(resolveRange({ suffix: 500 }, 1000)).toEqual({ start: 500, end: 999 });
    expect(resolveRange({ suffix: 5000 }, 1000)).toEqual({ start: 0, end: 999 });
  });

  it("returns null when unsatisfiable", () => {
    expect(resolveRange({ offset: 1000 }, 1000)).toBeNull();
    expect(resolveRange({ suffix: 0 }, 1000)).toBeNull();
    expect(resolveRange({ offset: 0 }, 0)).toBeNull();
  });
});

describe("evaluateConditionals", () => {
  const etag = '"abc"';
  const lm = new Date("2026-10-01T12:00:00.750Z");
  const h = (init: Record<string, string>) => new Headers(init);

  it("If-None-Match: match → not-modified, weak compare, list and *", () => {
    expect(evaluateConditionals(h({ "if-none-match": '"abc"' }), etag, lm)).toBe("not-modified");
    expect(evaluateConditionals(h({ "if-none-match": 'W/"abc"' }), etag, lm)).toBe("not-modified");
    expect(evaluateConditionals(h({ "if-none-match": '"x", "abc"' }), etag, lm)).toBe("not-modified");
    expect(evaluateConditionals(h({ "if-none-match": "*" }), etag, lm)).toBe("not-modified");
    expect(evaluateConditionals(h({ "if-none-match": '"x"' }), etag, lm)).toBe("ok");
  });

  it("If-None-Match takes precedence over If-Modified-Since", () => {
    const future = new Date("2030-01-01").toUTCString();
    expect(evaluateConditionals(h({ "if-none-match": '"x"', "if-modified-since": future }), etag, lm)).toBe("ok");
  });

  it("If-Modified-Since compares at second precision", () => {
    expect(evaluateConditionals(h({ "if-modified-since": lm.toUTCString() }), etag, lm)).toBe("not-modified");
    const before = new Date(lm.getTime() - 2000).toUTCString();
    expect(evaluateConditionals(h({ "if-modified-since": before }), etag, lm)).toBe("ok");
    expect(evaluateConditionals(h({ "if-modified-since": "garbage" }), etag, lm)).toBe("ok");
  });

  it("If-Match uses strong comparison; If-Unmodified-Since", () => {
    expect(evaluateConditionals(h({ "if-match": '"abc"' }), etag, lm)).toBe("ok");
    expect(evaluateConditionals(h({ "if-match": 'W/"abc"' }), etag, lm)).toBe("precondition-failed");
    expect(evaluateConditionals(h({ "if-match": '"zzz"' }), etag, lm)).toBe("precondition-failed");
    expect(evaluateConditionals(h({ "if-unmodified-since": "Mon, 01 Jan 2001 00:00:00 GMT" }), etag, lm)).toBe(
      "precondition-failed",
    );
  });

  it("If-Range: strong ETag or exact date", () => {
    expect(ifRangeHolds('"abc"', etag, lm)).toBe(true);
    expect(ifRangeHolds('W/"abc"', etag, lm)).toBe(false);
    expect(ifRangeHolds('"old"', etag, lm)).toBe(false);
    expect(ifRangeHolds(lm.toUTCString(), etag, lm)).toBe(true);
    expect(ifRangeHolds("Mon, 01 Jan 2001 00:00:00 GMT", etag, lm)).toBe(false);
  });
});

describe("audioEnabled", () => {
  it("is on only for explicit true values", () => {
    expect(audioEnabled("true")).toBe(true);
    expect(audioEnabled(" TRUE ")).toBe(true);
    expect(audioEnabled(true)).toBe(true);
    for (const v of ["false", "", "0", "off", undefined, false]) expect(audioEnabled(v), String(v)).toBe(false);
  });
});
