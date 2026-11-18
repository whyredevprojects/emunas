/**
 * Which build files make up the offline app shell (tech-live §4.5 "precache the shell").
 *
 * The shell is everything needed to start the app on any route without the network: the hashed
 * JS/CSS/font chunks (`assets/`, all route chunks included, so every page can open offline), icons,
 * the web manifest, the SPA fallback page and the home page of every UI language (`/en/`, `/yi/`, …).
 * Not precached: `/data/*` (runtime, stale-while-revalidate), the thousands of other prerendered
 * pages (the SPA fallback renders them offline), source maps, `_headers` and the worker itself.
 */

import { UI_LANGS } from "@emunas/i18n";

/**
 * The SPA fallback page as it is precached and served offline. React Router writes the fallback
 * as `index.html` (W4.5 does not prerender `/`, which the site Worker redirects), and `/` and
 * `/index.html` never reach that file on Cloudflare (Worker redirect; trailing-slash redirect). So
 * `sw/build.ts` copies it to `SPA_FALLBACK_FILE`, which the host serves at this path with a plain 200.
 */
export const SPA_FALLBACK = "/__spa-fallback";
/** The file in `build/client` that `SPA_FALLBACK` is served from. */
export const SPA_FALLBACK_FILE = "__spa-fallback.html";
/** The file React Router writes the SPA fallback to (copied to `SPA_FALLBACK_FILE` at build). */
export const SPA_FALLBACK_SOURCE = "index.html";

/**
 * Prerendered pages precached by the URL the host serves them at without a redirect (Cloudflare's
 * default `auto-trailing-slash`: `en/index.html` → `/en/`, `x.html` → `/x`).
 */
const TOP_PAGES: ReadonlyMap<string, string> = new Map([
  ...UI_LANGS.map((ui): [string, string] => [`${ui}/index.html`, `/${ui}/`]),
  [SPA_FALLBACK_FILE, SPA_FALLBACK],
]);

/**
 * Picks the precache paths from the files of `build/client` (paths relative to it, `/`-separated).
 * Returns URL paths (leading `/`), sorted.
 */
export function selectPrecache(files: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of files) {
    const f = raw.replace(/^\.?\/+/u, "");
    if (f.endsWith(".map")) continue;
    const page = TOP_PAGES.get(f);
    if (page !== undefined) {
      out.push(page);
    } else if (
      f === "manifest.webmanifest" ||
      (f.startsWith("assets/") && !f.endsWith(".html")) ||
      f.startsWith("icons/")
    ) {
      out.push(`/${f.split("/").map(encodeURIComponent).join("/")}`);
    }
  }
  return out.sort();
}

/** The `build/client` file (relative path) behind a precache URL path from `selectPrecache`. */
export function precacheFile(urlPath: string): string {
  for (const [file, url] of TOP_PAGES) if (url === urlPath) return file;
  return decodeURIComponent(urlPath.slice(1));
}
