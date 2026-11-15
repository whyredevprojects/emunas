/**
 * scripts/transcode-wma.ts: a tiny synthetic WMA (ffmpeg `-f lavfi -i sine` → wmav2) goes through
 * the real ffmpeg/ffprobe conversion, with the S3 client mocked. Skipped when ffmpeg is missing.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { afterAll, describe, expect, it } from "vitest";
import {
  assertWmaKey,
  inScopeWmaKeys,
  probeAudio,
  readPolicy,
  recordTranscoded,
  transcodeOne,
  transcodeToMp3,
  type S3Like,
} from "../scripts/transcode-wma.ts";

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0 && spawnSync("ffprobe", ["-version"]).status === 0;

const dir = mkdtempSync(join(tmpdir(), "transcode-wma-test-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** A `seconds`-long sine WMA (wmav2), mono or stereo, at `rate` Hz. */
function makeWma(name: string, seconds: number, channels: 1 | 2, rate: number): string {
  const out = join(dir, name);
  execFileSync("ffmpeg", [
    "-hide_banner", "-v", "error", "-y",
    "-f", "lavfi", "-i", `sine=frequency=440:duration=${seconds}:sample_rate=${rate}`,
    "-ac", String(channels), "-codec:a", "wmav2", "-b:a", "64k", out,
  ]);
  return out;
}

const KEY = "01 Harav/Y Zemanim 02 Kislev and Choref/02-22 Zos Chanukah 5778.WMA";
const MP3_KEY = "01 Harav/Y Zemanim 02 Kislev and Choref/02-22 Zos Chanukah 5778.mp3";

interface Call {
  name: string;
  input: Record<string, unknown>;
}

/** In-memory bucket behind a fake `send`. */
function mockS3(objects: Map<string, Uint8Array>): { client: S3Like; calls: Call[] } {
  const calls: Call[] = [];
  const send = async (cmd: unknown): Promise<unknown> => {
    const input = (cmd as { input: Record<string, unknown> }).input;
    const key = input["Key"] as string;
    if (cmd instanceof HeadObjectCommand) {
      calls.push({ name: "head", input });
      if (!objects.has(key)) throw Object.assign(new Error("NotFound"), { name: "NotFound", $metadata: { httpStatusCode: 404 } });
      return {};
    }
    if (cmd instanceof GetObjectCommand) {
      calls.push({ name: "get", input });
      const bytes = objects.get(key);
      if (!bytes) throw Object.assign(new Error("NoSuchKey"), { name: "NoSuchKey" });
      return { Body: { transformToByteArray: async () => bytes } };
    }
    if (cmd instanceof PutObjectCommand) {
      calls.push({ name: "put", input });
      objects.set(key, new Uint8Array(input["Body"] as Buffer));
      return {};
    }
    throw new Error("unexpected command");
  };
  return { client: { send } as unknown as S3Like, calls };
}

describe.runIf(hasFfmpeg)("transcodeToMp3 (real ffmpeg)", () => {
  it("mono WMA → mono MP3, same sample rate, duration within 1 s", async () => {
    const wma = makeWma("mono.wma", 3, 1, 22050);
    const mp3 = join(dir, "mono.mp3");
    const r = await transcodeToMp3(wma, mp3);
    expect(r.source).toMatchObject({ channels: 1, sampleRate: 22050 });
    expect(r.mp3).toMatchObject({ channels: 1, sampleRate: 22050 });
    expect(Math.abs(r.mp3.durationSec - 3)).toBeLessThan(1);
    const head = readFileSync(mp3);
    // ID3 tag or an MPEG frame sync.
    expect(head.subarray(0, 3).toString("latin1") === "ID3" || (head[0] === 0xff && (head[1]! & 0xe0) === 0xe0)).toBe(true);
    const codec = execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_name", "-of", "csv=p=0", mp3]);
    expect(codec.toString().trim()).toBe("mp3");
  });

  it("stereo stays stereo", async () => {
    const r = await transcodeToMp3(makeWma("stereo.wma", 2, 2, 44100), join(dir, "stereo.mp3"));
    expect(r.mp3).toMatchObject({ channels: 2, sampleRate: 44100 });
  });

  it("probeAudio rejects a file with no audio", async () => {
    const junk = join(dir, "junk.wma");
    writeFileSync(junk, "not audio");
    await expect(probeAudio(junk)).rejects.toThrow();
  });
});

describe.runIf(hasFfmpeg)("transcodeOne (S3 mocked)", () => {
  const tmpRoot = mkdtempSync(join(dir, "work-"));

  it("downloads the WMA, uploads an audio/mpeg sibling, keeps the WMA", async () => {
    const wmaBytes = new Uint8Array(readFileSync(makeWma("src.wma", 3, 1, 16000)));
    const objects = new Map([[KEY, wmaBytes]]);
    const { client, calls } = mockS3(objects);
    const o = await transcodeOne(client, KEY, { bucket: "emunas", tmpRoot });
    expect(o.status).toBe("uploaded");
    expect(o.mp3Key).toBe(MP3_KEY);
    expect(calls.map((c) => c.name)).toEqual(["head", "get", "put"]);
    const put = calls[2]!.input;
    expect(put).toMatchObject({ Bucket: "emunas", Key: MP3_KEY, ContentType: "audio/mpeg" });
    expect(objects.get(KEY)).toBe(wmaBytes); // original untouched
    const mp3Path = join(dir, "uploaded.mp3");
    writeFileSync(mp3Path, objects.get(MP3_KEY)!);
    const p = await probeAudio(mp3Path);
    expect(p).toMatchObject({ channels: 1, sampleRate: 16000 });
    expect(Math.abs(p.durationSec - 3)).toBeLessThan(1);
    if (o.status === "uploaded") expect(o.bytes).toBe(objects.get(MP3_KEY)!.byteLength);
  });

  it("skips when the .mp3 sibling exists; dry-run never downloads or uploads", async () => {
    const existing = mockS3(new Map([[KEY, new Uint8Array([1])], [MP3_KEY, new Uint8Array([2])]]));
    expect((await transcodeOne(existing.client, KEY, { bucket: "emunas", tmpRoot })).status).toBe("exists");
    expect(existing.calls.map((c) => c.name)).toEqual(["head"]);

    const fresh = mockS3(new Map([[KEY, new Uint8Array([1])]]));
    expect((await transcodeOne(fresh.client, KEY, { bucket: "emunas", dryRun: true, tmpRoot })).status).toBe("planned");
    expect(fresh.calls.map((c) => c.name)).toEqual(["head"]);
  });

  it("a broken source fails without uploading", async () => {
    const { client, calls } = mockS3(new Map([[KEY, new TextEncoder().encode("not audio")]]));
    await expect(transcodeOne(client, KEY, { bucket: "emunas", tmpRoot })).rejects.toThrow();
    expect(calls.map((c) => c.name)).toEqual(["head", "get"]);
  });

  it("refuses transcript and non-wma keys before any S3 call", async () => {
    const { client, calls } = mockS3(new Map());
    for (const key of ["transcripts/a/b.WMA", "x/Transcripts/b.wma", "a/b.mp3", "a/b.m4a", "/a/b.wma", ""]) {
      await expect(transcodeOne(client, key, { bucket: "emunas", tmpRoot }), key).rejects.toThrow(/Refusing/);
    }
    expect(calls).toEqual([]);
  });
});

describe("plan and policy helpers", () => {
  it("assertWmaKey gives the sibling key", () => {
    expect(assertWmaKey(KEY)).toBe(MP3_KEY);
  });

  it("inScopeWmaKeys: in-scope only, duplicates resolved, any case, sorted, deduped", () => {
    const rec = (id: string, audioKey: string, duplicateOf: string | null = null) => ({ id, audioKey, duplicateOf });
    const keys = inScopeWmaKeys({
      shiurim: [
        { inScope: true, recordingIds: ["a", "b", "c", "d"] },
        { inScope: false, recordingIds: ["e"] },
      ],
      recordings: [rec("a", "z/A.WMA"), rec("b", "y/b.mp3"), rec("c", "x/c.mp3", "f"), rec("d", "z/A.WMA"), rec("e", "w/e.wma"), rec("f", "v/f.wma")],
    } as unknown as Parameters<typeof inScopeWmaKeys>[0]);
    expect(keys).toEqual(["v/f.wma", "z/A.WMA"]);
  });

  it("recordTranscoded adds keys sorted and once", () => {
    const p = join(dir, "audio-transcoded.json");
    writeFileSync(p, `${JSON.stringify({ policyVersion: 1, mp3Siblings: [] })}\n`);
    recordTranscoded("b/x.WMA", p);
    recordTranscoded("a/y.WMA", p);
    recordTranscoded("b/x.WMA", p);
    expect(readPolicy(p)).toEqual({ policyVersion: 1, mp3Siblings: ["a/y.WMA", "b/x.WMA"] });
    expect(() => recordTranscoded("transcripts/a.WMA", p)).toThrow();
  });

  it("the committed policy file is valid", () => {
    expect(readPolicy().policyVersion).toBe(1);
  });
});
