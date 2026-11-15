/**
 * The SEO `<head>` tags of a Live page (integration-plan §2.3, W4.5): `robots` noindex on app-only
 * pages, `<link rel="canonical">` to the Quiet equivalent (never a `listen.*` URL), `hreflang`
 * alternates for the two UI languages, description and OpenGraph/Twitter tags for share previews.
 *
 * Pure and browser-safe. At build time the root loader computes `SeoPage` (with the `.corpus`
 * lookups); on the client, pages without one (client navigation, SPA fallback) get robots,
 * canonical and hreflang from the path alone.
 */
import type { UiLang } from "@emunas/i18n";
import { createLinks, type HreflangLink, type Hosts, type Links } from "@emunas/links";
import { tFor } from "../i18n/index.ts";
import type { PageText } from "./model.ts";
import { classifyLivePath, isIndexable, normalizeLivePath, type LivePageKind } from "./policy.ts";
import { seoStrings } from "./strings.ts";

/** Per-page SEO data computed at build time (root loader). */
export interface SeoPage {
  /** `normalizeLivePath` of the page it was made for. */
  path: string;
  kind: LivePageKind;
  ui: UiLang;
  title: string;
  description: string;
  titleLang: "en" | "yi" | null;
  /** Absolute Quiet URL, or null without configured hosts. */
  canonical: string | null;
  alternates: HreflangLink[];
  /** Absolute Live URL of the page (og:url), or null without hosts. */
  url: string | null;
}

/** What the root loader returns (serialized into every prerendered page). */
export interface RootSeoData {
  seo: {
    hosts: Hosts | null;
    page: SeoPage | null;
    /**
     * Rendered for the SPA fallback (`index.html`), which the host serves for every path without a
     * prerendered page: its static HTML is `noindex` with no canonical, whatever path it ends up at.
     */
    fallback?: true;
  };
}

export type HeadTag =
  | { tag: "meta"; name: string; content: string }
  | { tag: "meta"; property: string; content: string }
  | { tag: "link"; rel: "canonical"; href: string }
  | { tag: "link"; rel: "alternate"; hrefLang: string; href: string };

const linksCache = new WeakMap<Hosts, Links>();
function linksFor(hosts: Hosts): Links | null {
  let l = linksCache.get(hosts);
  if (!l) {
    try {
      l = createLinks({ hosts });
    } catch {
      return null;
    }
    linksCache.set(hosts, l);
  }
  return l;
}

/** Builds `SeoPage` for one path (build time, with the `.corpus` link data in `links`). */
export function buildSeoPage(pathname: string, text: PageText, links: Links | null): SeoPage {
  const path = normalizeLivePath(pathname);
  const page = classifyLivePath(path);
  const indexable = isIndexable(page.kind);
  return {
    path,
    kind: page.kind,
    ui: page.ui ?? "en",
    title: text.title,
    description: text.description,
    titleLang: text.titleLang,
    canonical: links ? links.canonicalFor(links.hosts.live + path) : null,
    alternates: links && indexable ? links.hreflangPair(path, "live") : [],
    url: links ? links.hosts.live + path : null,
  };
}

/** Collapses whitespace and cuts at a word boundary (descriptions are shown at ~160 characters). */
export function clip(text: string, max = 200): string {
  const t = text.replace(/\s+/gu, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const at = cut.lastIndexOf(" ");
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,;:.—-]+$/u, "")}…`;
}

export function headTags(pathname: string, data: RootSeoData["seo"] | null | undefined): HeadTag[] {
  const path = normalizeLivePath(pathname);
  const info = classifyLivePath(path);
  const ui: UiLang = info.ui ?? "en";
  const page = data?.page && data.page.path === path ? data.page : null;
  const links = data?.hosts ? linksFor(data.hosts) : null;
  const indexable = isIndexable(info.kind);
  const tags: HeadTag[] = [];

  // The fallback document itself (server render at "/"): after hydration the real path takes over.
  if (data?.fallback && path === "/") return [{ tag: "meta", name: "robots", content: "noindex" }];

  if (!indexable) tags.push({ tag: "meta", name: "robots", content: "noindex" });

  const canonical = page ? page.canonical : links ? links.canonicalFor(links.hosts.live + path) : null;
  if (canonical) tags.push({ tag: "link", rel: "canonical", href: canonical });

  const alternates = indexable ? (page ? page.alternates : links ? links.hreflangPair(path, "live") : []) : [];
  for (const a of alternates) tags.push({ tag: "link", rel: "alternate", hrefLang: a.hreflang, href: a.href });

  if (page) {
    const description = clip(page.description);
    const other: UiLang = ui === "en" ? "yi" : "en";
    tags.push({ tag: "meta", name: "description", content: description });
    tags.push({ tag: "meta", property: "og:site_name", content: tFor(ui)("site.name") });
    tags.push({ tag: "meta", property: "og:type", content: page.kind === "shiur" ? "article" : "website" });
    tags.push({ tag: "meta", property: "og:title", content: clip(page.title, 120) });
    tags.push({ tag: "meta", property: "og:description", content: description });
    if (page.url) tags.push({ tag: "meta", property: "og:url", content: page.url });
    tags.push({ tag: "meta", property: "og:locale", content: seoStrings[ui].locale });
    tags.push({ tag: "meta", property: "og:locale:alternate", content: seoStrings[other].locale });
    tags.push({ tag: "meta", name: "twitter:card", content: "summary" });
    tags.push({ tag: "meta", name: "twitter:title", content: clip(page.title, 120) });
    tags.push({ tag: "meta", name: "twitter:description", content: description });
  }
  return tags;
}
