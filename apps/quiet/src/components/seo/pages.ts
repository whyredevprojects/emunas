/**
 * The site's page files and their `getStaticPaths`, for the sitemaps. Reading the routes rather
 * than re-deriving them from `.corpus/` keeps the sitemaps equal to what the build writes: each
 * page decides from `.corpus/` which of its pages exist (entity thresholds, series, years …).
 * Loaded lazily, at sitemap build time only.
 */
import { pagePaths, type StaticPaths } from "./sitemap.ts";

const PAGES = import.meta.glob<StaticPaths | undefined>("../../pages/**/*.astro", { import: "getStaticPaths" });

let cached: Promise<string[]> | undefined;

/** Every page path the build writes (both editions and the root), sorted. */
export function builtPagePaths(): Promise<string[]> {
  cached ??= (async () => {
    const loaded: Record<string, StaticPaths | undefined> = {};
    for (const [file, load] of Object.entries(PAGES)) loaded[file] = await load();
    return pagePaths(loaded);
  })();
  return cached;
}
