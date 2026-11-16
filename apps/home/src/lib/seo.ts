/**
 * Search-engine and share-preview output of the home site: head tags (self-canonical on the home
 * origin, Open Graph), the sitemap and robots.txt. Pure: hosts come in as arguments.
 */

export interface HeadInput {
  /** Root-relative path of the page. */
  readonly path: string;
  /** Title for Open Graph (without the site name). */
  readonly title: string;
  readonly description: string;
  readonly siteName: string;
  readonly noindex?: boolean;
}

export interface HeadTags {
  readonly canonical: string | null;
  readonly robots: string | null;
  readonly og: readonly { readonly property: string; readonly content: string }[];
}

export function headTags(input: HeadInput, homeOrigin: string, opts: { readonly placeholder?: boolean } = {}): HeadTags {
  if (!input.path.startsWith("/") || /[?#]/.test(input.path)) {
    throw new TypeError(`seo: expected a bare root-relative path, got ${JSON.stringify(input.path)}`);
  }
  const noindex = input.noindex === true || opts.placeholder === true;
  const url = homeOrigin + input.path;
  return {
    canonical: noindex ? null : url,
    robots: noindex ? "noindex" : null,
    og: [
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: input.siteName },
      { property: "og:title", content: input.title },
      { property: "og:description", content: input.description },
      { property: "og:url", content: url },
      { property: "og:locale", content: "en_US" },
    ],
  };
}

/** The pages listed in the sitemap: every page the build writes, except 404. */
export const SITEMAP_PATHS: readonly string[] = ["/", "/about/", "/essays/", "/sefarim/", "/weekly-devar-torah/", "/contact/"];
export const SITEMAP_PATH = "/sitemap.xml";

export function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export function sitemapXml(origin: string, paths: readonly string[]): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...paths.map((p) => `<url><loc>${xmlEscape(origin + p)}</loc></url>`),
    "</urlset>",
    "",
  ].join("\n");
}

/** Allow all and name the sitemap; a placeholder build disallows everything. */
export function robotsTxt(origin: string, opts: { readonly placeholder?: boolean } = {}): string {
  if (opts.placeholder) return ["# Placeholder build (no site hosts configured): not for indexing.", "User-agent: *", "Disallow: /", ""].join("\n");
  return ["User-agent: *", "Allow: /", "", `Sitemap: ${origin}${SITEMAP_PATH}`, ""].join("\n");
}
