import { fileURLToPath } from "node:url";
import { readJsonc } from "./jsonc.ts";

/**
 * The custom-domain routes of every site Worker, for the cross-site routes test
 * (`site-routes.test.ts`). Each site's production hostname must equal
 * `productionHosts(<domain>)[site]` of `@emunas/links`, and staging must claim none.
 *
 * To add a site Worker, add its wrangler.jsonc here.
 */
export const REPO = fileURLToPath(new URL("../../../../", import.meta.url));

export type SiteName = "home" | "quiet" | "live";

export const SITE_WRANGLER: Readonly<Record<SiteName, string>> = {
  home: `${REPO}apps/home/wrangler.jsonc`,
  quiet: `${REPO}apps/quiet/wrangler.jsonc`,
  live: `${REPO}apps/live/wrangler.jsonc`,
};

interface Route {
  pattern: string;
  custom_domain?: boolean;
  zone_name?: string;
}
interface Config {
  routes?: Route[];
  env?: Record<string, { routes?: Route[] }>;
}

export interface SiteRoutes {
  readonly site: SiteName;
  readonly file: string;
  /** Production custom-domain hostnames, lowercased. */
  readonly hosts: readonly string[];
  /** Routes that are not plain custom domains (patterns with a path or wildcard, zone routes). */
  readonly other: readonly Route[];
  /** Routes per non-production environment. */
  readonly envRoutes: Readonly<Record<string, readonly Route[] | undefined>>;
}

export function readSiteRoutes(site: SiteName): SiteRoutes {
  const file = SITE_WRANGLER[site];
  const cfg = readJsonc(file) as Config;
  const routes = cfg.routes ?? [];
  const isDomain = (r: Route) => r.custom_domain === true && /^[a-z0-9.-]+$/i.test(r.pattern);
  return {
    site,
    file,
    hosts: routes.filter(isDomain).map((r) => r.pattern.toLowerCase()),
    other: routes.filter((r) => !isDomain(r)),
    envRoutes: Object.fromEntries(Object.entries(cfg.env ?? {}).map(([k, v]) => [k, v.routes])),
  };
}

/** Every site Worker, in a fixed order. */
export const SITES: readonly SiteName[] = Object.keys(SITE_WRANGLER) as SiteName[];
