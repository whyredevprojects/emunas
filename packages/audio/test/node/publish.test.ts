import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, expectTypeOf, it } from "vitest";
import type { IngestOutput } from "../../../../src/types.ts";
import { executePlan, copySource, SOURCE_ETAG_META } from "../../src/publish/execute.ts";
import { buildPublishPlan, type IngestLike, type PublishPlan } from "../../src/publish/plan.ts";
import { parseArgs, run } from "../../src/publish/cli.ts";
import { MockS3 } from "./mock-s3.ts";

const SRC = "emunas";
const DST = "emunas-audio";

function rec(id: string, audioKey: string, sizeBytes = 100, duplicateOf: string | null = null) {
  return { id, audioKey, sizeBytes, duplicateOf };
}

const ingest: IngestLike = {
  shiurim: [
    { id: "s1", inScope: true, recordingIds: ["r-one"] },
    { id: "s2", inScope: true, recordingIds: ["r-two-a", "r-two-b"] },
    { id: "s3", inScope: false, recordingIds: ["r-out"] },
    { id: "s4", inScope: true, recordingIds: ["r-wma"] },
    { id: "s5", inScope: true, recordingIds: ["r-dup"] },
    { id: "s6", inScope: true, recordingIds: ["r-sneaky"] },
    { id: "s7", inScope: true, recordingIds: ["r-ghost"] },
  ],
  recordings: [
    rec("r-one", "01 Harav/Parsha/01 Noach.mp3", 111),
    rec("r-two-a", "01 Harav/Zemanim/02-06-1 RH.MP3", 222),
    rec("r-two-b", "01 Harav/Zemanim/02-06-2 RH.MP3", 333),
    rec("r-out", "01 Harav/Purim/seudah.mp3", 444),
    rec("r-wma", "01 Harav/Zemanim/02-11 Purim Katan.WMA", 555),
    rec("r-canon", "01 Harav/Zemanim/02-10 Purim Katan.mp3", 666),
    rec("r-dup", "01 Harav/Zemanim/copy of 02-10 Purim Katan.mp3", 666, "r-canon"),
    rec("r-sneaky", "transcripts/01 Harav/Parsha/01 Noach.mp3", 777),
  ],
};

function seedSource(s3: MockS3): void {
  for (const r of ingest.recordings) s3.put(SRC, r.audioKey, r.sizeBytes);
}

describe("buildPublishPlan", () => {
  const plan = buildPublishPlan(ingest);

  it("copies in-scope canonical mp3s only, as <id>.mp3", () => {
    expect(plan.items.map((i) => [i.id, i.destKey])).toEqual([
      ["r-canon", "r-canon.mp3"],
      ["r-one", "r-one.mp3"],
      ["r-two-a", "r-two-a.mp3"],
      ["r-two-b", "r-two-b.mp3"],
    ]);
  });

  it("refuses non-mp3 and transcripts/ keys, reports duplicates and missing ids", () => {
    expect(plan.refused.map((r) => [r.id, r.reason])).toEqual([
      ["r-sneaky", "transcripts-prefix"],
      ["r-wma", "not-mp3"],
    ]);
    expect(plan.duplicates).toEqual([{ id: "r-dup", canonicalId: "r-canon" }]);
    expect(plan.missing).toEqual(["r-ghost"]);
    expect(plan.counts).toEqual({
      inScopeShiurim: 6,
      inScopeRecordings: 7,
      inScopeCanonical: 5,
      canonicalViaDuplicate: 1,
      toCopy: 4,
      refused: 2,
      duplicates: 1,
      missing: 1,
    });
    expect(plan.items.some((i) => i.sourceKey.startsWith("transcripts/"))).toBe(false);
  });

  it("rejects identical source and destination buckets", () => {
    expect(() => buildPublishPlan(ingest, { srcBucket: "same", dstBucket: "same" })).toThrow();
  });

  it("accepts the pipeline IngestOutput type", () => {
    expectTypeOf<IngestOutput>().toExtend<IngestLike>();
  });
});

describe("executePlan (mocked S3)", () => {
  it("copies server-side with encoded CopySource, audio metadata and a source-ETag guard", async () => {
    const s3 = new MockS3();
    seedSource(s3);
    const plan = buildPublishPlan(ingest);
    const result = await executePlan(plan, { src: s3.client(), dst: s3.client() });
    expect(result).toMatchObject({ copied: 4, skipped: 0, failed: 0, refused: 2 });
    const copy = s3.copies().find((c) => c.input.Key === "r-two-a.mp3");
    expect(copy?.input).toMatchObject({
      Bucket: DST,
      CopySource: "emunas/01%20Harav/Zemanim/02-06-1%20RH.MP3",
      CopySourceIfMatch: s3.bucket(SRC).get("01 Harav/Zemanim/02-06-1 RH.MP3")?.etag,
      ContentType: "audio/mpeg",
      CacheControl: "public, max-age=604800",
      MetadataDirective: "REPLACE",
    });
    expect([...s3.bucket(DST).keys()].sort()).toEqual(["r-canon.mp3", "r-one.mp3", "r-two-a.mp3", "r-two-b.mp3"]);
  });

  it("never copies refused keys and never writes outside <id>.mp3", async () => {
    const s3 = new MockS3();
    seedSource(s3);
    await executePlan(buildPublishPlan(ingest), { src: s3.client(), dst: s3.client() });
    for (const c of s3.copies()) {
      expect(String(c.input.CopySource)).not.toMatch(/^emunas\/transcripts\//);
      expect(String(c.input.CopySource)).not.toMatch(/\.wma$/i);
      expect(String(c.input.Key)).toMatch(/^[a-z0-9-]+\.mp3$/);
    }
  });

  it("is idempotent: a rerun copies 0 and skips everything", async () => {
    const s3 = new MockS3();
    seedSource(s3);
    const plan = buildPublishPlan(ingest);
    await executePlan(plan, { src: s3.client(), dst: s3.client() });
    const before = s3.copies().length;
    const second = await executePlan(plan, { src: s3.client(), dst: s3.client() });
    expect(second).toMatchObject({ copied: 0, skipped: 4, failed: 0 });
    expect(s3.copies().length).toBe(before);
  });

  it("skips objects whose size and ETag already match (e.g. uploaded by hand)", async () => {
    const s3 = new MockS3();
    seedSource(s3);
    const plan = buildPublishPlan(ingest);
    for (const it of plan.items) {
      const src = s3.bucket(SRC).get(it.sourceKey);
      if (src) s3.put(DST, it.destKey, src.size, src.etag);
    }
    const res = await executePlan(plan, { src: s3.client(), dst: s3.client() });
    expect(res).toMatchObject({ copied: 0, skipped: 4 });
  });

  it("recopies when size or source ETag differ", async () => {
    const s3 = new MockS3();
    seedSource(s3);
    const plan = buildPublishPlan(ingest);
    await executePlan(plan, { src: s3.client(), dst: s3.client() });
    s3.put(DST, "r-one.mp3", 5); // truncated upload
    const srcTwo = s3.bucket(SRC).get("01 Harav/Zemanim/02-06-1 RH.MP3");
    if (srcTwo) srcTwo.etag = '"changed"'; // source replaced, same size
    const res = await executePlan(plan, { src: s3.client(), dst: s3.client() });
    expect(res).toMatchObject({ copied: 2, skipped: 2 });
    expect(s3.bucket(DST).get("r-two-a.mp3")?.metadata?.[SOURCE_ETAG_META]).toBe("changed");
  });

  it("reports a missing source object as failed and keeps going", async () => {
    const s3 = new MockS3();
    seedSource(s3);
    s3.bucket(SRC).delete("01 Harav/Parsha/01 Noach.mp3");
    const res = await executePlan(buildPublishPlan(ingest), { src: s3.client(), dst: s3.client() }, { concurrency: 1 });
    expect(res).toMatchObject({ copied: 3, failed: 1 });
    expect(res.outcomes.find((o) => o.id === "r-one")).toMatchObject({ status: "failed", error: "source object not found" });
  });

  it("refuses a tampered plan item with a transcripts/ key at execution time too", async () => {
    const s3 = new MockS3();
    s3.put(SRC, "transcripts/x.mp3", 10);
    const plan: PublishPlan = {
      ...buildPublishPlan({ shiurim: [], recordings: [] }),
      items: [{ id: "x", sourceKey: "transcripts/x.mp3", destKey: "x.mp3", sizeBytes: 10 }],
    };
    const res = await executePlan(plan, { src: s3.client(), dst: s3.client() });
    expect(res).toMatchObject({ copied: 0, failed: 1 });
    expect(s3.copies()).toEqual([]);
  });

  it("lists extraneous destination objects without deleting them", async () => {
    const s3 = new MockS3();
    seedSource(s3);
    s3.put(DST, "stray.mp3", 1);
    const res = await executePlan(buildPublishPlan(ingest), { src: s3.client(), dst: s3.client() }, { checkExtraneous: true });
    expect(res.extraneous).toEqual(["stray.mp3"]);
    expect(s3.bucket(DST).has("stray.mp3")).toBe(true);
  });

  it("encodes CopySource per segment", () => {
    expect(copySource("emunas", "a b/c#d?.mp3")).toBe("emunas/a%20b/c%23d%3F.mp3");
  });
});

describe("CLI", () => {
  const dir = mkdtempSync(join(tmpdir(), "audio-publish-"));
  const ingestPath = join(dir, "ingest.json");
  writeFileSync(ingestPath, JSON.stringify(ingest));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  function io(env: Record<string, string> = {}, s3?: MockS3) {
    const out: string[] = [];
    const err: string[] = [];
    let clientsMade = 0;
    return {
      out,
      err,
      get clientsMade() {
        return clientsMade;
      },
      io: {
        out: (s: string) => out.push(s),
        err: (s: string) => err.push(s),
        env,
        ...(s3
          ? {
              clients: () => {
                clientsMade++;
                return { src: s3.client(), dst: s3.client() };
              },
            }
          : {}),
      },
    };
  }

  it("--dry-run prints the plan and touches no bucket", async () => {
    const s3 = new MockS3();
    const t = io({}, s3);
    const code = await run(["--dry-run", "--ingest", ingestPath], t.io);
    expect(code).toBe(0);
    expect(t.clientsMade).toBe(0);
    expect(s3.calls).toEqual([]);
    const text = t.out.join("\n");
    expect(text).toContain("copy    r-one  <-  01 Harav/Parsha/01 Noach.mp3");
    expect(text).toContain("REFUSE  r-sneaky  (transcripts-prefix)");
    expect(text).toMatch(/to copy:\s+4/);
    expect(text).toContain("dry run: nothing copied");
  });

  it("--dry-run --json emits the plan", async () => {
    const t = io();
    await run(["--dry-run", "--json", "--ingest", ingestPath], t.io);
    const plan = JSON.parse(t.out.join("\n")) as PublishPlan;
    expect(plan.counts.toCopy).toBe(4);
  });

  it("runs the copy with injected clients; rerun copies 0", async () => {
    const s3 = new MockS3();
    seedSource(s3);
    const a = io({}, s3);
    expect(await run(["--ingest", ingestPath], a.io)).toBe(0);
    expect(a.out.join("\n")).toContain("copied 4, skipped 0");
    const b = io({}, s3);
    expect(await run(["--ingest", ingestPath], b.io)).toBe(0);
    expect(b.out.join("\n")).toContain("copied 0, skipped 4");
  });

  it("refuses unknown arguments (no way to pass a key)", async () => {
    for (const argv of [["--key", "transcripts/x.mp3"], ["transcripts/x.mp3"], ["--src-bucket", "x", "--dst-bucket", "x"]]) {
      const t = io();
      expect(await run([...argv, "--ingest", ingestPath], t.io), argv.join(" ")).toBe(2);
    }
  });

  it("without credentials a real run stops before copying", async () => {
    const t = io();
    expect(await run(["--ingest", ingestPath], t.io)).toBe(2);
    expect(t.err.join("\n")).toMatch(/Missing R2 credentials/);
  });

  it("parses bucket overrides from env and flags", () => {
    expect(parseArgs([], { R2_AUDIO_SRC_BUCKET: "a", R2_AUDIO_DST_BUCKET: "b" })).toMatchObject({ srcBucket: "a", dstBucket: "b" });
    expect(parseArgs(["--dst-bucket", "c", "--concurrency", "3"])).toMatchObject({ dstBucket: "c", concurrency: 3 });
    expect(() => parseArgs(["--concurrency", "0"])).toThrow();
  });
});
