/** Shared playlist links: `/:ui/pl#<base64url(JSON [shiurId, t, end?][])>` round-trips; bad input is null. */
import { describe, expect, it } from "vitest";
import { decodePlaylist, encodePlaylist, playlistPath, toTuples } from "./playlist-link.ts";
import { LIMITS, type MomentRef } from "./schema.ts";

const ref = (shiurId: string, start: number, end: number | null = null): MomentRef => ({ shiurId, start, end, momentId: null });

const lists: MomentRef[][] = [
  [ref("yi-tanya-1-01", 0)],
  [ref("yi-parshas-hashavua-brshys-01", 754, 812.5), ref("en-parsha-en-nch-01", 0.1), ref("yi-zmanim-tv-bb-04", 3601.7, 4000)],
  Array.from({ length: 200 }, (_, i) => ref(`yi-series-${i}`, i * 10.5, i * 10.5 + 30)),
];

describe("encode / decode", () => {
  it.each(lists.map((l, i) => [i, l] as const))("round-trips list %i", (_i, list) => {
    const hash = encodePlaylist(list);
    expect(hash).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodePlaylist(hash)).toEqual(list);
    expect(decodePlaylist(`#${hash}`)).toEqual(list);
  });

  it("the payload is the documented tuple format", () => {
    const hash = encodePlaylist([ref("a-1", 5), ref("b-2", 6, 9)]);
    const json = new TextDecoder().decode(Uint8Array.from(atob(hash.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)));
    expect(JSON.parse(json)).toEqual([
      ["a-1", 5],
      ["b-2", 6, 9],
    ]);
  });

  it("rounds times to 0.1 s and drops the moment id (links carry ids and times only)", () => {
    expect(toTuples([{ shiurId: "a", start: 1.234, end: 7.891 }])).toEqual([["a", 1.2, 7.9]]);
    const back = decodePlaylist(encodePlaylist([{ shiurId: "a", start: 1.26, end: null, momentId: "a~s1" } as MomentRef]));
    expect(back).toEqual([ref("a", 1.3)]);
  });

  it("builds the page path in either interface language", () => {
    expect(playlistPath("yi", [ref("a", 1)])).toMatch(/^\/yi\/pl#[A-Za-z0-9_-]+$/);
  });
});

describe("rejects malformed links", () => {
  const enc = (v: unknown) => btoa(JSON.stringify(v)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  it.each([
    ["empty", ""],
    ["just #", "#"],
    ["not base64url", "abc$%"],
    ["not JSON", btoa("not json")],
    ["not an array", enc({ a: 1 })],
    ["empty array", enc([])],
    ["tuple too short", enc([["a"]])],
    ["tuple too long", enc([["a", 1, 2, 3]])],
    ["bad id", enc([["../../x", 1]])],
    ["id with spaces", enc([["a b", 1]])],
    ["negative time", enc([["a", -1]])],
    ["end before start", enc([["a", 5, 4]])],
    ["NaN-ish", enc([["a", "5"]])],
    ["huge time", enc([["a", 1e9]])],
    ["one bad item spoils the list", enc([["a", 1], ["b", -2]])],
    ["too many items", enc(Array.from({ length: LIMITS.playlistItems + 1 }, () => ["a", 1]))],
    ["invalid UTF-8", btoa(String.fromCharCode(0xff, 0xfe)).replace(/=+$/, "")],
  ])("%s", (_name, hash) => {
    expect(decodePlaylist(hash)).toBeNull();
  });
});
