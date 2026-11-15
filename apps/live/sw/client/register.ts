/**
 * Registers the Live service worker (`/sw.js`, built by `sw/build.ts`) once per page load, in
 * production builds only (the dev server has no `/sw.js`). Afterwards it reconciles the download
 * records with Cache Storage in the background (evicted downloads show as partial on My Shelf).
 *
 * Called from the root route's effect; safe to call more than once and where workers are missing
 * (private modes, old browsers): the app then simply has no offline support.
 */
export const SW_URL = "/sw.js";

let started = false;

export function registerServiceWorker(): void {
  if (started || typeof window === "undefined" || !import.meta.env.PROD) return;
  started = true;
  if (!("serviceWorker" in navigator)) return;
  const start = () => {
    navigator.serviceWorker.register(SW_URL, { scope: "/" }).catch(() => undefined);
    void import("./downloads.ts").then((m) => m.reconcileDownloads()).catch(() => undefined);
  };
  // After the page has loaded, so precaching never competes with the first render.
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });
}
