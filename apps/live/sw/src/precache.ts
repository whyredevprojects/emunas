/**
 * Which build files make up the offline app shell (tech-live §4.5 "precache the shell").
 *
 * The shell is everything needed to start the app on any route without the network: the hashed
 * JS/CSS/font chunks (`assets/`, all route chunks included, so every page can open offline), icons,
 * the web manifest, the SPA fallback page and the top-level prerendered pages (`/`, `/en/`, `/yi/`).
 * Not precached: `/data/*` (runtime, stale-while-revalidate), the thousands of other prerendered
 * pages (the SPA fallback renders them offline), source maps, `_headers` and the worker itself.
 */

export const SPA_FALLBACK = "/__spa-fallback.html";

const TOP_PAGES = new Set(["index.html", "en/index.html", "yi/index.html", "__spa-fallback.html"]);

/**
 * Picks the precache paths from the files of `build/client` (paths relative to it, `/`-separated).
 * Returns URL paths (leading `/`), sorted.
 */
export function selectPrecache(files: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of files) {
    const f = raw.replace(/^\.?\/+/u, "");
    if (f.endsWith(".map")) continue;
    if (
      TOP_PAGES.has(f) ||
      f === "manifest.webmanifest" ||
      (f.startsWith("assets/") && !f.endsWith(".html")) ||
      f.startsWith("icons/")
    ) {
      out.push(`/${f.split("/").map(encodeURIComponent).join("/")}`);
    }
  }
  return out.sort();
}
