import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { handleAudio, type AudioEnv } from "../../src/handler.ts";
import { buildAudioTable } from "../../src/table.ts";

const SIZE = 1000;
const BYTES = Uint8Array.from({ length: SIZE }, (_, i) => (i * 7 + 3) % 256);

const table = buildAudioTable([
  { id: "rec-a", sizeBytes: SIZE, duplicateOf: null, title: "Parshas Noach – Ḥesed" },
  { id: "rec-dup", sizeBytes: SIZE, duplicateOf: "rec-a", title: "פרשת נח" },
  { id: "rec-not-uploaded", sizeBytes: SIZE, duplicateOf: null },
  { id: "rec-big-table", sizeBytes: SIZE * 2, duplicateOf: null },
]);

// Real R2Bucket binding (Miniflare local R2) must satisfy the handler's structural env type.
const enabled: AudioEnv = { AUDIO: env.AUDIO, AUDIO_ENABLED: "true" };

beforeAll(async () => {
  await env.AUDIO.put("rec-a.mp3", BYTES, { httpMetadata: { contentType: "audio/mpeg" } });
  // Stale table size: table says 2000, object holds 1000.
  await env.AUDIO.put("rec-big-table.mp3", BYTES, { httpMetadata: { contentType: "audio/mpeg" } });
});

function req(path: string, init: RequestInit = {}): Request {
  return new Request(`https://example.test${path}`, init);
}

async function call(path: string, init: RequestInit = {}, e: AudioEnv = enabled): Promise<Response> {
  return handleAudio(req(path, init), e, table);
}

async function bytesOf(res: Response): Promise<Uint8Array> {
  return new Uint8Array(await res.arrayBuffer());
}

describe("GET /audio/<id>.mp3", () => {
  it("serves the whole object with caching and range headers", async () => {
    const res = await call("/audio/rec-a.mp3");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(res.headers.get("Accept-Ranges")).toBe("bytes");
    expect(res.headers.get("Content-Length")).toBe(String(SIZE));
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=604800");
    expect(res.headers.get("ETag")).toMatch(/^"[^"]+"$/);
    expect(new Date(res.headers.get("Last-Modified") ?? "").getTime()).not.toBeNaN();
    expect(res.headers.get("Content-Disposition")).toBeNull();
    expect(await bytesOf(res)).toEqual(BYTES);
  });

  it("bytes=0- → 206 for the whole file", async () => {
    const res = await call("/audio/rec-a.mp3", { headers: { Range: "bytes=0-" } });
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe(`bytes 0-999/${SIZE}`);
    expect(res.headers.get("Content-Length")).toBe("1000");
    expect(await bytesOf(res)).toEqual(BYTES);
  });

  it("bytes=100-199 → 206 with exactly those bytes", async () => {
    const res = await call("/audio/rec-a.mp3", { headers: { Range: "bytes=100-199" } });
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe(`bytes 100-199/${SIZE}`);
    expect(res.headers.get("Content-Length")).toBe("100");
    expect(await bytesOf(res)).toEqual(BYTES.slice(100, 200));
  });

  it("bytes=-500 → 206 with the last 500 bytes", async () => {
    const res = await call("/audio/rec-a.mp3", { headers: { Range: "bytes=-500" } });
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe(`bytes 500-999/${SIZE}`);
    expect(res.headers.get("Content-Length")).toBe("500");
    expect(await bytesOf(res)).toEqual(BYTES.slice(500));
  });

  it("clamps an end past the object and a suffix longer than the object", async () => {
    const a = await call("/audio/rec-a.mp3", { headers: { Range: "bytes=900-5000" } });
    expect(a.status).toBe(206);
    expect(a.headers.get("Content-Range")).toBe(`bytes 900-999/${SIZE}`);
    expect(await bytesOf(a)).toEqual(BYTES.slice(900));
    const b = await call("/audio/rec-a.mp3", { headers: { Range: "bytes=-5000" } });
    expect(b.status).toBe(206);
    expect(b.headers.get("Content-Range")).toBe(`bytes 0-999/${SIZE}`);
    expect(await bytesOf(b)).toEqual(BYTES);
  });

  it("unsatisfiable range → 416 with Content-Range */size", async () => {
    const res = await call("/audio/rec-a.mp3", { headers: { Range: "bytes=1000-" } });
    expect(res.status).toBe(416);
    expect(res.headers.get("Content-Range")).toBe(`bytes */${SIZE}`);
  });

  it("ignores multi-range and malformed ranges (full 200)", async () => {
    for (const r of ["bytes=0-1,5-6", "items=0-5", "bytes=50-10", "bytes=abc"]) {
      const res = await call("/audio/rec-a.mp3", { headers: { Range: r } });
      expect(res.status, r).toBe(200);
      expect((await bytesOf(res)).length).toBe(SIZE);
    }
  });

  it("If-None-Match with the current ETag → 304 without body", async () => {
    const first = await call("/audio/rec-a.mp3");
    const etag = first.headers.get("ETag") ?? "";
    await first.arrayBuffer();
    const res = await call("/audio/rec-a.mp3", { headers: { "If-None-Match": etag } });
    expect(res.status).toBe(304);
    expect(res.headers.get("ETag")).toBe(etag);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=604800");
    expect(await res.text()).toBe("");
    const weak = await call("/audio/rec-a.mp3", { headers: { "If-None-Match": `W/${etag}` } });
    expect(weak.status).toBe(304);
    const star = await call("/audio/rec-a.mp3", { headers: { "If-None-Match": "*" } });
    expect(star.status).toBe(304);
  });

  it("If-None-Match with another ETag → 200", async () => {
    const res = await call("/audio/rec-a.mp3", { headers: { "If-None-Match": '"nope"' } });
    expect(res.status).toBe(200);
    expect((await bytesOf(res)).length).toBe(SIZE);
  });

  it("If-Modified-Since in the future → 304; far past → 200", async () => {
    const future = new Date(Date.now() + 86_400_000).toUTCString();
    const a = await call("/audio/rec-a.mp3", { headers: { "If-Modified-Since": future } });
    expect(a.status).toBe(304);
    const b = await call("/audio/rec-a.mp3", { headers: { "If-Modified-Since": "Mon, 01 Jan 2001 00:00:00 GMT" } });
    expect(b.status).toBe(200);
    await b.arrayBuffer();
  });

  it("If-Match with a wrong ETag → 412", async () => {
    const res = await call("/audio/rec-a.mp3", { headers: { "If-Match": '"wrong"' } });
    expect(res.status).toBe(412);
  });

  it("If-Range with a stale ETag drops the range (200); with the current one honours it (206)", async () => {
    const head = await call("/audio/rec-a.mp3", { method: "HEAD" });
    const etag = head.headers.get("ETag") ?? "";
    const stale = await call("/audio/rec-a.mp3", { headers: { Range: "bytes=0-9", "If-Range": '"old"' } });
    expect(stale.status).toBe(200);
    expect((await bytesOf(stale)).length).toBe(SIZE);
    const fresh = await call("/audio/rec-a.mp3", { headers: { Range: "bytes=0-9", "If-Range": etag } });
    expect(fresh.status).toBe(206);
    expect(await bytesOf(fresh)).toEqual(BYTES.slice(0, 10));
  });

  it("a duplicate id is served from its canonical object", async () => {
    const res = await call("/audio/rec-dup.mp3", { headers: { Range: "bytes=100-199" } });
    expect(res.status).toBe(206);
    expect(await bytesOf(res)).toEqual(BYTES.slice(100, 200));
  });

  it("stale table size: range past the real end → 416 with the real size", async () => {
    const res = await call("/audio/rec-big-table.mp3", { headers: { Range: "bytes=1500-1600" } });
    expect(res.status).toBe(416);
    expect(res.headers.get("Content-Range")).toBe(`bytes */${SIZE}`);
  });
});

describe("HEAD /audio/<id>.mp3", () => {
  it("returns headers only, via head()", async () => {
    const res = await call("/audio/rec-a.mp3", { method: "HEAD" });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Length")).toBe(String(SIZE));
    expect(res.headers.get("Accept-Ranges")).toBe("bytes");
    expect(res.headers.get("ETag")).toBeTruthy();
    expect(res.headers.get("Last-Modified")).toBeTruthy();
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=604800");
    expect(res.body).toBeNull();
  });

  it("HEAD with Range → 206 headers", async () => {
    const res = await call("/audio/rec-a.mp3", { method: "HEAD", headers: { Range: "bytes=-500" } });
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe(`bytes 500-999/${SIZE}`);
    expect(res.headers.get("Content-Length")).toBe("500");
  });

  it("HEAD with matching If-None-Match → 304; failing If-Match → 412", async () => {
    const etag = (await call("/audio/rec-a.mp3", { method: "HEAD" })).headers.get("ETag") ?? "";
    expect((await call("/audio/rec-a.mp3", { method: "HEAD", headers: { "If-None-Match": etag } })).status).toBe(304);
    expect((await call("/audio/rec-a.mp3", { method: "HEAD", headers: { "If-Match": '"x"' } })).status).toBe(412);
  });
});

describe("ids and paths", () => {
  it("unknown id → 404", async () => {
    const res = await call("/audio/not-in-table.mp3");
    expect(res.status).toBe(404);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("id in the table but object not in the bucket → 404", async () => {
    expect((await call("/audio/rec-not-uploaded.mp3")).status).toBe(404);
    expect((await call("/audio/rec-not-uploaded.mp3", { method: "HEAD" })).status).toBe(404);
  });

  it.each([
    "/audio/../rec-a.mp3",
    "/audio/%2E%2E/rec-a.mp3",
    "/audio/%2e%2e%2frec-a.mp3",
    "/audio/x/rec-a.mp3",
    "/audio/rec-a%2F..%2Frec-a.mp3",
    "/audio//rec-a.mp3",
    "/audio/rec-a/.mp3",
    "/audio/REC-A.mp3",
    "/audio/rec_a.mp3",
    "/audio/rec-a.mp3.mp3",
    "/audio/rec-a.MP3",
    "/audio/rec-a",
    "/audio/.mp3",
    "/audio/constructor.mp3",
    "/audio/__proto__.mp3",
    "/rec-a.mp3",
  ])("%s → 404", async (path) => {
    const res = await call(path);
    expect(res.status).toBe(404);
  });

  it("other methods → 405 with Allow", async () => {
    const res = await call("/audio/rec-a.mp3", { method: "POST", body: "x" });
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("GET, HEAD");
  });
});

describe("AUDIO_ENABLED", () => {
  it.each([["false"], [undefined], [""], [false]] as const)("%s → 503 HTML", async (flag) => {
    const res = await call("/audio/rec-a.mp3", {}, { AUDIO: env.AUDIO, AUDIO_ENABLED: flag });
    expect(res.status).toBe(503);
    expect(res.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.text()).toContain("not yet available");
  });

  it("disabled HEAD → 503 without body; true (boolean) is enabled", async () => {
    const res = await call("/audio/rec-a.mp3", { method: "HEAD" }, { AUDIO: env.AUDIO, AUDIO_ENABLED: "false" });
    expect(res.status).toBe(503);
    expect(res.body).toBeNull();
    const on = await call("/audio/rec-a.mp3", { method: "HEAD" }, { AUDIO: env.AUDIO, AUDIO_ENABLED: true });
    expect(on.status).toBe(200);
  });
});

describe("downloads", () => {
  it("?download=1 → attachment with an ASCII filename from the catalog title", async () => {
    const res = await call("/audio/rec-a.mp3?download=1");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="Parshas Noach - Hesed.mp3"');
    await res.arrayBuffer();
  });

  it("?dl=1 alias works, also with a Range", async () => {
    const res = await call("/audio/rec-a.mp3?dl=1", { headers: { Range: "bytes=0-9" } });
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Disposition")).toMatch(/^attachment; filename="[ -~]+\.mp3"$/);
    await res.arrayBuffer();
  });

  it("a non-Latin title falls back to the recording id", async () => {
    const res = await call("/audio/rec-dup.mp3?download=1", { method: "HEAD" });
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="rec-dup.mp3"');
  });

  it("?download=0 is not a download", async () => {
    const res = await call("/audio/rec-a.mp3?download=0", { method: "HEAD" });
    expect(res.headers.get("Content-Disposition")).toBeNull();
  });
});
