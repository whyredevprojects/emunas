/**
 * What the page and the service worker agree on (tech-live §4.5, integration-plan §8 W4.8):
 * cache names, the data-cache cap, and the messages the page sends the worker.
 *
 * Lib-neutral (no DOM or WebWorker globals), so both sides and the Node tests import it.
 */

/** Downloaded audio, keyed by the recording's exact `audioUrl` on the media host (Amendment A1). */
export const AUDIO_CACHE = "audio-v1";

/** `/data/shiur/<id>.json` and `/data/writeup/<id>.<lang>.json` kept with a download (never trimmed). */
export const PINNED_CACHE = "pinned-v1";

/** Stale-while-revalidate cache for `/data/*`, capped at `DATA_CACHE_MAX_ENTRIES`. */
export const DATA_CACHE = "data-v1";

/** Prefix of the precache for the app shell; the suffix is the build's precache hash. */
export const SHELL_CACHE_PREFIX = "shell-";

/**
 * Size cap of the `/data/*` cache, in entries (oldest written first out). Shiur files are a few KB;
 * the big files (corpus, facets, quick index, moment shards) are few, so 300 entries stays in the
 * low tens of MB.
 */
export const DATA_CACHE_MAX_ENTRIES = 300;

/** Caches this worker keeps across versions; other caches it created (old shells) are deleted. */
export const KEPT_CACHES: readonly string[] = [AUDIO_CACHE, PINNED_CACHE, DATA_CACHE];

/** Page → worker messages. */
export type SwMessage =
  /** Downloads were added or removed in Cache Storage: reload the set of downloaded audio URLs. */
  | { type: "downloads-changed" }
  /** Asks the worker for its version; answered on the message port with `SwVersionReply`. */
  | { type: "version" };

export interface SwVersionReply {
  type: "version";
  version: string;
}

export function isSwMessage(value: unknown): value is SwMessage {
  if (typeof value !== "object" || value === null) return false;
  const type = (value as { type?: unknown }).type;
  return type === "downloads-changed" || type === "version";
}
