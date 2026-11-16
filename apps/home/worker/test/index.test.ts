import { describe, expect, it, vi } from "vitest";
import worker, {
  CACHE_CONTROL,
  evaluatePreconditions,
  keyForPath,
  parseRange,
  type Env,
  type FetcherLike,
  type R2BucketLike,
  type R2GetOptionsLike,
  type R2ObjectBodyLike,
} from "../index.ts";

const BYTES = new TextEncoder().encode("0123456789abcdefghij"); // 20 bytes
const ETAG = '"5d41402abc4b2a76b9719d911017c592"';
const UPLOADED = new Date("2026-11-16T17:00:00.000Z");

function bucket(objects: Record<string, Uint8Array<ArrayBuffer>>) {
  const gets: { key: string; options: R2GetOptionsLike | undefined }[] = [];
  const meta = (bytes: Uint8Array<ArrayBuffer>) => ({
    size: bytes.byteLength,
    httpEtag: ETAG,
    uploaded: UPLOADED,
    writeHttpMetadata(h: Headers) {
      h.set("Content-Type", "application/pdf");
    },
  });
  const b: R2BucketLike & { gets: typeof gets; heads: string[] } = {
    gets,
    heads: [],
    head: vi.fn(async (key: string) => {
      b.heads.push(key);
      const bytes = objects[key];
      return bytes ? meta(bytes) : null;
    }),
    get: vi.fn(async (key: string, options?: R2GetOptionsLike): Promise<R2ObjectBodyLike | null> => {
      gets.push({ key, options });
      const bytes = objects[key];
      if (!bytes) return null;
      const slice = options?.range ? bytes.slice(options.range.offset, options.range.offset + options.range.length) : bytes;
      return { ...meta(bytes), body: new Response(slice).body! };
    }),
  };
  return b;
}

function assets(): FetcherLike & { calls: Request[] } {
  const calls: Request[] = [];
  return {
    calls,
    fetch: vi.fn(async (r: Request) => {
      calls.push(r);
      return new Response("not found page", { status: 404, headers: { "content-type": "text/html" } });
    }),
  };
}

function env() {
  const ASSETS = assets();
  const FILES = bucket({ "site/files/essays/noach.pdf": BYTES });
  return { ASSETS, FILES } satisfies Env;
}

const HOST = "https://example.org";
const req = (path: string, init: RequestInit = {}, host = HOST) => new Request(host + path, init);

describe("keyForPath", () => {
  it("maps /files/<rest> to site/files/<rest>", () => {
    expect(keyForPath("/files/essays/noach.pdf")).toBe("site/files/essays/noach.pdf");
    expect(keyForPath("/files/images/portrait.jpg")).toBe("site/files/images/portrait.jpg");
  });
  it("rejects other prefixes, empty or dot segments and odd characters", () => {
    for (const p of [
      "/",
      "/essays/",
      "/filesx/a.pdf",
      "/files/",
      "/files/essays/",
      "/files//a.pdf",
      "/files/../secret",
      "/files/essays/..pdf",
      "/files/.hidden",
      "/files/essays/a%2fb.pdf",
      "/files/Essays/A.pdf",
    ]) {
      expect(keyForPath(p), p).toBeNull();
    }
  });
});

describe("parseRange", () => {
  it.each([
    ["bytes=0-4", { offset: 0, length: 5 }],
    ["bytes=5-", { offset: 5, length: 15 }],
    ["bytes=-5", { offset: 15, length: 5 }],
    ["bytes=-50", { offset: 0, length: 20 }],
    ["bytes=10-100", { offset: 10, length: 10 }],
  ])("%s", (h, want) => {
    expect(parseRange(h, 20)).toEqual(want);
  });
  it("is unsatisfiable past the end", () => {
    expect(parseRange("bytes=20-", 20)).toBe("unsatisfiable");
    expect(parseRange("bytes=-0", 20)).toBe("unsatisfiable");
  });
  it("ignores missing, malformed and multi-range headers", () => {
    for (const h of [null, "items=0-1", "bytes=0-1,4-5", "bytes=5-2", "bytes=-", "bytes=a-b"]) expect(parseRange(h, 20)).toBeNull();
  });
});

describe("evaluatePreconditions", () => {
  const obj = { size: 20, httpEtag: ETAG, uploaded: UPLOADED, writeHttpMetadata() {} };
  it("If-None-Match matching (strong, weak or *) is not-modified", () => {
    expect(evaluatePreconditions(new Headers({ "if-none-match": ETAG }), obj)).toBe("not-modified");
    expect(evaluatePreconditions(new Headers({ "if-none-match": `"x", W/${ETAG}` }), obj)).toBe("not-modified");
    expect(evaluatePreconditions(new Headers({ "if-none-match": "*" }), obj)).toBe("not-modified");
    expect(evaluatePreconditions(new Headers({ "if-none-match": '"other"' }), obj)).toBe("ok");
  });
  it("If-None-Match takes precedence over If-Modified-Since", () => {
    const h = new Headers({ "if-none-match": '"other"', "if-modified-since": UPLOADED.toUTCString() });
    expect(evaluatePreconditions(h, obj)).toBe("ok");
  });
  it("If-Modified-Since", () => {
    expect(evaluatePreconditions(new Headers({ "if-modified-since": UPLOADED.toUTCString() }), obj)).toBe("not-modified");
    expect(evaluatePreconditions(new Headers({ "if-modified-since": "Sun, 01 Nov 2026 00:00:00 GMT" }), obj)).toBe("ok");
  });
  it("If-Match and If-Unmodified-Since fail on a mismatch", () => {
    expect(evaluatePreconditions(new Headers({ "if-match": '"other"' }), obj)).toBe("failed");
    expect(evaluatePreconditions(new Headers({ "if-match": ETAG }), obj)).toBe("ok");
    expect(evaluatePreconditions(new Headers({ "if-unmodified-since": "Sun, 01 Nov 2026 00:00:00 GMT" }), obj)).toBe("failed");
  });
});

describe("worker fetch", () => {
  it("serves a file from R2 with type, length, ETag and caching headers", async () => {
    const e = env();
    const res = await worker.fetch(req("/files/essays/noach.pdf"), e);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("0123456789abcdefghij");
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-length")).toBe("20");
    expect(res.headers.get("etag")).toBe(ETAG);
    expect(res.headers.get("last-modified")).toBe(UPLOADED.toUTCString());
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    expect(res.headers.get("cache-control")).toBe(CACHE_CONTROL);
    expect(CACHE_CONTROL).toBe("public, max-age=86400, stale-while-revalidate=604800");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-robots-tag")).toBeNull();
    expect(e.FILES.gets).toEqual([{ key: "site/files/essays/noach.pdf", options: {} }]);
    expect(e.ASSETS.calls).toHaveLength(0);
  });

  it("answers a byte range with 206 and Content-Range, reading only that range", async () => {
    const e = env();
    const res = await worker.fetch(req("/files/essays/noach.pdf", { headers: { range: "bytes=2-5" } }), e);
    expect(res.status).toBe(206);
    expect(await res.text()).toBe("2345");
    expect(res.headers.get("content-range")).toBe("bytes 2-5/20");
    expect(res.headers.get("content-length")).toBe("4");
    expect(e.FILES.gets[0]?.options).toEqual({ range: { offset: 2, length: 4 } });
  });

  it("answers a suffix range", async () => {
    const res = await worker.fetch(req("/files/essays/noach.pdf", { headers: { range: "bytes=-3" } }), env());
    expect(res.status).toBe(206);
    expect(await res.text()).toBe("hij");
    expect(res.headers.get("content-range")).toBe("bytes 17-19/20");
  });

  it("answers an unsatisfiable range with 416", async () => {
    const e = env();
    const res = await worker.fetch(req("/files/essays/noach.pdf", { headers: { range: "bytes=40-" } }), e);
    expect(res.status).toBe(416);
    expect(res.headers.get("content-range")).toBe("bytes */20");
    expect(e.FILES.gets).toHaveLength(0);
  });

  it("ignores the range when If-Range does not match", async () => {
    const res = await worker.fetch(req("/files/essays/noach.pdf", { headers: { range: "bytes=0-1", "if-range": '"old"' } }), env());
    expect(res.status).toBe(200);
    expect(await res.text()).toHaveLength(20);
  });

  it("honours the range when If-Range matches", async () => {
    const res = await worker.fetch(req("/files/essays/noach.pdf", { headers: { range: "bytes=0-1", "if-range": ETAG } }), env());
    expect(res.status).toBe(206);
    expect(await res.text()).toBe("01");
  });

  it("returns 304 with no body and no R2 read for a matching If-None-Match", async () => {
    const e = env();
    const res = await worker.fetch(req("/files/essays/noach.pdf", { headers: { "if-none-match": ETAG } }), e);
    expect(res.status).toBe(304);
    expect(res.body).toBeNull();
    expect(res.headers.get("etag")).toBe(ETAG);
    expect(res.headers.get("cache-control")).toBe(CACHE_CONTROL);
    expect(e.FILES.gets).toHaveLength(0);
  });

  it("returns 412 for a failed If-Match", async () => {
    const res = await worker.fetch(req("/files/essays/noach.pdf", { headers: { "if-match": '"other"' } }), env());
    expect(res.status).toBe(412);
  });

  it("answers HEAD with headers only", async () => {
    const e = env();
    const res = await worker.fetch(req("/files/essays/noach.pdf", { method: "HEAD" }), e);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-length")).toBe("20");
    expect(res.body).toBeNull();
    expect(e.FILES.gets).toHaveLength(0);
  });

  it("answers HEAD with a range as 206", async () => {
    const res = await worker.fetch(req("/files/essays/noach.pdf", { method: "HEAD", headers: { range: "bytes=0-9" } }), env());
    expect(res.status).toBe(206);
    expect(res.headers.get("content-length")).toBe("10");
  });

  it("rejects other methods with 405", async () => {
    const res = await worker.fetch(req("/files/essays/noach.pdf", { method: "POST" }), env());
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("GET, HEAD");
  });

  it("falls through to ASSETS (the 404 page) for a missing key", async () => {
    const e = env();
    const res = await worker.fetch(req("/files/essays/missing.pdf"), e);
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("not found page");
    expect(e.ASSETS.calls).toHaveLength(1);
  });

  it("never reads R2 outside site/files/ and sends bad paths to ASSETS", async () => {
    const e = env();
    for (const p of ["/files/", "/files/../x", "/files/a%2F..%2Fb", "/about/", "/"]) {
      const res = await worker.fetch(req(p), e);
      expect(res.status, p).toBe(404);
    }
    expect(e.FILES.heads).toEqual([]);
    expect(e.FILES.gets).toEqual([]);
  });

  it("answers 503 (not cached) when the object changes between head and get", async () => {
    const e = env();
    const get = e.FILES.get;
    e.FILES.get = async (key, options) => {
      const obj = await get(key, options);
      return obj && { ...obj, httpEtag: '"0000000000000000000000000000000a"' };
    };
    const res = await worker.fetch(req("/files/essays/noach.pdf"), e);
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("etag")).toBeNull();
  });

  it("adds noindex on workers.dev hosts", async () => {
    const res = await worker.fetch(req("/files/essays/noach.pdf", {}, "https://emunas-home.acct.workers.dev"), env());
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
  });
});
