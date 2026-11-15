/**
 * The Cloudflare REST/S3 targets, with `fetch` mocked. No credentials are used: the D1 REST
 * target is driven against a local D1 (Miniflare) behind a fake API, so the remote code path
 * runs the same diff, chunks and statements as the local one.
 */
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { CloudflareApi, D1RestTarget, R2S3Store, VectorizeRestTarget, WorkersAiEmbedder, awsEncode, r2Credentials, signV4 } from "../src/cloudflare.ts";
import { syncD1 } from "../src/d1-sync.ts";
import { syncVectors } from "../src/vector-sync.ts";
import { MemoryBlobStore, type MiniflareD1Target } from "../src/local.ts";
import { freshD1, miniMoments, tableCounts } from "./helpers.ts";

const ACCOUNT = "acc123";
type Call = { url: string; method: string; body: unknown; headers: Record<string, string> };

function envelope(result: unknown, status = 200): Response {
  return new Response(JSON.stringify({ success: status < 400, result, errors: status < 400 ? [] : [{ message: "nope" }] }), { status });
}

function api(handler: (c: Call) => Promise<Response> | Response, calls: Call[] = []): CloudflareApi {
  return new CloudflareApi({
    accountId: ACCOUNT,
    apiToken: "tok",
    sleep: async () => {},
    fetch: async (url, init) => {
      const c: Call = {
        url,
        method: init?.method ?? "GET",
        body: typeof init?.body === "string" ? JSON.parse(init.body) : init?.body,
        headers: (init?.headers ?? {}) as Record<string, string>,
      };
      calls.push(c);
      return handler(c);
    },
  });
}

const open: MiniflareD1Target[] = [];
afterEach(async () => {
  while (open.length) await open.pop()!.close();
});

describe("CloudflareApi", () => {
  it("sends the bearer token and retries 429 and 5xx", async () => {
    let n = 0;
    const calls: Call[] = [];
    const a = api(() => (++n < 3 ? new Response("busy", { status: n === 1 ? 429 : 503 }) : envelope({ ok: 1 })), calls);
    expect(await a.call("GET", a.account("/x"))).toEqual({ ok: 1 });
    expect(calls).toHaveLength(3);
    expect(calls[0]!.headers["authorization"]).toBe("Bearer tok");
    expect(calls[0]!.url).toBe(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/x`);
  });

  it("surfaces API errors without the account id", async () => {
    const a = api(() => envelope(null, 400));
    await expect(a.call("POST", a.account("/y"), {})).rejects.toThrow(/POST \/accounts\/<account>\/y: 400 nope/);
  });
});

describe("D1 over REST (fake API backed by a local D1)", () => {
  async function backed() {
    const local = await freshD1();
    open.push(local);
    const calls: Call[] = [];
    const a = api(async (c) => {
      if (c.url.includes("/d1/database?name=")) return envelope([{ uuid: "db-uuid", name: "emunas-search-staging" }]);
      const body = c.body as { sql: string; params?: (string | number | null)[] };
      expect(c.url).toBe(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/db-uuid/query`);
      const results = await local.all(body.sql, body.params ?? []);
      return envelope([{ results, success: true }]);
    }, calls);
    return { local, calls, target: await D1RestTarget.byName(a, "emunas-search-staging") };
  }

  it("syncs, then a second run sends no write requests", async () => {
    const { local, calls, target } = await backed();
    const rows = miniMoments();
    const r1 = await syncD1(target, rows);
    expect(r1.inserted).toBe(rows.length);
    expect((await tableCounts(local)).moments).toBe(rows.length);
    // Every statement is one request with bound parameters (no SQL text built from data).
    const writes = calls.filter((c) => /^(INSERT|DELETE)/.test((c.body as { sql?: string })?.sql ?? ""));
    expect(writes.length).toBe(r1.statements);
    for (const w of writes) expect((w.body as { sql: string }).sql).not.toContain(rows[0]!.id);
    calls.length = 0;
    const r2 = await syncD1(target, rows);
    expect(r2.statements).toBe(0);
    expect(calls.every((c) => /^SELECT/.test((c.body as { sql?: string })?.sql ?? ""))).toBe(true);
  });
});

describe("Vectorize REST", () => {
  it("upserts NDJSON as a file part, deletes by ids and lists with a cursor", async () => {
    const calls: Call[] = [];
    let listed = 0;
    const a = api(async (c) => {
      if (c.url.includes("/list")) {
        listed++;
        return envelope(listed === 1 ? { vectors: [{ id: "b@en" }], isTruncated: true, nextCursor: "c1" } : { vectors: [{ id: "a@yi" }], isTruncated: false, nextCursor: null });
      }
      return envelope({ mutationId: "m" });
    }, calls);
    const v = new VectorizeRestTarget(a, "emunas-moments-staging");
    await v.upsert([{ id: "x~s0@en", values: [0.5, -0.25], metadata: { shiurId: "x", t: 1, hash: "h", audio_lang: "en", kind: "section", category: "misc" } }]);
    const up = calls[0]!;
    expect(up.url).toBe(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/vectorize/v2/indexes/emunas-moments-staging/upsert`);
    const file = (up.body as FormData).get("vectors") as File;
    expect(file.type).toBe("application/x-ndjson");
    expect(JSON.parse(await file.text())).toEqual({ id: "x~s0@en", values: [0.5, -0.25], metadata: { shiurId: "x", t: 1, hash: "h", audio_lang: "en", kind: "section", category: "misc" } });
    await v.deleteByIds(["x~s0@en"]);
    expect(calls[1]!.url.endsWith("/delete_by_ids")).toBe(true);
    expect(calls[1]!.body).toEqual({ ids: ["x~s0@en"] });
    expect(await v.listIds()).toEqual(["a@yi", "b@en"]);
    expect(calls[3]!.url).toContain("cursor=c1");
  });
});

describe("Workers AI REST", () => {
  it("posts { text } to /ai/run/<model> and returns data; sync works end to end on fakes", async () => {
    const calls: Call[] = [];
    const a = api((c) => {
      const texts = (c.body as { text: string[] }).text;
      return envelope({ shape: [texts.length, 1024], data: texts.map((t) => Array.from({ length: 1024 }, (_, i) => ((t.length + i) % 7) / 7)) });
    }, calls);
    const e = new WorkersAiEmbedder(a, "@cf/baai/bge-m3");
    const out = await e.embed(["a", "bb"]);
    expect(out).toHaveLength(2);
    expect(calls[0]!.url).toBe(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/ai/run/@cf/baai/bge-m3`);
    expect(() => new WorkersAiEmbedder(a, "@cf/unknown/model")).toThrow();
    expect(new WorkersAiEmbedder(a, "@cf/qwen/qwen3-embedding-0.6b").dims).toBe(1024);

    const vecCalls: Call[] = [];
    const vecApi = api(() => envelope({ mutationId: "m", vectors: [], isTruncated: false, nextCursor: null }), vecCalls);
    const rows = miniMoments().slice(0, 40);
    const r = await syncVectors(new VectorizeRestTarget(vecApi, "idx"), e, new MemoryBlobStore(), rows);
    expect(r.upserted).toBeGreaterThan(0);
    expect(r.embed.modelCalls).toBe(Math.ceil(r.embed.embedded / e.maxBatch));
  });
});

describe("R2 over the S3 API", () => {
  const creds = { accessKeyId: "AKIAIOSFODNN7EXAMPLE", secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY" };

  it("SigV4 matches the AWS S3 documentation examples (GET with Range, PUT)", () => {
    const get = signV4({
      method: "GET",
      url: new URL("https://examplebucket.s3.amazonaws.com/test.txt"),
      headers: {
        host: "examplebucket.s3.amazonaws.com",
        range: "bytes=0-9",
        "x-amz-content-sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "x-amz-date": "20130524T000000Z",
      },
      payloadHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      region: "us-east-1",
      service: "s3",
      credentials: creds,
      amzDate: "20130524T000000Z",
    });
    expect(get).toBe(
      "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41",
    );
    const putHash = "44ce7dd67c959e0d3524ffac1771dfbba87d2b6b4b4e99e42034a8b803f8b072";
    const put = signV4({
      method: "PUT",
      url: new URL("https://examplebucket.s3.amazonaws.com/test%24file.text"),
      headers: {
        date: "Fri, 24 May 2013 00:00:00 GMT",
        host: "examplebucket.s3.amazonaws.com",
        "x-amz-content-sha256": putHash,
        "x-amz-date": "20130524T000000Z",
        "x-amz-storage-class": "REDUCED_REDUNDANCY",
      },
      payloadHash: putHash,
      region: "us-east-1",
      service: "s3",
      credentials: creds,
      amzDate: "20130524T000000Z",
    });
    expect(put).toContain("Signature=98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd");
  });

  it("gets (404 → null) and puts objects at <account>.r2.cloudflarestorage.com/<bucket>/<key>", async () => {
    const seen: { url: string; method: string; auth: string }[] = [];
    const objects = new Map<string, Uint8Array>();
    const store = new R2S3Store(ACCOUNT, "emunas-site-build", creds, {
      sleep: async () => {},
      now: () => new Date("2026-11-15T10:00:00Z"),
      fetch: async (url, init) => {
        const h = init?.headers as Record<string, string>;
        seen.push({ url, method: init?.method ?? "GET", auth: h["authorization"] ?? "" });
        if (init?.method === "PUT") {
          objects.set(url, new Uint8Array(await (init.body as Blob).arrayBuffer()));
          return new Response(null, { status: 200 });
        }
        const o = objects.get(url);
        return o ? new Response(new Blob([new Uint8Array(o)])) : new Response("no", { status: 404 });
      },
    });
    const key = "emb/baai--bge-m3/abc.f16";
    expect(await store.get(key)).toBeNull();
    await store.put(key, new Uint8Array([1, 2, 3]));
    expect(await store.get(key)).toEqual(new Uint8Array([1, 2, 3]));
    expect(seen[1]!.url).toBe(`https://${ACCOUNT}.r2.cloudflarestorage.com/emunas-site-build/emb/baai--bge-m3/abc.f16`);
    expect(seen[1]!.auth).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE\/20261115\/auto\/s3\/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/);
  });

  it("derives S3 credentials from the API token unless keys are given", async () => {
    const a = api((c) => (c.url.endsWith("/user/tokens/verify") ? envelope({ id: "token-id", status: "active" }) : envelope(null, 404)));
    expect(await r2Credentials(a, {})).toEqual({
      accessKeyId: "token-id",
      secretAccessKey: createHash("sha256").update("tok").digest("hex"),
    });
    expect(await r2Credentials(a, { R2_ACCESS_KEY_ID: "k", R2_SECRET_ACCESS_KEY: "s" })).toEqual({ accessKeyId: "k", secretAccessKey: "s" });
    expect(awsEncode("a b/ç(1)", true)).toBe("a%20b/%C3%A7%281%29");
  });
});
