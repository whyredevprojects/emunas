/**
 * scripts/verify-cleaned.ts: expected keys from a tiny ingest, listing comparison, pagination with
 * a mocked S3 client, and (when ffmpeg is present) the duration check on synthetic MP3s.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { afterAll, describe, expect, it } from "vitest";
import {
  compareCleaned,
  listCleaned,
  readRejected,
  servedKeysOf,
  verifyDuration,
  type ListedObject,
} from "../scripts/verify-cleaned.ts";
import type { S3Like } from "../scripts/transcode-wma.ts";

const dir = mkdtempSync(join(tmpdir(), "verify-cleaned-test-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const rec = (id: string, audioKey: string, duplicateOf: string | null = null, durationSec: number | null = 60) => ({
  id,
  audioKey,
  transcriptKey: null,
  durationSec,
  asrModel: null,
  sizeBytes: 1,
  duplicateOf,
  partOf: null,
});

const ingest = {
  shiurim: [
    { inScope: true, recordingIds: ["a", "b-dup", "w"] },
    { inScope: false, recordingIds: ["c"] },
  ],
  recordings: [
    rec("a", "D/a.mp3"),
    rec("b", "D/b.MP3", null, null),
    rec("b-dup", "D/b copy.mp3", "b"),
    rec("w", "D/w.WMA"),
    rec("c", "D/c.mp3"),
  ],
} as unknown as Parameters<typeof servedKeysOf>[0];

describe("servedKeysOf", () => {
  it("lists in-scope served keys (duplicates resolved, transcodes as .mp3)", () => {
    const s = servedKeysOf(ingest, new Set(["D/w.WMA"]));
    expect(s.inScope).toEqual([
      { key: "D/a.mp3", durationSec: 60 },
      { key: "D/b.MP3", durationSec: null },
      { key: "D/w.mp3", durationSec: 60 },
    ]);
    expect([...s.all].sort()).toEqual(["D/a.mp3", "D/b copy.mp3", "D/b.MP3", "D/c.mp3", "D/w.mp3"]);
  });

  it("leaves an untranscoded WMA out", () => {
    expect(servedKeysOf(ingest, new Set()).inScope.map((e) => e.key)).toEqual(["D/a.mp3", "D/b.MP3"]);
  });
});

describe("compareCleaned", () => {
  const expected = servedKeysOf(ingest, new Set(["D/w.WMA"]));
  const listed: ListedObject[] = [
    { key: "fixed/sidon/D/a.mp3", size: 10 },
    { key: "fixed/sidon/D/b.MP3", size: 0 },
    { key: "fixed/sidon/D/c.mp3", size: 10 },
    { key: "fixed/sidon/D/zzz.mp3", size: 10 },
  ];

  it("reports missing, empty, stray and out-of-scope objects", () => {
    const r = compareCleaned(expected, listed, new Set());
    expect(r.missing).toEqual(["D/w.mp3"]);
    expect(r.empty).toEqual(["D/b.MP3"]);
    expect(r.stray).toEqual(["fixed/sidon/D/zzz.mp3"]);
    expect(r.outOfScope).toBe(1);
    expect(r.present.map((e) => e.key)).toEqual(["D/a.mp3"]);
  });

  it("a rejected key is never missing or empty", () => {
    const r = compareCleaned(expected, listed, new Set(["D/w.mp3", "D/b.MP3"]));
    expect(r.missing).toEqual([]);
    expect(r.empty).toEqual([]);
    expect(r.rejectedMissing).toEqual(["D/w.mp3"]);
    expect(r.rejectedPresent).toEqual(["D/b.MP3"]);
  });
});

describe("readRejected", () => {
  it("reads the served keys; a missing file means none", () => {
    const p = join(dir, "audio-cleaned.json");
    writeFileSync(p, JSON.stringify({ policyVersion: 1, rejected: [{ key: "D/a.mp3", reason: "r", reviewedBy: "x", reviewedAt: "2026-11-18" }] }));
    expect([...readRejected(p)]).toEqual(["D/a.mp3"]);
    expect(readRejected(join(dir, "nope.json")).size).toBe(0);
  });

  it("the committed policy file is valid", () => {
    expect(() => readRejected()).not.toThrow();
  });
});

describe("listCleaned", () => {
  it("follows continuation tokens and uses the prefix", async () => {
    const prefixes: unknown[] = [];
    const client: S3Like = {
      send: (async (cmd: unknown) => {
        if (!(cmd instanceof ListObjectsV2Command)) throw new Error("unexpected command");
        prefixes.push(cmd.input.Prefix);
        return cmd.input.ContinuationToken
          ? { Contents: [{ Key: "fixed/sidon/b.mp3", Size: 2 }], IsTruncated: false }
          : { Contents: [{ Key: "fixed/sidon/a.mp3", Size: 1 }], IsTruncated: true, NextContinuationToken: "t" };
      }) as S3Like["send"],
    };
    expect(await listCleaned(client, "emunas")).toEqual([
      { key: "fixed/sidon/a.mp3", size: 1 },
      { key: "fixed/sidon/b.mp3", size: 2 },
    ]);
    expect(prefixes).toEqual(["fixed/sidon/", "fixed/sidon/"]);
  });
});

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0 && spawnSync("ffprobe", ["-version"]).status === 0;

describe.skipIf(!hasFfmpeg)("verifyDuration", () => {
  function makeMp3(name: string, seconds: number): Uint8Array {
    const out = join(dir, name);
    execFileSync("ffmpeg", ["-hide_banner", "-v", "error", "-y", "-f", "lavfi", "-i", `sine=frequency=440:duration=${seconds}`, "-codec:a", "libmp3lame", "-q:a", "9", out]);
    return new Uint8Array(readFileSync(out));
  }
  const objects = new Map<string, Uint8Array>();
  const client: S3Like = {
    send: (async (cmd: unknown) => {
      if (!(cmd instanceof GetObjectCommand)) throw new Error("unexpected command");
      const body = objects.get(cmd.input.Key ?? "");
      if (!body) throw Object.assign(new Error("NoSuchKey"), { name: "NoSuchKey" });
      return { ContentType: "audio/mpeg", Body: { transformToByteArray: async () => body } };
    }) as S3Like["send"],
  };

  it("passes within 0.5 s and fails beyond it; probes the original when the ingest has no duration", async () => {
    objects.set("fixed/sidon/x.mp3", makeMp3("x.mp3", 3));
    objects.set("x.mp3", makeMp3("x-orig.mp3", 3));
    expect((await verifyDuration(client, "emunas", { key: "x.mp3", durationSec: 3 }, dir)).ok).toBe(true);
    expect((await verifyDuration(client, "emunas", { key: "x.mp3", durationSec: null }, dir)).ok).toBe(true);
    const bad = await verifyDuration(client, "emunas", { key: "x.mp3", durationSec: 5 }, dir);
    expect(bad.ok).toBe(false);
  });

  it("a missing copy is a failure, not a throw", async () => {
    const r = await verifyDuration(client, "emunas", { key: "gone.mp3", durationSec: 3 }, dir);
    expect(r.ok).toBe(false);
  });
});
