/**
 * The search-engine and share-preview tags of a Quiet page (integration-plan §2.3): self-canonical
 * URL on the Quiet origin, one `hreflang` per edition (`EDS`) plus `x-default` → the root chooser, and Open
 * Graph tags from the page title (the catalog title on a shiur page) and its description (the
 * one-line summary on a shiur page with notes). Pure: the hosts come in as an argument.
 *
 * Quiet's editions have the same paths apart from the first segment, so the alternate of any
 * edition page is the same path in each other edition (the edition switch's rule), not a parsed and
 * re-formatted route: that keeps section, year and entity pages pointing at themselves.
 */
import type { Hosts } from "@emunas/links";
import { EDS, editionOfPath, pathInEdition, switchEdition, type Ed } from "../../lib/edition.ts";

/** `og:locale` per edition (Open Graph wants language_TERRITORY where one is usual). */
export const OG_LOCALE: Readonly<Record<Ed, string>> = { en: "en_US", yi: "yi", he: "he_IL" };

export interface HeadInput {
  /** Root-relative path of the page (query and fragment are dropped). */
  readonly path: string;
  /** Page title as shown in `<title>`, without the site name (the site name on the home pages). */
  readonly title: string;
  readonly description: string;
  readonly siteName: string;
  readonly noindex?: boolean;
}

export interface HreflangTag {
  readonly hreflang: Ed | "x-default";
  readonly href: string;
}

export interface MetaProperty {
  readonly property: string;
  readonly content: string;
}

export interface HeadTags {
  /** Absolute canonical URL; null on noindex pages. */
  readonly canonical: string | null;
  /** Empty on noindex pages and on paths outside the editions. */
  readonly alternates: readonly HreflangTag[];
  readonly robots: string | null;
  readonly og: readonly MetaProperty[];
  /** `name`-keyed meta (Twitter/X card). */
  readonly meta: readonly { readonly name: string; readonly content: string }[];
}

/** The page path without query or fragment, always starting with `/`. */
export function barePath(path: string): string {
  if (!path.startsWith("/")) throw new TypeError(`head: expected a root-relative path, got ${JSON.stringify(path)}`);
  const cut = path.search(/[?#]/);
  return cut === -1 ? path : path.slice(0, cut);
}

/** Edition alternates for a path: every edition for `/{ed}/…` and the root, none otherwise. */
export function hreflangFor(path: string, origin: string): HreflangTag[] {
  const p = barePath(path);
  if (p !== "/" && editionOfPath(p) === null) return [];
  const out: HreflangTag[] = EDS.map((ed) => ({ hreflang: ed, href: origin + switchEdition(p, ed) }));
  out.push({ hreflang: "x-default", href: `${origin}/` });
  return out;
}

export function headTags(input: HeadInput, hosts: Pick<Hosts, "quiet">, opts: { readonly placeholder?: boolean } = {}): HeadTags {
  const path = barePath(input.path);
  const url = hosts.quiet + path;
  const noindex = input.noindex === true || opts.placeholder === true;
  const ed = editionOfPath(path);
  const og: MetaProperty[] = [
    { property: "og:type", content: /^\/shiur\//.test(pathInEdition(path) ?? "") ? "article" : "website" },
    { property: "og:site_name", content: input.siteName },
    { property: "og:title", content: input.title },
    { property: "og:description", content: input.description },
    { property: "og:url", content: url },
  ];
  if (ed !== null) og.push({ property: "og:locale", content: OG_LOCALE[ed] });
  return {
    canonical: noindex ? null : url,
    alternates: noindex ? [] : hreflangFor(path, hosts.quiet),
    robots: noindex ? "noindex" : null,
    og,
    meta: [{ name: "twitter:card", content: "summary" }],
  };
}
