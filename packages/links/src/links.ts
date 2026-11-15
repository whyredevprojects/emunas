/**
 * Cross-site links, canonical and hreflang (integration-plan §2.2, §2.3).
 */
import { livePaths, quietPaths, type LivePaths, type QuietPaths } from "./builders.ts";
import { validateHosts, type Hosts } from "./hosts.ts";
import { formatLive, parseLive } from "./live.ts";
import { formatQuiet, parseQuiet } from "./quiet.ts";
import { EDS, isEd, type Ed, type LinkData, type Route, type Site } from "./types.ts";
import { pathSegments, splitUrl } from "./url.ts";

export interface HreflangLink {
  readonly hreflang: Ed | "x-default";
  readonly href: string;
}

export interface ParsedSiteUrl {
  readonly site: Site;
  readonly route: Route;
}

type Absolute<T> = { readonly [K in keyof T]: T[K] extends (...args: infer A) => string ? (...args: A) => string : never };

export interface Links {
  readonly hosts: Hosts;
  /** Absolute Quiet URLs (origin + path). For same-site links use `quietPaths()`. */
  readonly quiet: Absolute<QuietPaths>;
  /** Absolute Live URLs. */
  readonly live: Absolute<LivePaths>;
  /** Which site an absolute URL belongs to (by origin), or null. */
  siteOf(url: string): Site | null;
  /**
   * Parses a URL of either site. Absolute URLs are matched by origin; root-relative paths
   * need `from`. Null when the site is unknown or the path is not a page of that site.
   */
  parse(url: string, from?: Site): ParsedSiteUrl | null;
  /**
   * Maps any URL of one site to the equivalent absolute URL on the other. Live-only params
   * are dropped; Quiet entities below the page threshold map to the index anchor; pages
   * the other site lacks map to its closest listing or home. Null only when the site of
   * `url` cannot be told (foreign origin, or a relative path without `from`).
   */
  equivalent(url: string, from?: Site): string | null;
  /**
   * The canonical URL: always on the Quiet origin, never a fragment. For a Live URL it is
   * the Quiet equivalent; a Quiet URL is self-canonical. Relative paths are read as Live.
   */
  canonicalFor(url: string): string;
  /**
   * `<link rel="alternate" hreflang>` set for a page: both editions plus `x-default`
   * (the site root). Empty for paths that are not pages.
   */
  hreflangPair(path: string, site?: Site): HreflangLink[];
  /** The same page in the other edition / UI language, keeping time and section where possible. */
  withEdition(url: string, ed: Ed, site?: Site): string | null;
}

function stripHash(path: string): string {
  const i = path.indexOf("#");
  return i === -1 ? path : path.slice(0, i);
}

function edOfPath(path: string): Ed | undefined {
  const u = splitUrl(path);
  const s = u ? pathSegments(u.path) : null;
  const first = s?.[0];
  return isEd(first) ? first : undefined;
}

function absolutize<T extends Record<string, (...args: never[]) => string>>(origin: string, paths: T): Absolute<T> {
  const out: Record<string, (...args: never[]) => string> = {};
  for (const [name, fn] of Object.entries(paths)) out[name] = (...args: never[]) => origin + fn(...args);
  return out as Absolute<T>;
}

export function createLinks(options: { readonly hosts: Hosts; readonly data?: LinkData }): Links {
  const hosts = validateHosts(options.hosts);
  const data = options.data ?? {};
  const origin = (site: Site) => (site === "quiet" ? hosts.quiet : hosts.live);
  const format = (site: Site, route: Route, bare = false) =>
    site === "quiet" ? formatQuiet(route, data, { bare }) : formatLive(route, data, { bare });

  const siteOf = (url: string): Site | null => {
    const u = splitUrl(url);
    if (!u?.origin) return null;
    if (u.origin === hosts.quiet) return "quiet";
    if (u.origin === hosts.live) return "live";
    return null;
  };

  const resolveSite = (url: string, from: Site | undefined): Site | null => {
    const u = splitUrl(url);
    if (!u) return null;
    if (u.origin === null) return from ?? null;
    return siteOf(url);
  };

  const parse = (url: string, from?: Site): ParsedSiteUrl | null => {
    const site = resolveSite(url, from);
    if (!site) return null;
    const route = site === "quiet" ? parseQuiet(url) : parseLive(url, data);
    return route ? { site, route } : null;
  };

  /** Fallback for a path the site does not know: the same edition's home, else the root. */
  const fallbackRoute = (url: string): Route => {
    const e = edOfPath(url);
    return e ? { kind: "home", ed: e } : { kind: "root" };
  };

  const links: Links = {
    hosts,
    quiet: absolutize(hosts.quiet, quietPaths(data)),
    live: absolutize(hosts.live, livePaths(data)),
    siteOf,
    parse,
    equivalent(url, from) {
      const site = resolveSite(url, from);
      if (!site) return null;
      const other: Site = site === "quiet" ? "live" : "quiet";
      const route = parse(url, site)?.route ?? fallbackRoute(url);
      return origin(other) + format(other, route);
    },
    canonicalFor(url) {
      const site = resolveSite(url, "live") ?? "live";
      const route = parse(url, site)?.route ?? fallbackRoute(url);
      return hosts.quiet + stripHash(formatQuiet(route, data, { bare: true }));
    },
    hreflangPair(path, site = "quiet") {
      const route = parse(path, site)?.route;
      if (!route) return [];
      const out: HreflangLink[] = EDS.map((e) => ({
        hreflang: e,
        href: origin(site) + stripHash(format(site, route.kind === "root" ? { kind: "home", ed: e } : { ...route, ed: e }, true)),
      }));
      out.push({ hreflang: "x-default", href: `${origin(site)}/` });
      return out;
    },
    withEdition(url, e, from) {
      const site = resolveSite(url, from);
      if (!site || !isEd(e)) return null;
      const route = parse(url, site)?.route ?? fallbackRoute(url);
      const next: Route = route.kind === "root" ? { kind: "home", ed: e } : { ...route, ed: e };
      return origin(site) + format(site, next);
    },
  };
  return links;
}
