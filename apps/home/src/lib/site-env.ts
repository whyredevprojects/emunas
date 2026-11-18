/**
 * Hosts for the home site's absolute URLs (canonical, Open Graph, sitemap, robots.txt) and its
 * links into Library (Quiet) and Listen (Live). Read from the build environment the way
 * `@emunas/links` `hostsFromEnv` reads it: `EMUNAS_DOMAIN` (home on the apex, Library on
 * `library.`, Listen on `listen.`), or `EMUNAS_WORKERS_SUBDOMAIN` (+ `EMUNAS_STAGE=staging`), or
 * explicit `EMUNAS_HOME_ORIGIN` + `EMUNAS_QUIET_ORIGIN` + `EMUNAS_LIVE_ORIGIN`.
 *
 * Outside a deploy build, unset hosts fall back to `example.invalid` placeholders and every page
 * carries `noindex`. In a CI deploy build (`CI` and `EMUNAS_DEPLOY`) unset hosts fail the build.
 * Malformed values always fail.
 */
import { hostsFromEnv, productionHosts, type Hosts } from "@emunas/links";

export type SiteEnvVars = Readonly<Record<string, string | undefined>>;

export const PLACEHOLDER_DOMAIN = "example.invalid";

const HOST_VARS = [
  "EMUNAS_DOMAIN",
  "EMUNAS_WORKERS_SUBDOMAIN",
  "EMUNAS_HOME_ORIGIN",
  "EMUNAS_QUIET_ORIGIN",
  "EMUNAS_LIVE_ORIGIN",
] as const;

export interface SiteEnv {
  readonly hosts: Hosts;
  /** True when no hosts are configured (dev placeholders; never in a deploy build). */
  readonly placeholder: boolean;
}

const truthy = (v: string | undefined) => v !== undefined && /^(?:1|true|yes)$/i.test(v.trim());
const set = (v: string | undefined) => v !== undefined && v.trim() !== "";

export function isDeployBuild(env: SiteEnvVars): boolean {
  return truthy(env["CI"]) && truthy(env["EMUNAS_DEPLOY"]);
}

export function siteEnv(env: SiteEnvVars): SiteEnv {
  if (HOST_VARS.some((k) => set(env[k]))) return { hosts: hostsFromEnv(env), placeholder: false };
  if (isDeployBuild(env)) {
    throw new Error(
      "home deploy build: no site hosts configured; set EMUNAS_DOMAIN or EMUNAS_WORKERS_SUBDOMAIN (or EMUNAS_HOME_ORIGIN, EMUNAS_QUIET_ORIGIN and EMUNAS_LIVE_ORIGIN)",
    );
  }
  return { hosts: productionHosts(PLACEHOLDER_DOMAIN), placeholder: true };
}

let cached: SiteEnv | undefined;

/** `siteEnv(process.env)`, resolved once per build; warns once when placeholders are in use. */
export function currentSiteEnv(): SiteEnv {
  if (cached) return cached;
  cached = siteEnv(process.env);
  if (cached.placeholder) console.warn(`[home] no site hosts configured; using ${PLACEHOLDER_DOMAIN} placeholders and noindex`);
  return cached;
}

/** Where the doorways, pills and footer send readers: the English editions of the two shiur sites. */
export function siteLinks(hosts: Hosts): { readonly library: string; readonly listen: string } {
  return { library: `${hosts.quiet}/en/`, listen: `${hosts.live}/en/` };
}

/** `https://library.example.org` → `library.example.org`, shown under each doorway. */
export function bareHost(origin: string): string {
  return origin.replace(/^https?:\/\//, "");
}
