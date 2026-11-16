/**
 * Route `meta` exports with the real page title (W5.4): on a prerendered page the root loader's
 * build-time `SeoPage` (W4.5) carries the shiur, series, work, person, concept or occasion name, so
 * `<title>` is "<name> · <site>" in the static HTML that search engines and share previews read.
 * Where the loader data was made for another path (client navigation: the root loader never
 * revalidates under `ssr: false`) or there is none (the SPA fallback, pages that are not
 * prerendered), the title is the page kind in the interface language, as before.
 *
 * Pure and browser-safe. The `og:title` (`head.ts`) uses the same clipped name, and the post-build
 * check (`check.server.ts`) verifies that every prerendered content page's `<title>` carries it.
 */
import { isUiLang, type UiLang } from "@emunas/i18n";
import { tFor, type UiKey } from "../i18n/index.ts";
import { clip, type RootSeoData, type SeoPage } from "./head.ts";
import { isIndexable, normalizeLivePath } from "./policy.ts";

/** Separator between the page name and the site name, as in the stub titles. */
export const TITLE_SEPARATOR = " · ";

/** Longest page name kept in `<title>` and `og:title` (`clip` cuts at a word boundary). */
export const TITLE_MAX = 120;

/** The structural part of React Router's `MetaArgs` this module reads. */
export interface SeoMetaArgs {
  params: Readonly<Record<string, string | undefined>>;
  location: { pathname: string };
  matches: readonly ({ id: string; loaderData?: unknown } | undefined)[];
}

/** The root loader's page data, when it was computed for `pathname`. */
export function seoPageFor(pathname: string, matches: SeoMetaArgs["matches"]): SeoPage | null {
  const root = matches.find((m) => m?.id === "root");
  const data = root?.loaderData as RootSeoData | undefined;
  const page = data?.seo?.page ?? null;
  return page && page.path === normalizeLivePath(pathname) ? page : null;
}

/** `<name> · <site>` for a content page with build-time data; null for anything else. */
export function contentTitle(page: SeoPage | null): string | null {
  if (!page || !isIndexable(page.kind) || page.title.trim() === "") return null;
  return `${clip(page.title, TITLE_MAX)}${TITLE_SEPARATOR}${tFor(page.ui)("site.name")}`;
}

/** `<page kind> · <site>` in the interface language. */
export function kindTitle(ui: UiLang, key: UiKey): string {
  const t = tFor(ui);
  return `${t(key)}${TITLE_SEPARATOR}${t("site.name")}`;
}

/**
 * A route `meta` export: the real name on prerendered content pages, else `fallback` (the page kind).
 * Usage: `export const meta = seoMeta("page.concept");`
 */
export function seoMeta(fallback: UiKey) {
  return ({ params, location, matches }: SeoMetaArgs): { title: string }[] => {
    const ui = params["ui"];
    const title = contentTitle(seoPageFor(location.pathname, matches)) ?? kindTitle(isUiLang(ui) ? ui : "en", fallback);
    return [{ title }];
  };
}
