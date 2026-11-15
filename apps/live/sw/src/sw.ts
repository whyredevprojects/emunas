/**
 * Entry of the Live service worker, served at `/sw.js` (built by `sw/build.ts` after the app build).
 * The behaviour is in `handler.ts`; this file only connects it to the worker events.
 *
 * No `skipWaiting()`: a new version waits until every tab of the old one is closed, so an open tab
 * never loses the lazy route chunks of the build it started with (Workers assets keep only the
 * current build). `clients.claim()` on first activation lets the first visit work offline at once.
 */
/// <reference lib="webworker" />
import { createLiveWorker } from "./handler.ts";
import { isSwMessage } from "./protocol.ts";

declare const self: ServiceWorkerGlobalScope;
/** Hash of the precache list (build-time constant). */
declare const __SW_VERSION__: string;
/** Same-origin paths of the app shell (build-time constant). */
declare const __SW_PRECACHE__: readonly string[];
/** Path of the SPA fallback page (build-time constant). */
declare const __SW_FALLBACK__: string;

const worker = createLiveWorker({
  caches: self.caches,
  fetch: (request) => fetch(request),
  origin: self.location.origin,
  version: __SW_VERSION__,
  precache: __SW_PRECACHE__,
  fallback: __SW_FALLBACK__,
});

self.addEventListener("install", (event) => {
  event.waitUntil(worker.install());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(worker.activate().then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const response = worker.route(event.request, (p) => event.waitUntil(p));
  if (response) event.respondWith(response);
});

self.addEventListener("message", (event) => {
  const msg: unknown = event.data;
  if (!isSwMessage(msg)) return;
  const port = event.ports[0] ?? null;
  event.waitUntil(worker.message(msg, port ? (value) => port.postMessage(value) : null));
});
