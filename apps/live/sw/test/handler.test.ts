import { beforeEach, describe, expect, it } from "vitest";
import { createLiveWorker, type LiveWorker } from "../src/handler.ts";
import { AUDIO_CACHE, DATA_CACHE, DATA_CACHE_MAX_ENTRIES, PINNED_CACHE } from "../src/protocol.ts";
import { FakeCacheStorage } from "./fake-caches.ts";

const ORIGIN = "https://listen.example.org";
const MEDIA = "https://media.example.org";
const AUDIO_URL = `${MEDIA}/Shiurim/a%20b.mp3`;

const PRECACHE = ["/__spa-fallback.html", "/index.html", "/en/index.html", "/assets/root-1.js", "/manifest.webmanifest"];

/** A scripted network: path → body; `online = false` makes every fetch fail like a dropped line. */
class Net {
  online = true;
  calls: string[] = [];
  bodies = new Map<string, string>();
  fetch = async (request: Request): Promise<Response> => {
    this.calls.push(request.url);
    if (!this.online) throw new TypeError("Failed to fetch");
    const body = this.bodies.get(request.url);
    if (body === undefined) return new Response("nope", { status: 404 });
    return new Response(body, { status: 200, headers: { "content-type": "text/plain" } });
  };
}

let net: Net;
let caches: FakeCacheStorage;
let worker: LiveWorker;
let background: Promise<unknown>[];

const waitUntil = (p: Promise<unknown>) => {
  background.push(p);
};

function req(url: string, init: RequestInit & { navigate?: boolean } = {}): Request {
  const r = new Request(url, init);
  if (init.navigate) Object.defineProperty(r, "mode", { value: "navigate" });
  return r;
}

async function text(p: Promise<Response> | null): Promise<string> {
  expect(p).not.toBeNull();
  return (await p!).text();
}

beforeEach(async () => {
  net = new Net();
  for (const p of PRECACHE) net.bodies.set(`${ORIGIN}${p}`, `shell:${p}`);
  caches = new FakeCacheStorage(net.fetch);
  worker = createLiveWorker({
    caches,
    fetch: net.fetch,
    origin: ORIGIN,
    version: "v1",
    precache: PRECACHE,
    fallback: "/__spa-fallback.html",
  });
  background = [];
  await worker.install();
  await worker.activate();
  net.calls = [];
});

describe("install / activate", () => {
  it("precaches the shell under a versioned name", async () => {
    expect(worker.shellCache).toBe("shell-v1");
    expect(caches.urls("shell-v1").sort()).toEqual(PRECACHE.map((p) => `${ORIGIN}${p}`).sort());
  });

  it("fails the install when a shell file is missing (all or nothing)", async () => {
    net.bodies.delete(`${ORIGIN}/assets/root-1.js`);
    const w2 = createLiveWorker({
      caches,
      fetch: net.fetch,
      origin: ORIGIN,
      version: "v2",
      precache: PRECACHE,
      fallback: "/__spa-fallback.html",
    });
    await expect(w2.install()).rejects.toThrow();
  });

  it("drops old shells and retired cache versions but keeps downloads", async () => {
    for (const n of ["shell-old", "audio-v0", "data-v0", AUDIO_CACHE, PINNED_CACHE, DATA_CACHE, "someone-else"]) {
      await caches.open(n);
    }
    await worker.activate();
    expect((await caches.keys()).sort()).toEqual(
      [AUDIO_CACHE, DATA_CACHE, PINNED_CACHE, "shell-v1", "someone-else"].sort(),
    );
  });
});

describe("navigation", () => {
  it("goes to the network when online", async () => {
    net.bodies.set(`${ORIGIN}/en/explore`, "live page");
    expect(await text(worker.route(req(`${ORIGIN}/en/explore`, { navigate: true }), waitUntil))).toBe("live page");
  });

  it("offline: serves the precached page for the path", async () => {
    net.online = false;
    expect(await text(worker.route(req(`${ORIGIN}/en/`, { navigate: true }), waitUntil))).toBe("shell:/en/index.html");
    expect(await text(worker.route(req(`${ORIGIN}/en`, { navigate: true }), waitUntil))).toBe("shell:/en/index.html");
    expect(await text(worker.route(req(`${ORIGIN}/?x=1`, { navigate: true }), waitUntil))).toBe("shell:/index.html");
  });

  it("offline: any other page gets the SPA fallback", async () => {
    net.online = false;
    expect(await text(worker.route(req(`${ORIGIN}/yi/s/abc?t=754`, { navigate: true }), waitUntil))).toBe(
      "shell:/__spa-fallback.html",
    );
  });
});

describe("shell files", () => {
  it("are served from the precache without the network", async () => {
    net.online = false;
    expect(await text(worker.route(req(`${ORIGIN}/assets/root-1.js`), waitUntil))).toBe("shell:/assets/root-1.js");
    expect(net.calls).toEqual([]);
  });

  it("other assets: network, then any cache when offline", async () => {
    net.bodies.set(`${ORIGIN}/assets/late-2.js`, "late");
    expect(await text(worker.route(req(`${ORIGIN}/assets/late-2.js`), waitUntil))).toBe("late");
    net.online = false;
    await expect(worker.route(req(`${ORIGIN}/assets/late-2.js`), waitUntil)).rejects.toThrow();
  });

  it("does not intercept the worker script, POSTs or other paths", () => {
    expect(worker.route(req(`${ORIGIN}/sw.js`), waitUntil)).toBeNull();
    expect(worker.route(req(`${ORIGIN}/api/feedback`, { method: "POST", body: "{}" }), waitUntil)).toBeNull();
    expect(worker.route(req(`${ORIGIN}/api/search?q=x`), waitUntil)).toBeNull();
  });
});

describe("/data/* stale-while-revalidate", () => {
  const url = `${ORIGIN}/data/corpus.json`;

  it("first request goes to the network and is cached", async () => {
    net.bodies.set(url, "v1");
    expect(await text(worker.route(req(url), waitUntil))).toBe("v1");
    expect(caches.urls(DATA_CACHE)).toEqual([url]);
  });

  it("serves the cached copy at once and refreshes it in the background", async () => {
    net.bodies.set(url, "v1");
    await text(worker.route(req(url), waitUntil));
    net.bodies.set(url, "v2");
    expect(await text(worker.route(req(url), waitUntil))).toBe("v1");
    await Promise.all(background);
    expect(await text(worker.route(req(url), waitUntil))).toBe("v2");
  });

  it("works offline from the cache, and fails like the network when nothing is cached", async () => {
    net.bodies.set(url, "v1");
    await text(worker.route(req(url), waitUntil));
    net.online = false;
    expect(await text(worker.route(req(url), waitUntil))).toBe("v1");
    await Promise.all(background);
    await expect(worker.route(req(`${ORIGIN}/data/facets.json`), waitUntil)).rejects.toThrow();
  });

  it("does not cache errors", async () => {
    await (await worker.route(req(`${ORIGIN}/data/missing.json`), waitUntil))!.text();
    expect(caches.urls(DATA_CACHE)).toEqual([]);
  });

  it("is capped: the oldest entries go first", async () => {
    const n = DATA_CACHE_MAX_ENTRIES + 5;
    for (let i = 0; i < n; i++) {
      const u = `${ORIGIN}/data/shiur/s${i}.json`;
      net.bodies.set(u, String(i));
      await text(worker.route(req(u), waitUntil));
    }
    const urls = caches.urls(DATA_CACHE);
    expect(urls).toHaveLength(DATA_CACHE_MAX_ENTRIES);
    expect(urls[0]).toBe(`${ORIGIN}/data/shiur/s5.json`);
    expect(urls.at(-1)).toBe(`${ORIGIN}/data/shiur/s${n - 1}.json`);
  });

  it("falls back to the pinned copy of a download and keeps it fresh", async () => {
    const shiur = `${ORIGIN}/data/shiur/a.json`;
    const pinned = await caches.open(PINNED_CACHE);
    await pinned.put(shiur, new Response("pinned"));
    net.online = false;
    expect(await text(worker.route(req(shiur), waitUntil))).toBe("pinned");
    await Promise.all(background).catch(() => undefined);
    net.online = true;
    net.bodies.set(shiur, "fresh");
    expect(await text(worker.route(req(shiur), waitUntil))).toBe("pinned");
    await Promise.all(background);
    expect(await (await pinned.match(shiur))!.text()).toBe("fresh");
  });
});

describe("media host audio (Amendment A1)", () => {
  async function download(url: string, bytes: Uint8Array<ArrayBuffer>): Promise<void> {
    const audio = await caches.open(AUDIO_CACHE);
    await audio.put(url, new Response(bytes, { headers: { "content-type": "audio/mpeg" } }));
    await worker.message({ type: "downloads-changed" }, null);
  }

  it("is not intercepted unless downloaded (network-only, no respondWith)", () => {
    expect(worker.downloaded()).toEqual(new Set());
    expect(worker.route(req(AUDIO_URL, { headers: { range: "bytes=0-" } }), waitUntil)).toBeNull();
  });

  it("downloaded: served from the cache with Range → 206, offline", async () => {
    await download(AUDIO_URL, Uint8Array.from({ length: 100 }, (_, i) => i));
    net.online = false;
    const res = await worker.route(req(AUDIO_URL, { headers: { range: "bytes=40-49" } }), waitUntil)!;
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 40-49/100");
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([40, 41, 42, 43, 44, 45, 46, 47, 48, 49]);
    // A media fragment does not change the key.
    const full = await worker.route(req(`${AUDIO_URL}#t=12`), waitUntil)!;
    expect(full.status).toBe(200);
    expect(net.calls).toEqual([]);
  });

  it("a removed download goes back to the network", async () => {
    await download(AUDIO_URL, new Uint8Array(10));
    await (await caches.open(AUDIO_CACHE)).delete(AUDIO_URL);
    await worker.message({ type: "downloads-changed" }, null);
    expect(worker.route(req(AUDIO_URL), waitUntil)).toBeNull();
  });

  it("an entry evicted behind the worker's back falls back to the network", async () => {
    await download(AUDIO_URL, new Uint8Array(10));
    await (await caches.open(AUDIO_CACHE)).delete(AUDIO_URL);
    net.bodies.set(AUDIO_URL, "from network");
    expect(await text(worker.route(req(AUDIO_URL), waitUntil))).toBe("from network");
  });

  it("right after a worker start, audio requests wait for the download list", async () => {
    const audio = await caches.open(AUDIO_CACHE);
    await audio.put(AUDIO_URL, new Response(new Uint8Array(20)));
    const fresh = createLiveWorker({
      caches,
      fetch: net.fetch,
      origin: ORIGIN,
      version: "v1",
      precache: PRECACHE,
      fallback: "/__spa-fallback.html",
    });
    expect(fresh.downloaded()).toBeNull();
    net.online = false;
    const res = await fresh.route(req(AUDIO_URL, { headers: { range: "bytes=0-9" } }), waitUntil)!;
    expect(res.status).toBe(206);
    // Non-audio cross-origin requests are never held up.
    expect(fresh.route(req(`${MEDIA}/robots.txt`), waitUntil)).toBeNull();
  });

  it("answers the version message", async () => {
    let got: unknown = null;
    await worker.message({ type: "version" }, (v) => {
      got = v;
    });
    expect(got).toEqual({ type: "version", version: "v1" });
  });
});
