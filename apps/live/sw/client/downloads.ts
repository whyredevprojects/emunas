/**
 * Offline downloads, page side (tech-live §4.5; integration-plan §8 W4.8 as amended by A1).
 *
 * A download is one shiur: every playable recording's `audioUrl` (on the media host) is fetched with
 * CORS (`mode: "cors"`; the bucket's CORS rules allow the Live origin) and stored in Cache Storage
 * `audio-v1` under that exact URL; the shiur JSON and its write-up JSON files are pinned in
 * `pinned-v1`. The service worker then answers the player's requests for those URLs from the cache,
 * with `206` for `Range` requests. Recordings with `playable: false` have no URL and are never
 * downloaded; a shiur with no playable recording cannot be downloaded at all. A download always
 * stores the original recording, never the AI-improved `cleanedUrl` (cleaned-audio-ux Decision 4):
 * offline, the engine plays that stored original and the version line offers the improved one.
 *
 * The fetch runs in the page rather than in the worker: a worker event is killed after a few minutes
 * (Chrome) or sooner (iOS), which a 60 MB mp3 on a slow line outlives; the page lives as long as the
 * tab. Bookkeeping goes through the personal store's `putDownload` (W3.9), which My Shelf reads:
 * `partial` while running or after a failure, `complete` once every playable recording is cached.
 * After any change the worker is told to reload its set of downloaded URLs.
 *
 * Every dependency is injectable for the unit tests; the defaults are the browser's.
 */
import { UI_LANGS, type UiLang } from "@emunas/i18n";
import { dataPaths } from "../../app/data/paths.ts";
import type { ShiurFile } from "../../app/data/types.ts";
import type { DownloadRecord, Personal } from "../../app/store/index.ts";
import { AUDIO_CACHE, PINNED_CACHE, type SwMessage } from "../src/protocol.ts";

export type DownloadPersonal = Pick<Personal, "ready" | "putDownload" | "removeDownload"> & {
  store: { getState(): { downloads: Record<string, DownloadRecord> } };
};

export interface DownloadDeps {
  caches: CacheStorage;
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
  personal: DownloadPersonal;
  /** Asks the browser not to evict our storage (`navigator.storage.persist()`). */
  persist: () => Promise<boolean>;
  /** Tells the service worker that Cache Storage changed. */
  notify: (msg: SwMessage) => void;
  /** Absolute base for same-origin data paths (`location.origin`). */
  origin: string;
}

export type DownloadErrorCode = "unplayable" | "network" | "quota" | "unavailable" | "aborted";

export class DownloadError extends Error {
  override name = "DownloadError";
  constructor(
    readonly code: DownloadErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface DownloadPlan {
  shiurId: string;
  /** Playable recordings in playback order. */
  audio: { recordingId: string; url: string }[];
  /** Same-origin data paths kept with the audio. */
  pins: string[];
}

/** What to fetch for `shiur`, or `null` when no recording is playable (nothing to download). */
export function planDownload(shiur: ShiurFile): DownloadPlan | null {
  const audio = shiur.recordings
    .filter((r) => r.playable && r.audioUrl !== null)
    .sort((a, b) => a.order - b.order)
    .map((r) => ({ recordingId: r.id, url: r.audioUrl as string }));
  if (audio.length === 0) return null;
  const langs: readonly UiLang[] = shiur.notes?.writeupLangs ?? [];
  return {
    shiurId: shiur.id,
    audio,
    pins: [dataPaths.shiur(shiur.id), ...langs.map((l) => dataPaths.writeup(shiur.id, l))],
  };
}

export interface DownloadProgress {
  shiurId: string;
  /** Bytes stored so far (all recordings). */
  bytes: number;
  /** Expected total from `Content-Length`, when every recording announced one. */
  total: number | null;
  recordingsDone: number;
  recordingsTotal: number;
}

function defaultDeps(): Omit<DownloadDeps, "personal"> {
  return {
    caches: globalThis.caches,
    fetch: (input, init) => globalThis.fetch(input, init),
    persist: async () => {
      try {
        return (await navigator.storage?.persist?.()) ?? false;
      } catch {
        return false;
      }
    },
    notify: (msg) => {
      try {
        navigator.serviceWorker?.controller?.postMessage(msg);
      } catch {
        /* no worker: nothing to tell */
      }
    },
    origin: typeof location === "undefined" ? "" : location.origin,
  };
}

let overrides: Partial<DownloadDeps> = {};

/** Replace dependencies (tests). `{}` restores the browser defaults. */
export function configureDownloads(deps: Partial<DownloadDeps>): void {
  overrides = deps;
}

/** The app-wide personal store is imported on first use, so importing this module stays cheap. */
async function resolveDeps(): Promise<DownloadDeps> {
  const personal = overrides.personal ?? (await import("../../app/store/personal.ts")).getPersonal();
  return { ...defaultDeps(), ...overrides, personal };
}

// ---- progress of running downloads (for the UI) -----------------------------------------------

const running = new Map<string, DownloadProgress>();
const inFlight = new Map<string, { promise: Promise<DownloadRecord>; abort: AbortController }>();
const listeners = new Set<() => void>();
let snapshot: ReadonlyMap<string, DownloadProgress> = new Map();

function emit(): void {
  snapshot = new Map(running);
  for (const l of listeners) l();
}

/** Subscribe to running downloads (`useSyncExternalStore`). */
export function subscribeDownloads(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function runningDownloads(): ReadonlyMap<string, DownloadProgress> {
  return snapshot;
}

/** Cancels a running download of `shiurId` (it stays `partial`). */
export function cancelDownload(shiurId: string): void {
  inFlight.get(shiurId)?.abort.abort();
}

// ---- download -------------------------------------------------------------------------------

function isQuota(e: unknown): boolean {
  return e instanceof Error && (e.name === "QuotaExceededError" || /quota/iu.test(e.message));
}

/** A copy of `res` whose body counts bytes into `onBytes` as the cache reads it. */
function counted(res: Response, onBytes: (n: number) => void): Response {
  const headers = new Headers();
  for (const name of ["content-type", "content-length", "last-modified", "etag"]) {
    const v = res.headers.get(name);
    if (v !== null) headers.set(name, v);
  }
  if (!headers.has("content-type")) headers.set("content-type", "audio/mpeg");
  if (!res.body) return new Response(null, { status: 200, headers });
  const counter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      onBytes(chunk.byteLength);
      controller.enqueue(chunk);
    },
  });
  return new Response(res.body.pipeThrough(counter), { status: 200, headers });
}

async function cachedSize(cache: Cache, url: string): Promise<number | null> {
  const hit = await cache.match(url);
  if (!hit) return null;
  const len = Number(hit.headers.get("content-length"));
  if (Number.isFinite(len) && len > 0) return len;
  return (await hit.blob()).size;
}

/**
 * Downloads `shiur` for offline listening. Resolves with the final store record (`complete`).
 * Throws `DownloadError` (`unplayable`, `network`, `quota`, `unavailable`, `aborted`); the record is
 * then `partial` with whatever was stored. Calling it again while it runs returns the same promise;
 * calling it after a failure resumes (recordings already cached are not fetched again).
 */
export function downloadShiur(shiur: ShiurFile, opts: { onProgress?: (p: DownloadProgress) => void } = {}): Promise<DownloadRecord> {
  const existing = inFlight.get(shiur.id);
  if (existing) return existing.promise;
  const abort = new AbortController();
  const promise = run(shiur, abort.signal, opts.onProgress).finally(() => {
    inFlight.delete(shiur.id);
    running.delete(shiur.id);
    emit();
  });
  inFlight.set(shiur.id, { promise, abort });
  return promise;
}

async function run(
  shiur: ShiurFile,
  signal: AbortSignal,
  onProgress: ((p: DownloadProgress) => void) | undefined,
): Promise<DownloadRecord> {
  const plan = planDownload(shiur);
  if (!plan) throw new DownloadError("unplayable", `no playable recording in ${shiur.id}`);
  const deps = await resolveDeps();
  if (!deps.caches) throw new DownloadError("unavailable", "Cache Storage is not available");
  await deps.personal.ready();

  const progress: DownloadProgress = {
    shiurId: plan.shiurId,
    bytes: 0,
    total: null,
    recordingsDone: 0,
    recordingsTotal: plan.audio.length,
  };
  const report = () => {
    running.set(plan.shiurId, { ...progress });
    emit();
    onProgress?.({ ...progress });
  };
  report();

  const done: string[] = [];
  const record = async (state: DownloadRecord["state"]) => {
    await deps.personal.putDownload({ shiurId: plan.shiurId, recordingIds: [...done], bytes: progress.bytes, state });
  };

  void deps.persist().catch(() => false);
  await record("partial");

  let audioCache: Cache;
  let pinned: Cache;
  try {
    [audioCache, pinned] = await Promise.all([deps.caches.open(AUDIO_CACHE), deps.caches.open(PINNED_CACHE)]);
  } catch (e) {
    throw new DownloadError("unavailable", `Cache Storage could not be opened: ${String(e)}`);
  }

  try {
    // The page data first: small, and the room needs it to open offline.
    for (const path of plan.pins) {
      const url = new URL(path, deps.origin).href;
      let res: Response;
      try {
        res = await deps.fetch(url, { signal });
      } catch (e) {
        throw signal.aborted ? new DownloadError("aborted", "cancelled") : new DownloadError("network", `${path}: ${String(e)}`);
      }
      if (res.status !== 200) throw new DownloadError("network", `${path}: HTTP ${res.status}`);
      await pinned.put(url, res);
    }

    let total = 0;
    let totalKnown = true;
    for (const { recordingId, url } of plan.audio) {
      const have = await cachedSize(audioCache, url);
      if (have !== null) {
        progress.bytes += have;
        total += have;
        done.push(recordingId);
        progress.recordingsDone++;
        report();
        continue;
      }
      let res: Response;
      try {
        res = await deps.fetch(url, { mode: "cors", credentials: "omit", signal });
      } catch (e) {
        throw signal.aborted ? new DownloadError("aborted", "cancelled") : new DownloadError("network", `${url}: ${String(e)}`);
      }
      // A partial (206) or opaque answer cannot be served offline: only a full 200 is stored.
      if (res.status !== 200 || res.type === "opaque") {
        throw new DownloadError("network", `${url}: HTTP ${res.status} ${res.type}`);
      }
      const len = Number(res.headers.get("content-length"));
      if (Number.isFinite(len) && len > 0) total += len;
      else totalKnown = false;
      progress.total = totalKnown ? total : null;
      report();
      try {
        await audioCache.put(
          url,
          counted(res, (n) => {
            progress.bytes += n;
            report();
          }),
        );
      } catch (e) {
        if (signal.aborted) throw new DownloadError("aborted", "cancelled");
        if (isQuota(e)) throw new DownloadError("quota", "not enough storage on this device");
        throw new DownloadError("network", `${url}: ${String(e)}`);
      }
      done.push(recordingId);
      progress.recordingsDone++;
      report();
      deps.notify({ type: "downloads-changed" });
      await record("partial");
    }
  } catch (e) {
    deps.notify({ type: "downloads-changed" });
    await record("partial");
    throw e;
  }

  deps.notify({ type: "downloads-changed" });
  await record("complete");
  return deps.personal.store.getState().downloads[plan.shiurId]!;
}

// ---- remove / reconcile -----------------------------------------------------------------------

async function pinnedShiur(pinned: Cache, origin: string, shiurId: string): Promise<ShiurFile | null> {
  const hit = await pinned.match(new URL(dataPaths.shiur(shiurId), origin).href);
  if (!hit) return null;
  try {
    return (await hit.json()) as ShiurFile;
  } catch {
    return null;
  }
}

/**
 * Removes the offline copy of `shiurId`: its audio (unless another downloaded shiur uses the same
 * URL, e.g. a duplicate recording), its pinned JSON, and the store record.
 */
export async function removeShiurDownload(shiurId: string, shiur: ShiurFile | null = null): Promise<void> {
  cancelDownload(shiurId);
  await inFlight.get(shiurId)?.promise.catch(() => undefined);
  const deps = await resolveDeps();
  await deps.personal.ready();
  if (deps.caches) {
    const [audioCache, pinned] = await Promise.all([deps.caches.open(AUDIO_CACHE), deps.caches.open(PINNED_CACHE)]);
    const own = shiur ?? (await pinnedShiur(pinned, deps.origin, shiurId));
    const inUse = new Set<string>();
    for (const other of Object.keys(deps.personal.store.getState().downloads)) {
      if (other === shiurId) continue;
      const s = await pinnedShiur(pinned, deps.origin, other);
      for (const a of (s && planDownload(s)?.audio) || []) inUse.add(a.url);
    }
    const plan = own ? planDownload(own) : null;
    for (const a of plan?.audio ?? []) if (!inUse.has(a.url)) await audioCache.delete(a.url);
    const pins = plan?.pins ?? [dataPaths.shiur(shiurId)];
    for (const l of UI_LANGS) pins.push(dataPaths.writeup(shiurId, l));
    for (const p of new Set(pins)) await pinned.delete(new URL(p, deps.origin).href);
  }
  await deps.personal.removeDownload(shiurId);
  deps.notify({ type: "downloads-changed" });
}

/**
 * Brings the store records in line with Cache Storage, once per page load: a `complete` record whose
 * audio or page data the browser evicted becomes `partial`; a `partial` record whose files are all
 * there (the tab closed between the last file and the final record) becomes `complete`. Records of
 * downloads running in this tab are left alone. Returns the shiur ids whose record changed.
 */
export async function reconcileDownloads(): Promise<string[]> {
  const deps = await resolveDeps();
  if (!deps.caches) return [];
  await deps.personal.ready();
  const [audioCache, pinned] = await Promise.all([deps.caches.open(AUDIO_CACHE), deps.caches.open(PINNED_CACHE)]);
  const changed: string[] = [];
  for (const rec of Object.values(deps.personal.store.getState().downloads)) {
    if (inFlight.has(rec.shiurId)) continue;
    const shiur = await pinnedShiur(pinned, deps.origin, rec.shiurId);
    const plan = shiur ? planDownload(shiur) : null;
    let bytes = 0;
    const present: string[] = [];
    for (const a of plan?.audio ?? []) {
      const size = await cachedSize(audioCache, a.url);
      if (size === null) continue;
      bytes += size;
      present.push(a.recordingId);
    }
    let pinsPresent = plan !== null;
    for (const p of plan?.pins ?? []) {
      if (!(await pinned.match(new URL(p, deps.origin).href))) pinsPresent = false;
    }
    const complete = plan !== null && pinsPresent && present.length === plan.audio.length;
    const state = complete ? "complete" : "partial";
    if (state !== rec.state || bytes !== rec.bytes || present.join("\n") !== rec.recordingIds.join("\n")) {
      await deps.personal.putDownload({ shiurId: rec.shiurId, recordingIds: present, bytes, state });
      changed.push(rec.shiurId);
    }
  }
  if (changed.length > 0) deps.notify({ type: "downloads-changed" });
  return changed;
}
