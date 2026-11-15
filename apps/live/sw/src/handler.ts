/**
 * The Live service worker's behaviour (tech-live §4.5, integration-plan §8 W4.8 as amended by A1),
 * written against injected `caches`/`fetch` so it runs under Node in the unit tests. `sw.ts` wires it
 * to the real worker events.
 *
 * | Request | Strategy |
 * |---|---|
 * | navigation | network; offline → the precached page for that path, else the SPA fallback |
 * | precached shell file (`/assets/*`, icons, manifest, fallback HTML) | cache first |
 * | `/data/*` | stale-while-revalidate in `data-v1` (capped); pinned copies (downloads) as last resort |
 * | media host audio (cross-origin) | **not intercepted** unless downloaded; downloaded → `audio-v1`, Range → 206 |
 * | anything else | not intercepted |
 *
 * Audio that is not downloaded stays network-only and the worker does not even call `respondWith`,
 * so the browser talks to the media host exactly as without a worker (CDN Range, caching).
 */
import {
  AUDIO_CACHE,
  DATA_CACHE,
  DATA_CACHE_MAX_ENTRIES,
  KEPT_CACHES,
  PINNED_CACHE,
  SHELL_CACHE_PREFIX,
  type SwMessage,
  type SwVersionReply,
} from "./protocol.ts";
import { rangeResponse } from "./range.ts";

export interface WorkerDeps {
  caches: CacheStorage;
  fetch: (request: Request) => Promise<Response>;
  /** The site origin (`self.location.origin`). */
  origin: string;
  /** Build version (hash of the precache list); names the shell cache. */
  version: string;
  /** Same-origin paths to precache, e.g. `/assets/root-abc.js`. */
  precache: readonly string[];
  /** Path of the SPA fallback page (must be in `precache`). */
  fallback: string;
}

export interface LiveWorker {
  readonly shellCache: string;
  install(): Promise<void>;
  activate(): Promise<void>;
  /**
   * The response for `request`, or `null` to let the browser handle it (no `respondWith`).
   * `waitUntil` receives background work (revalidation) that must outlive the response.
   */
  route(request: Request, waitUntil: (p: Promise<unknown>) => void): Promise<Response> | null;
  message(msg: SwMessage, reply: ((value: SwVersionReply) => void) | null): Promise<void>;
  /** Downloaded audio URLs as last loaded (`null` before the first load); for tests and diagnostics. */
  downloaded(): ReadonlySet<string> | null;
}

/** The cache key of an audio URL: the URL without its fragment (media fragments like `#t=12`). */
export function audioKey(url: string): string {
  const u = new URL(url);
  u.hash = "";
  return u.href;
}

function looksLikeAudio(request: Request, url: URL): boolean {
  return request.destination === "audio" || /\.(mp3|m4a|wav|ogg|opus)$/iu.test(url.pathname);
}

export function createLiveWorker(deps: WorkerDeps): LiveWorker {
  const { caches, origin, version } = deps;
  const shellCache = `${SHELL_CACHE_PREFIX}${version}`;
  const precached = new Set(deps.precache);
  const abs = (path: string) => new URL(path, origin).href;

  let downloadedSet: Set<string> | null = null;
  let loading: Promise<Set<string>> | null = null;
  /** Bumped on every reload request so a slower, older load never overwrites a newer one. */
  let generation = 0;

  function loadDownloaded(force = false): Promise<Set<string>> {
    if (force) {
      generation++;
      loading = null;
    }
    if (loading) return loading;
    const gen = generation;
    const p = (async () => {
      let set: Set<string>;
      try {
        const cache = await caches.open(AUDIO_CACHE);
        set = new Set((await cache.keys()).map((r) => audioKey(r.url)));
      } catch {
        set = new Set();
      }
      if (gen === generation) downloadedSet = set;
      return set;
    })().finally(() => {
      if (loading === p) loading = null;
    });
    loading = p;
    return p;
  }

  async function serveAudio(request: Request, key: string): Promise<Response> {
    const cache = await caches.open(AUDIO_CACHE);
    const hit = await cache.match(key);
    if (!hit) {
      // Evicted or removed since the set was loaded: fall back to the network.
      downloadedSet?.delete(key);
      return deps.fetch(request);
    }
    return rangeResponse(hit, request.headers.get("range"));
  }

  async function navigate(request: Request, url: URL): Promise<Response> {
    try {
      return await deps.fetch(request);
    } catch (err) {
      const shell = await caches.open(shellCache);
      const path = url.pathname;
      const candidates = path.endsWith("/") ? [path] : [path, `${path}/`];
      for (const c of candidates) {
        if (!precached.has(c)) continue;
        const hit = await shell.match(abs(c));
        if (hit) return hit;
      }
      const fallback = await shell.match(abs(deps.fallback));
      if (fallback) return fallback;
      throw err;
    }
  }

  async function trimData(cache: Cache): Promise<void> {
    const keys = await cache.keys();
    const extra = keys.length - DATA_CACHE_MAX_ENTRIES;
    for (let i = 0; i < extra; i++) await cache.delete(keys[i]!);
  }

  async function data(request: Request, waitUntil: (p: Promise<unknown>) => void): Promise<Response> {
    const [dataCache, pinned] = await Promise.all([caches.open(DATA_CACHE), caches.open(PINNED_CACHE)]);
    const key = request.url;
    const cached = (await dataCache.match(key)) ?? (await pinned.match(key));
    const network = deps.fetch(request).then(async (res) => {
      if (res.status === 200) {
        const forData = res.clone();
        const forPin = res.clone();
        await dataCache.delete(key); // re-insert at the end: keys() order is the trim order
        await dataCache.put(key, forData);
        if (await pinned.match(key)) await pinned.put(key, forPin);
        await trimData(dataCache);
      }
      return res;
    });
    if (cached) {
      waitUntil(network.catch(() => undefined));
      return cached;
    }
    return network;
  }

  async function cacheFirst(request: Request, url: URL): Promise<Response> {
    const shell = await caches.open(shellCache);
    const hit = await shell.match(abs(url.pathname));
    if (hit) return hit;
    return deps.fetch(request);
  }

  async function assetFromAnyCache(request: Request): Promise<Response> {
    try {
      return await deps.fetch(request);
    } catch (err) {
      const hit = await caches.match(request.url);
      if (hit) return hit;
      throw err;
    }
  }

  return {
    shellCache,

    async install() {
      const shell = await caches.open(shellCache);
      await shell.addAll(deps.precache.map(abs));
    },

    async activate() {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter(
            (n) =>
              (n.startsWith(SHELL_CACHE_PREFIX) && n !== shellCache) ||
              (/^(audio|pinned|data)-v\d+$/u.test(n) && !KEPT_CACHES.includes(n)),
          )
          .map((n) => caches.delete(n)),
      );
      await loadDownloaded();
    },

    route(request, waitUntil) {
      if (request.method !== "GET") return null;
      const url = new URL(request.url);
      if (url.origin !== origin) {
        if (url.protocol !== "https:" && url.protocol !== "http:") return null;
        const key = audioKey(request.url);
        if (downloadedSet) return downloadedSet.has(key) ? serveAudio(request, key) : null;
        // Worker just started: the set is not loaded yet. Only audio-looking requests wait for it.
        if (!looksLikeAudio(request, url)) {
          void loadDownloaded();
          return null;
        }
        return loadDownloaded().then((set) => (set.has(key) ? serveAudio(request, key) : deps.fetch(request)));
      }
      if (request.mode === "navigate") return navigate(request, url);
      if (url.pathname.startsWith("/data/")) return data(request, waitUntil);
      if (precached.has(url.pathname)) return cacheFirst(request, url);
      if (url.pathname.startsWith("/assets/")) return assetFromAnyCache(request);
      return null;
    },

    async message(msg, reply) {
      if (msg.type === "downloads-changed") {
        await loadDownloaded(true);
      } else if (msg.type === "version") {
        reply?.({ type: "version", version });
      }
    },

    downloaded: () => downloadedSet,
  };
}
