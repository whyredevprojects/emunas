/**
 * Per-edition sitemaps and robots.txt (integration-plan §2.3, W4.6). Pure functions; the page
 * list itself comes from the site's own routes (./pages.ts), so a sitemap lists exactly the pages
 * the build writes: every shiur, section, series, calendar, year and index page in every edition,
 * each read from `.corpus/` by the page that builds it.
 */
import { EDS, editionOfPath, pathInEdition, switchEdition, type Ed } from "../../lib/edition.ts";

/** One sitemap file may hold at most 50,000 URLs (sitemaps.org). */
export const SITEMAP_URL_LIMIT = 50_000;
export const SITEMAP_INDEX_PATH = "/sitemap-index.xml";

/** Pages that exist only for checks and carry `noindex`: never listed. */
const NOT_LISTED: readonly RegExp[] = [/^\/shell-sample\//];

export type Params = Readonly<Record<string, string | number | undefined>>;
export type StaticPaths = () => readonly { readonly params: Params }[] | Promise<readonly { readonly params: Params }[]>;

export function sitemapPath(ed: Ed): string {
  return `/sitemap-${ed}.xml`;
}

/**
 * The route pattern of a page file under src/pages, e.g. `/[ed]/shiur/[id]/`, or null for files
 * that are not routes (a segment starting with `_`).
 */
export function routeOfFile(file: string): string | null {
  const m = /(?:^|\/)pages\/(.*)\.astro$/.exec(file);
  if (!m) return null;
  const segs = m[1]!.split("/");
  if (segs.some((s) => s.startsWith("_"))) return null;
  if (segs.at(-1) === "index") segs.pop();
  return segs.length === 0 ? "/" : `/${segs.join("/")}/`;
}

/** Fills `[name]` / `[...name]` segments of a route pattern with page params. */
export function fillRoute(route: string, params: Params): string {
  return route.replace(/\[(\.\.\.)?([A-Za-z0-9_]+)\]/g, (_, rest: string | undefined, name: string) => {
    const v = params[name];
    if (v === undefined || v === "") throw new Error(`sitemap: route ${route} has no value for [${name}]`);
    return rest ? String(v).split("/").map(encodeURIComponent).join("/") : encodeURIComponent(String(v));
  });
}

/** All built page paths, from each page file's route and `getStaticPaths` (undefined = static page). */
export async function pagePaths(pages: Readonly<Record<string, StaticPaths | undefined>>): Promise<string[]> {
  const out = new Set<string>();
  for (const [file, gsp] of Object.entries(pages)) {
    const route = routeOfFile(file);
    if (route === null) continue;
    if (!/\[/.test(route)) {
      out.add(route);
      continue;
    }
    if (!gsp) throw new Error(`sitemap: dynamic page ${file} has no getStaticPaths`);
    for (const { params } of await gsp()) out.add(fillRoute(route, params));
  }
  return [...out].sort();
}

/** The listed paths of one edition, sorted. */
export function editionPaths(paths: readonly string[], ed: Ed): string[] {
  return paths.filter((p) => editionOfPath(p) === ed && !NOT_LISTED.some((re) => re.test(pathInEdition(p) ?? ""))).sort();
}

export function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/** A `<urlset>` with the yi/en/x-default alternates of each page (Google's sitemap hreflang form). */
export function sitemapXml(origin: string, paths: readonly string[]): string {
  if (paths.length > SITEMAP_URL_LIMIT) throw new Error(`sitemap: ${paths.length} URLs is over the ${SITEMAP_URL_LIMIT} limit`);
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
  ];
  for (const p of paths) {
    lines.push(`<url><loc>${xmlEscape(origin + p)}</loc>`);
    for (const ed of EDS) {
      lines.push(`<xhtml:link rel="alternate" hreflang="${ed}" href="${xmlEscape(origin + switchEdition(p, ed))}"/>`);
    }
    lines.push(`<xhtml:link rel="alternate" hreflang="x-default" href="${xmlEscape(`${origin}/`)}"/></url>`);
  }
  lines.push("</urlset>", "");
  return lines.join("\n");
}

export function sitemapIndexXml(origin: string): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...EDS.map((ed) => `<sitemap><loc>${xmlEscape(origin + sitemapPath(ed))}</loc></sitemap>`),
    "</sitemapindex>",
    "",
  ].join("\n");
}

/**
 * robots.txt (integration-plan §2.3): allow all, disallow `/api/` and `/admin/`, name the sitemap
 * index. A build with placeholder hosts disallows everything (it must never be indexed).
 */
export function robotsTxt(origin: string, opts: { readonly placeholder?: boolean } = {}): string {
  if (opts.placeholder) return ["# Placeholder build (no site hosts configured): not for indexing.", "User-agent: *", "Disallow: /", ""].join("\n");
  return ["User-agent: *", "Allow: /", "Disallow: /api/", "Disallow: /admin/", "", `Sitemap: ${origin}${SITEMAP_INDEX_PATH}`, ""].join("\n");
}
