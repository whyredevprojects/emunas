/**
 * Search-engine and share-preview output of the home site: head tags (self-canonical on the home
 * origin, one `hreflang` alternate per interface language plus `x-default` → the default-language
 * URL, Open Graph with `og:locale`), the sitemap and robots.txt. Pure: hosts come in as arguments.
 */
import { UI_LANGS, UI_LOCALE, type UiLang } from "@emunas/i18n";
import { HOME_DEFAULT_LANG, homePath } from "./lang-path.ts";

/** `og:locale` per language (Open Graph wants language_TERRITORY where one is usual), as on the Library. */
export const OG_LOCALE: Readonly<Record<UiLang, string>> = { en: "en_US", yi: "yi", he: "he_IL" };

export interface HeadInput {
  /** The page's language. */
  readonly lang: UiLang;
  /** Language-neutral root-relative path of the page (`/about/`); its URL is `homePath(lang, page)`. */
  readonly page: string;
  /** Title for Open Graph (without the site name). */
  readonly title: string;
  readonly description: string;
  readonly siteName: string;
  readonly noindex?: boolean;
}

export interface HreflangTag {
  readonly hreflang: string;
  readonly href: string;
}

export interface HeadTags {
  readonly canonical: string | null;
  /** Empty on noindex pages. */
  readonly alternates: readonly HreflangTag[];
  readonly robots: string | null;
  readonly og: readonly { readonly property: string; readonly content: string }[];
}

/** The page in every language (`UI_LANGS` order), then `x-default` → the default-language URL. */
export function hreflangFor(page: string, homeOrigin: string): HreflangTag[] {
  return [
    ...UI_LANGS.map((l) => ({ hreflang: UI_LOCALE[l], href: homeOrigin + homePath(l, page) })),
    { hreflang: "x-default", href: homeOrigin + homePath(HOME_DEFAULT_LANG, page) },
  ];
}

export function headTags(input: HeadInput, homeOrigin: string, opts: { readonly placeholder?: boolean } = {}): HeadTags {
  if (!input.page.startsWith("/") || /[?#]/.test(input.page)) {
    throw new TypeError(`seo: expected a bare root-relative path, got ${JSON.stringify(input.page)}`);
  }
  const noindex = input.noindex === true || opts.placeholder === true;
  const url = homeOrigin + homePath(input.lang, input.page);
  return {
    canonical: noindex ? null : url,
    alternates: noindex ? [] : hreflangFor(input.page, homeOrigin),
    robots: noindex ? "noindex" : null,
    og: [
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: input.siteName },
      { property: "og:title", content: input.title },
      { property: "og:description", content: input.description },
      { property: "og:url", content: url },
      { property: "og:locale", content: OG_LOCALE[input.lang] },
      ...UI_LANGS.filter((l) => l !== input.lang).map((l) => ({ property: "og:locale:alternate", content: OG_LOCALE[l] })),
    ],
  };
}

/** Every page of the site, language-neutral: each is built in every language (src/pages/[...lang]/). */
export const PAGES: readonly string[] = ["/", "/about/", "/essays/", "/sefarim/", "/weekly-devar-torah/", "/contact/"];

/** The paths listed in the sitemap: every page in every language; the 404 page is left out. */
export const SITEMAP_PATHS: readonly string[] = UI_LANGS.flatMap((l) => PAGES.map((p) => homePath(l, p)));
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
