/**
 * The page-side download controller over an in-memory Cache Storage and the real personal store
 * (memory backend): CORS fetches keyed by `audioUrl`, pinned JSON, `putDownload` bookkeeping
 * (partial → complete), failure and resume, unplayable recordings, removal with shared audio, and
 * reconciliation after eviction. The worker side reads exactly what this writes (last test).
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ShiurFile } from "../../app/data/types.ts";
import { MemoryBackend } from "../../app/store/backend.ts";
import { createPersonal, type Personal } from "../../app/store/personal.ts";
import {
  DownloadError,
  configureDownloads,
  downloadShiur,
  planDownload,
  reconcileDownloads,
  removeShiurDownload,
  runningDownloads,
} from "../client/downloads.ts";
import { createLiveWorker } from "../src/handler.ts";
import { AUDIO_CACHE, PINNED_CACHE, type SwMessage } from "../src/protocol.ts";
import { FakeCacheStorage } from "./fake-caches.ts";

const ORIGIN = "https://listen.example.org";

function fixture(id: string): ShiurFile {
  return JSON.parse(
    readFileSync(new URL(`../../app/data/fixtures/data/shiur/${id}.json`, import.meta.url), "utf8"),
  ) as ShiurFile;
}

const TWO = fixture("yi-zmanim-tv-bb-04"); // 2 recordings, write-ups en + yi
const CATALOG_ONLY = fixture("yi-tanya-1-01"); // 1 recording, no write-up

interface Call {
  url: string;
  init: RequestInit | undefined;
}

let caches: FakeCacheStorage;
let personal: Personal;
let calls: Call[];
let notes: SwMessage[];
let persisted: number;
let failOn: Set<string>;

function audioBytes(url: string): Uint8Array<ArrayBuffer> {
  // Deterministic, distinct per URL.
  const n = 1000 + (url.length % 7) * 100;
  return Uint8Array.from({ length: n }, (_, i) => (i + url.length) % 256);
}

async function fakeFetch(url: string, init?: RequestInit): Promise<Response> {
  calls.push({ url, init });
  if (failOn.has(url)) throw new TypeError("Failed to fetch");
  if (url.startsWith(`${ORIGIN}/data/`)) {
    const path = decodeURIComponent(new URL(url).pathname.slice("/data/".length));
    try {
      const body = readFileSync(new URL(`../../app/data/fixtures/data/${path}`, import.meta.url), "utf8");
      return new Response(body, { status: 200, headers: { "content-type": "application/json" } });
    } catch {
      return new Response("missing", { status: 404 });
    }
  }
  const body = audioBytes(url);
  return new Response(body, {
    status: 200,
    headers: { "content-type": "audio/mpeg", "content-length": String(body.byteLength) },
  });
}

beforeEach(async () => {
  caches = new FakeCacheStorage();
  personal = createPersonal({
    open: async () => ({ backend: new MemoryBackend(), fallbackReason: null }),
    channel: null,
  });
  calls = [];
  notes = [];
  persisted = 0;
  failOn = new Set();
  configureDownloads({
    caches,
    fetch: fakeFetch,
    personal,
    persist: async () => {
      persisted++;
      return true;
    },
    notify: (m) => notes.push(m),
    origin: ORIGIN,
  });
});

afterEach(() => {
  configureDownloads({});
  personal.dispose();
});

const audioUrls = (s: ShiurFile) => s.recordings.map((r) => r.audioUrl as string);

describe("planDownload", () => {
  it("lists playable recordings and the JSON to pin", () => {
    expect(planDownload(TWO)).toEqual({
      shiurId: TWO.id,
      audio: TWO.recordings.map((r) => ({ recordingId: r.id, url: r.audioUrl })),
      pins: [`/data/shiur/${TWO.id}.json`, `/data/writeup/${TWO.id}.en.json`, `/data/writeup/${TWO.id}.yi.json`],
    });
    expect(planDownload(CATALOG_ONLY)!.pins).toEqual([`/data/shiur/${CATALOG_ONLY.id}.json`]);
  });

  it("leaves out playable:false recordings; nothing playable → no plan", () => {
    const [a, b] = TWO.recordings;
    const partly: ShiurFile = { ...TWO, recordings: [a!, { ...b!, playable: false, audioUrl: null }] };
    expect(planDownload(partly)!.audio.map((x) => x.recordingId)).toEqual([a!.id]);
    const none: ShiurFile = { ...TWO, recordings: TWO.recordings.map((r) => ({ ...r, playable: false, audioUrl: null })) };
    expect(planDownload(none)).toBeNull();
  });
});

describe("downloadShiur", () => {
  it("fetches audio with CORS into audio-v1 keyed by audioUrl, pins JSON and records complete", async () => {
    const progress: number[] = [];
    const rec = await downloadShiur(TWO, { onProgress: (p) => progress.push(p.bytes) });

    expect(caches.urls(AUDIO_CACHE)).toEqual(audioUrls(TWO));
    for (const u of audioUrls(TWO)) {
      const hit = await (await caches.open(AUDIO_CACHE)).match(u);
      expect(new Uint8Array(await hit!.arrayBuffer())).toEqual(audioBytes(u));
      const call = calls.find((c) => c.url === u)!;
      expect(call.init?.mode).toBe("cors");
      expect(call.init?.credentials).toBe("omit");
    }
    expect(caches.urls(PINNED_CACHE)).toEqual(planDownload(TWO)!.pins.map((p) => `${ORIGIN}${p}`));

    const total = audioUrls(TWO).reduce((n, u) => n + audioBytes(u).byteLength, 0);
    expect(rec).toMatchObject({ shiurId: TWO.id, state: "complete", bytes: total, recordingIds: TWO.recordings.map((r) => r.id) });
    expect(personal.store.getState().downloads[TWO.id]).toEqual(rec);
    expect(progress.at(-1)).toBe(total);
    expect(persisted).toBe(1);
    expect(notes.at(-1)).toEqual({ type: "downloads-changed" });
    expect(runningDownloads().size).toBe(0);
  });

  it("a second call while running returns the same download", async () => {
    const a = downloadShiur(CATALOG_ONLY);
    const b = downloadShiur(CATALOG_ONLY);
    expect(b).toBe(a);
    await a;
    expect(calls.filter((c) => c.url === CATALOG_ONLY.recordings[0]!.audioUrl)).toHaveLength(1);
  });

  it("refuses a shiur without playable recordings and records nothing", async () => {
    const none: ShiurFile = { ...TWO, recordings: TWO.recordings.map((r) => ({ ...r, playable: false, audioUrl: null })) };
    await expect(downloadShiur(none)).rejects.toMatchObject({ code: "unplayable" });
    expect(personal.store.getState().downloads).toEqual({});
    expect(calls).toEqual([]);
  });

  it("a failure leaves a partial record; a retry resumes without refetching what is stored", async () => {
    const [first, second] = audioUrls(TWO);
    failOn.add(second!);
    const err = await downloadShiur(TWO).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DownloadError);
    expect((err as DownloadError).code).toBe("network");
    expect(personal.store.getState().downloads[TWO.id]).toMatchObject({
      state: "partial",
      recordingIds: [TWO.recordings[0]!.id],
    });
    expect(caches.urls(AUDIO_CACHE)).toEqual([first]);

    failOn.clear();
    calls = [];
    const rec = await downloadShiur(TWO);
    expect(rec.state).toBe("complete");
    expect(calls.map((c) => c.url)).not.toContain(first);
    expect(calls.map((c) => c.url)).toContain(second);
  });

  it("does not store a partial (206) or opaque answer", async () => {
    configureDownloads({
      caches,
      personal,
      persist: async () => true,
      notify: () => undefined,
      origin: ORIGIN,
      fetch: async (url, init) =>
        url.startsWith(ORIGIN) ? fakeFetch(url, init) : new Response(new Uint8Array(10), { status: 206 }),
    });
    await expect(downloadShiur(CATALOG_ONLY)).rejects.toMatchObject({ code: "network" });
    expect(caches.urls(AUDIO_CACHE)).toEqual([]);
    expect(personal.store.getState().downloads[CATALOG_ONLY.id]?.state).toBe("partial");
  });

  it("reports a full device as quota", async () => {
    const quota = new FakeCacheStorage();
    const audio = await quota.open(AUDIO_CACHE);
    audio.put = async () => {
      throw Object.assign(new Error("full"), { name: "QuotaExceededError" });
    };
    configureDownloads({ caches: quota, fetch: fakeFetch, personal, persist: async () => true, notify: () => undefined, origin: ORIGIN });
    await expect(downloadShiur(CATALOG_ONLY)).rejects.toMatchObject({ code: "quota" });
  });
});

describe("removeShiurDownload", () => {
  it("deletes audio, pinned JSON and the record", async () => {
    await downloadShiur(TWO);
    await removeShiurDownload(TWO.id);
    expect(caches.urls(AUDIO_CACHE)).toEqual([]);
    expect(caches.urls(PINNED_CACHE)).toEqual([]);
    expect(personal.store.getState().downloads).toEqual({});
    expect(notes.at(-1)).toEqual({ type: "downloads-changed" });
  });

  it("keeps audio another downloaded shiur uses (duplicate recordings share a URL)", async () => {
    const twin: ShiurFile = { ...CATALOG_ONLY, id: "twin-of-tanya" };
    // The twin's JSON must be pinned for the check; serve it like a data file.
    const shiurUrl = `${ORIGIN}/data/shiur/twin-of-tanya.json`;
    configureDownloads({
      caches,
      personal,
      persist: async () => true,
      notify: () => undefined,
      origin: ORIGIN,
      fetch: async (url, init) => (url === shiurUrl ? new Response(JSON.stringify(twin)) : fakeFetch(url, init)),
    });
    await downloadShiur(CATALOG_ONLY);
    await downloadShiur(twin);
    await removeShiurDownload(CATALOG_ONLY.id);
    expect(caches.urls(AUDIO_CACHE)).toEqual(audioUrls(CATALOG_ONLY));
    await removeShiurDownload(twin.id);
    expect(caches.urls(AUDIO_CACHE)).toEqual([]);
  });
});

describe("reconcileDownloads", () => {
  it("marks an evicted download partial and a finished-but-unrecorded one complete", async () => {
    await downloadShiur(TWO);
    await downloadShiur(CATALOG_ONLY);
    await (await caches.open(AUDIO_CACHE)).delete(audioUrls(TWO)[1]!);
    await personal.putDownload({ ...personal.store.getState().downloads[CATALOG_ONLY.id]!, state: "partial" });

    const changed = await reconcileDownloads();
    expect(changed.sort()).toEqual([CATALOG_ONLY.id, TWO.id].sort());
    const d = personal.store.getState().downloads;
    expect(d[TWO.id]).toMatchObject({ state: "partial", recordingIds: [TWO.recordings[0]!.id] });
    expect(d[CATALOG_ONLY.id]!.state).toBe("complete");
    expect(await reconcileDownloads()).toEqual([]);
  });
});

describe("worker and page agree", () => {
  it("what a download stores, the worker serves offline with Range", async () => {
    await downloadShiur(CATALOG_ONLY);
    const worker = createLiveWorker({
      caches,
      fetch: () => Promise.reject(new TypeError("offline")),
      origin: ORIGIN,
      version: "t",
      precache: [],
      fallback: "/__spa-fallback",
    });
    await worker.activate();
    const url = CATALOG_ONLY.recordings[0]!.audioUrl as string;
    const res = await worker.route(new Request(url, { headers: { range: "bytes=100-109" } }), () => undefined)!;
    expect(res.status).toBe(206);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(audioBytes(url).slice(100, 110));
    const shiur = await worker.route(new Request(`${ORIGIN}/data/shiur/${CATALOG_ONLY.id}.json`), () => undefined)!;
    expect(((await shiur.json()) as ShiurFile).id).toBe(CATALOG_ONLY.id);
  });
});
