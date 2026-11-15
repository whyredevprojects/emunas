import { describe, expect, expectTypeOf, it } from "vitest";
import type { Recording } from "../../../src/types.ts";
import {
  DEFAULT_MEDIA_ORIGIN,
  buildAudioTable,
  encodeKeyPath,
  isPlayableKey,
  lookupAudio,
  mediaTimeUrl,
  mediaUrl,
  normalizeMediaOrigin,
  refuseKey,
  unplayableReason,
  type AudioTableInput,
  type AudioTableIssue,
} from "../src/index.ts";

const ORIGIN = "https://media.example.org";

/** Inverse of the encoding: decode each segment. */
const decodePath = (url: string, origin = ORIGIN) =>
  url.slice(origin.length + 1).split("/").map(decodeURIComponent).join("/");

describe("normalizeMediaOrigin", () => {
  it("accepts scheme://host[:port], drops a trailing slash", () => {
    expect(normalizeMediaOrigin("https://media.example.org")).toBe(ORIGIN);
    expect(normalizeMediaOrigin("https://media.example.org/")).toBe(ORIGIN);
    expect(normalizeMediaOrigin(" https://Media.Example.org:8443 ")).toBe("https://media.example.org:8443");
    expect(normalizeMediaOrigin("http://localhost:8787")).toBe("http://localhost:8787");
    expect(normalizeMediaOrigin(DEFAULT_MEDIA_ORIGIN)).toBe(DEFAULT_MEDIA_ORIGIN);
  });

  it("rejects paths, queries, credentials, non-https and garbage", () => {
    for (const o of [
      "",
      "media.example.org",
      "http://media.example.org",
      "ftp://media.example.org",
      "https://media.example.org/audio",
      "https://media.example.org/?x=1",
      "https://media.example.org?",
      "https://media.example.org/#a",
      "https://user:pw@media.example.org",
      "javascript:alert(1)",
    ]) {
      expect(() => normalizeMediaOrigin(o), o).toThrow();
    }
  });
});

describe("mediaUrl: per-segment encoding", () => {
  it("encodes spaces, keeps slashes between segments", () => {
    const key = "01 Harav Moshe Wolfson - Yiddish Shiurim/Simchos/Bar Mitzvah/01 bar mitzva Vaera.mp3";
    const url = mediaUrl(key, ORIGIN);
    expect(url).toBe(
      "https://media.example.org/01%20Harav%20Moshe%20Wolfson%20-%20Yiddish%20Shiurim/Simchos/Bar%20Mitzvah/01%20bar%20mitzva%20Vaera.mp3",
    );
    expect(decodePath(url)).toBe(key);
  });

  it("encodes Hebrew as UTF-8 octets and round-trips", () => {
    const key =
      "02 Harav Moshe Wolfson - English Shiurim/E Zman/01 Elul-Tishrei E/02-02 Rosh Hashana E - Recreating the World through מלכיות זכרונות שופרות _תקיעת שופר.mp3";
    const url = mediaUrl(key, ORIGIN);
    expect(url).toContain("/02-02%20Rosh%20Hashana%20E%20-%20Recreating%20the%20World%20through%20%D7%9E%D7%9C%D7%9B");
    expect(url).not.toMatch(/[^\x21-\x7e]/); // pure printable ASCII
    expect(decodePath(url)).toBe(key);
    // The URL parser agrees: the pathname stays as encoded, segment count preserved.
    expect(new URL(url).pathname.split("/")).toHaveLength(key.split("/").length + 1);
  });

  it("encodes # ? % + & so they stay part of the key", () => {
    const key = "PURIM SEUDOS/Purim  5777 Cd #1/Track 01?a=b&c+d%20.mp3";
    const url = mediaUrl(key, ORIGIN);
    expect(url).toBe("https://media.example.org/PURIM%20SEUDOS/Purim%20%205777%20Cd%20%231/Track%2001%3Fa%3Db%26c%2Bd%2520.mp3");
    const parsed = new URL(url);
    expect(parsed.search).toBe("");
    expect(parsed.hash).toBe("");
    expect(decodePath(url)).toBe(key);
  });

  it("does not normalise Unicode (the bucket key is used byte for byte)", () => {
    const nfd = "x/é.mp3";
    expect(decodePath(mediaUrl(nfd, ORIGIN))).toBe(nfd);
    expect(encodeKeyPath(nfd)).toBe("x/e%CC%81.mp3");
  });

  it("refuses transcript-ish and malformed keys", () => {
    for (const [key, why] of [
      ["transcripts/a/b.json", "forbidden-substring"],
      ["x/Transcripts/a.mp3", "forbidden-substring"],
      ["x/a.vtt", "forbidden-substring"],
      ["", "empty"],
      ["/x/a.mp3", "suspicious-key"],
      ["x//a.mp3", "suspicious-key"],
      ["x/../a.mp3", "suspicious-key"],
      ["x/./a.mp3", "suspicious-key"],
      ["x\\a.mp3", "suspicious-key"],
      ["x/a\u0000.mp3", "suspicious-key"],
    ] as const) {
      expect(refuseKey(key), key).toBe(why);
      expect(() => mediaUrl(key, ORIGIN), key).toThrow();
    }
  });

  it("time links floor seconds", () => {
    const url = mediaUrl("a/b.mp3", ORIGIN);
    expect(mediaTimeUrl(url, 754.9)).toBe(`${url}#t=754`);
    expect(mediaTimeUrl(url, -3)).toBe(`${url}#t=0`);
    expect(mediaTimeUrl(url, Number.NaN)).toBe(`${url}#t=0`);
  });
});

describe("playability", () => {
  it(".mp3 in any case is playable; .WMA and others are not", () => {
    expect(isPlayableKey("x/a.mp3")).toBe(true);
    expect(isPlayableKey("01 Harav/Y Zemanim/02-01_RH.MP3")).toBe(true);
    expect(unplayableReason("x/02-11 Purim Katan.WMA")).toBe("not-mp3");
    expect(unplayableReason("x/a.mp3.json")).toBe("not-mp3");
    expect(unplayableReason("x/a.m4a")).toBe("not-mp3");
    expect(unplayableReason("transcripts/a.mp3")).toBe("forbidden-substring");
  });
});

describe("buildAudioTable", () => {
  const recs: AudioTableInput[] = [
    { id: "b", audioKey: "Dir B/b 1.mp3", sizeBytes: 20, duplicateOf: null },
    { id: "a", audioKey: "Dir A/a.MP3", sizeBytes: 10, duplicateOf: null },
    { id: "a-copy", audioKey: "Dir A/copy of a.mp3", sizeBytes: 10, duplicateOf: "a" },
    { id: "a-copy-2", audioKey: "Dir A/copy of copy.mp3", sizeBytes: 999, duplicateOf: "a-copy" },
    { id: "wma", audioKey: "Dir W/02-11 Purim Katan.WMA", sizeBytes: 5, duplicateOf: null },
    { id: "wma-dup", audioKey: "Dir W/dup.mp3", sizeBytes: 5, duplicateOf: "wma" },
  ];

  it("maps id → url/canonical/playable; duplicates share the canonical url", () => {
    const issues: AudioTableIssue[] = [];
    const table = buildAudioTable(recs, { origin: `${ORIGIN}/`, onIssue: (i) => issues.push(i) });
    expect(Object.keys(table)).toEqual(["a", "a-copy", "a-copy-2", "b", "wma", "wma-dup"]);
    const aUrl = `${ORIGIN}/Dir%20A/a.MP3`;
    expect(table["a"]).toEqual({ canonicalId: "a", size: 10, playable: true, url: aUrl });
    expect(table["a-copy"]).toEqual({ canonicalId: "a", size: 10, playable: true, url: aUrl });
    expect(table["a-copy-2"]).toEqual({ canonicalId: "a", size: 10, playable: true, url: aUrl });
    expect(table["b"]).toEqual({ canonicalId: "b", size: 20, playable: true, url: `${ORIGIN}/Dir%20B/b%201.mp3` });
    expect(table["wma"]).toEqual({ canonicalId: "wma", size: 5, playable: false, url: null });
    // A duplicate of an unplayable recording is unplayable even if its own key is .mp3.
    expect(table["wma-dup"]).toEqual({ canonicalId: "wma", size: 5, playable: false, url: null });
    expect(issues).toEqual([
      { kind: "unplayable", id: "wma", reason: "not-mp3" },
      { kind: "unplayable", id: "wma-dup", reason: "not-mp3" },
    ]);
    expect(lookupAudio(table, "a-copy")?.canonicalId).toBe("a");
  });

  it("never copies the bucket key into the table as a field", () => {
    const table = buildAudioTable(recs, { origin: ORIGIN });
    const json = JSON.stringify(table);
    expect(json).not.toContain("audioKey");
    expect(json).not.toContain("Dir A/"); // only the encoded form appears
  });

  it("`only` limits output but still resolves canonicals outside it", () => {
    const table = buildAudioTable(recs, { origin: ORIGIN, only: ["a-copy-2", "nope"] });
    expect(Object.keys(table)).toEqual(["a-copy-2"]);
    expect(table["a-copy-2"]?.canonicalId).toBe("a");
  });

  it("broken chains and bad rows become unplayable and are reported, never thrown", () => {
    const issues: AudioTableIssue[] = [];
    const table = buildAudioTable(
      [
        { id: "ok", audioKey: "a.mp3", sizeBytes: 1, duplicateOf: null },
        { id: "ok", audioKey: "b.mp3", sizeBytes: 1, duplicateOf: null },
        { id: "orphan", audioKey: "c.mp3", sizeBytes: 1, duplicateOf: "gone" },
        { id: "cyc-a", audioKey: "d.mp3", sizeBytes: 1, duplicateOf: "cyc-b" },
        { id: "cyc-b", audioKey: "e.mp3", sizeBytes: 1, duplicateOf: "cyc-a" },
        { id: "tx", audioKey: "transcripts/x/f.mp3", sizeBytes: 1, duplicateOf: null },
        { id: "neg", audioKey: "g.mp3", sizeBytes: -1, duplicateOf: null },
      ],
      { origin: ORIGIN, onIssue: (i) => issues.push(i) },
    );
    expect(table["ok"]).toEqual({ canonicalId: "ok", size: 1, playable: true, url: `${ORIGIN}/a.mp3` });
    for (const id of ["orphan", "cyc-a", "cyc-b", "tx"]) expect(table[id]?.playable, id).toBe(false);
    expect(table["neg"]).toEqual({ canonicalId: "neg", size: 0, playable: true, url: `${ORIGIN}/g.mp3` });
    expect(issues.map((i) => i.kind).sort()).toEqual(
      ["duplicate-cycle", "duplicate-cycle", "duplicate-id", "invalid-size", "missing-canonical", "unplayable"].sort(),
    );
    expect(JSON.stringify(table)).not.toContain("transcripts/");
  });

  it("throws on an invalid origin", () => {
    expect(() => buildAudioTable(recs, { origin: "http://media.example.org" })).toThrow();
  });

  it("lookup ignores prototype keys", () => {
    const table = buildAudioTable([{ id: "a", audioKey: "a.mp3", sizeBytes: 1, duplicateOf: null }], { origin: ORIGIN });
    expect(lookupAudio(table, "constructor")).toBeNull();
    expect(lookupAudio(table, "__proto__")).toBeNull();
  });

  it("accepts the pipeline Recording type structurally", () => {
    expectTypeOf<Recording>().toExtend<AudioTableInput>();
  });
});
