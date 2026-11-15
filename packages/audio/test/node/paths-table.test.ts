import { describe, expect, expectTypeOf, it } from "vitest";
import type { Recording } from "../../../../src/types.ts";
import { asciiFilenameBase, attachmentDisposition, downloadFilename } from "../../src/filename.ts";
import { isPublishableSourceKey, publicObjectKey, refuseSourceKey } from "../../src/keys.ts";
import {
  audioPath,
  audioTimePath,
  downloadPath,
  isAudioId,
  parseAudioPath,
  wantsDownload,
} from "../../src/paths.ts";
import { buildAudioTable, lookupAudio, type AudioTableInput, type AudioTableIssue } from "../../src/table.ts";

describe("URL scheme", () => {
  it("builds audio, download and time paths", () => {
    expect(audioPath("y-parsha-noach-01")).toBe("/audio/y-parsha-noach-01.mp3");
    expect(downloadPath("y-parsha-noach-01")).toBe("/audio/y-parsha-noach-01.mp3?download=1");
    expect(audioTimePath("abc", 754.9)).toBe("/audio/abc.mp3#t=754");
    expect(audioTimePath("abc", -3)).toBe("/audio/abc.mp3#t=0");
  });

  it("refuses to build paths for invalid ids", () => {
    for (const id of ["", "A", "a/b", "..", "a.b", "a_b", "a b", "x".repeat(201)]) {
      expect(() => audioPath(id), id).toThrow();
      expect(isAudioId(id), id).toBe(false);
    }
  });

  it("parses only exact /audio/<id>.mp3 paths", () => {
    expect(parseAudioPath("/audio/abc-1.mp3")).toBe("abc-1");
    for (const p of ["/audio/abc.MP3", "/audio/a/b.mp3", "/audio/%2e%2e.mp3", "/audio/.mp3", "/audio/abc.mp3/", "/x/abc.mp3"]) {
      expect(parseAudioPath(p), p).toBeNull();
    }
  });

  it("round-trips audioPath through parseAudioPath", () => {
    const id = "en-tanya-perek-12-b";
    expect(parseAudioPath(audioPath(id))).toBe(id);
  });

  it("recognises download and dl", () => {
    expect(wantsDownload(new URLSearchParams("download=1"))).toBe(true);
    expect(wantsDownload(new URLSearchParams("dl=1"))).toBe(true);
    expect(wantsDownload(new URLSearchParams("dl=true"))).toBe(true);
    expect(wantsDownload(new URLSearchParams("download=0"))).toBe(false);
    expect(wantsDownload(new URLSearchParams(""))).toBe(false);
  });
});

describe("download filenames", () => {
  it("folds Latin diacritics and typographic punctuation to ASCII", () => {
    expect(asciiFilenameBase("Ḥesed – the Rebbe’s “words”")).toBe("Hesed - the Rebbes words");
    expect(asciiFilenameBase('a/b\\c"d')).toBe("a b c d");
    expect(asciiFilenameBase("...hidden")).toBe("hidden");
  });

  it("falls back to the id when nothing ASCII is left", () => {
    expect(downloadFilename("פרשת נח", "y-noach")).toBe("y-noach.mp3");
    expect(downloadFilename(null, "y-noach")).toBe("y-noach.mp3");
    expect(downloadFilename("The קדושה of צדיקים", "x")).toBe("The of.mp3");
  });

  it("caps the length and never produces quotes or non-ASCII", () => {
    const d = attachmentDisposition("Ж".repeat(10) + "a".repeat(300) + '"', "x");
    expect(d).toMatch(/^attachment; filename="a{100}\.mp3"$/);
  });
});

describe("source key rules", () => {
  it("accepts .mp3 and .MP3", () => {
    expect(isPublishableSourceKey("01 Harav/Y Zemanim/02-01_RH.MP3")).toBe(true);
    expect(isPublishableSourceKey("01 Harav/a b.mp3")).toBe(true);
  });

  it("refuses non-mp3, transcripts/ and odd keys", () => {
    expect(refuseSourceKey("x/02-11 Purim Katan.WMA")).toBe("not-mp3");
    expect(refuseSourceKey("x/a.mp3.json")).toBe("not-mp3");
    expect(refuseSourceKey("transcripts/x/a.mp3")).toBe("transcripts-prefix");
    expect(refuseSourceKey("/Transcripts/x/a.mp3")).toBe("transcripts-prefix");
    expect(refuseSourceKey("x/../transcripts/a.mp3")).toBe("suspicious-key");
    expect(refuseSourceKey("x\\a.mp3")).toBe("suspicious-key");
    expect(refuseSourceKey("")).toBe("suspicious-key");
    expect(refuseSourceKey("a\u0000.mp3")).toBe("suspicious-key");
  });

  it("destination key is <id>.mp3", () => {
    expect(publicObjectKey("abc")).toBe("abc.mp3");
  });
});

describe("buildAudioTable", () => {
  it("maps ids to size and canonical id; duplicates to their canonical", () => {
    const table = buildAudioTable([
      { id: "b", sizeBytes: 20, duplicateOf: null, audioKey: "x/b.mp3" },
      { id: "a", sizeBytes: 10, duplicateOf: null, title: "Shabbos Shuva" },
      { id: "a-copy", sizeBytes: 10, duplicateOf: "a" },
      { id: "a-copy-2", sizeBytes: 999, duplicateOf: "a-copy" },
    ]);
    expect(table).toEqual({
      a: { size: 10, canonicalId: "a", title: "Shabbos Shuva" },
      "a-copy": { size: 10, canonicalId: "a" },
      "a-copy-2": { size: 10, canonicalId: "a" },
      b: { size: 20, canonicalId: "b" },
    });
    expect(Object.keys(table)).toEqual(["a", "a-copy", "a-copy-2", "b"]);
    expect(lookupAudio(table, "a-copy")?.canonicalId).toBe("a");
  });

  it("leaves out and reports bad rows instead of throwing", () => {
    const issues: AudioTableIssue[] = [];
    const table = buildAudioTable(
      [
        { id: "ok", sizeBytes: 1, duplicateOf: null },
        { id: "ok", sizeBytes: 1, duplicateOf: null },
        { id: "Bad/Id", sizeBytes: 1, duplicateOf: null },
        { id: "orphan", sizeBytes: 1, duplicateOf: "gone" },
        { id: "cyc-a", sizeBytes: 1, duplicateOf: "cyc-b" },
        { id: "cyc-b", sizeBytes: 1, duplicateOf: "cyc-a" },
        { id: "wma", sizeBytes: 1, duplicateOf: null, audioKey: "x/y.WMA" },
        { id: "zero", sizeBytes: 0, duplicateOf: null },
      ],
      { onIssue: (i) => issues.push(i) },
    );
    expect(Object.keys(table)).toEqual(["ok"]);
    expect(issues.map((i) => i.kind).sort()).toEqual(
      ["duplicate-cycle", "duplicate-cycle", "duplicate-id", "invalid-id", "invalid-size", "missing-canonical", "unpublishable-key"].sort(),
    );
  });

  it("lookup ignores prototype keys", () => {
    const table = buildAudioTable([{ id: "a", sizeBytes: 1, duplicateOf: null }]);
    expect(lookupAudio(table, "constructor")).toBeNull();
    expect(lookupAudio(table, "__proto__")).toBeNull();
    expect(lookupAudio(table, "toString")).toBeNull();
  });

  it("accepts the pipeline Recording type structurally", () => {
    expectTypeOf<Recording>().toExtend<AudioTableInput>();
  });
});
