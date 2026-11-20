/**
 * Host config (integration-plan §2.1, §3.4).
 *
 * Production, for a domain `<d>`: the landing site ("home") on the apex `https://<d>`, Quiet
 * (the library) on `https://library.<d>`, Live on `https://analyze.<d>`. Media (R2) is on
 * `media.<d>` and is configured separately (`EMUNAS_MEDIA_ORIGIN`). Changing the domain is a
 * config change only: every host is derived from `EMUNAS_DOMAIN`.
 * Before the domain is set, and on staging: the workers.dev hosts
 * `emunas-{home,quiet,live}[-staging].<subdomain>.workers.dev`.
 */

/** The two sites that link to each other (cross-site links, canonical, hreflang). */
export interface SiteHosts {
  /** Origin, e.g. `https://library.example.org` (no trailing slash). The canonical site. */
  readonly quiet: string;
  readonly live: string;
}

/** Every site's origin. `home` is the landing site on the apex. */
export interface Hosts extends SiteHosts {
  readonly home: string;
}

/**
 * Environment variables read by `hostsFromEnv`. Pass `process.env`, `import.meta.env` or a
 * Worker `env`; extra keys are ignored. Precedence: explicit origins, then the domain,
 * then the workers.dev subdomain.
 */
export interface HostEnv {
  /** Full origins, mainly for local dev (`http://localhost:4321`) and preview URLs. */
  readonly EMUNAS_HOME_ORIGIN?: string | undefined;
  readonly EMUNAS_QUIET_ORIGIN?: string | undefined;
  readonly EMUNAS_LIVE_ORIGIN?: string | undefined;
  /** Registrable production domain, e.g. `example.org` (home = apex, Quiet = `library.`, Live = `analyze.`). */
  readonly EMUNAS_DOMAIN?: string | undefined;
  /** Cloudflare account workers.dev subdomain (the `<account>` in `<worker>.<account>.workers.dev`). */
  readonly EMUNAS_WORKERS_SUBDOMAIN?: string | undefined;
  /** `staging` selects the `-staging` workers.dev hosts. Ignored when a domain is set. */
  readonly EMUNAS_STAGE?: string | undefined;
}

export const QUIET_SUBDOMAIN = "library";
export const LIVE_SUBDOMAIN = "analyze";
export const MEDIA_SUBDOMAIN = "media";
export const HOME_WORKER = "emunas-home";
export const QUIET_WORKER = "emunas-quiet";
export const LIVE_WORKER = "emunas-live";

/** Subdomains of the apex that belong to a site (or media); never a value for `EMUNAS_DOMAIN`. */
const SITE_SUBDOMAINS = [QUIET_SUBDOMAIN, LIVE_SUBDOMAIN, MEDIA_SUBDOMAIN] as const;

const HOSTNAME_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/;
const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const ORIGIN_RE = /^(https?):\/\/([a-z0-9.-]+)(?::(\d{1,5}))?$/;

/** Lowercases and validates an origin; strips a trailing slash. Throws on anything else. */
export function normalizeOrigin(value: string): string {
  const v = value.trim().toLowerCase().replace(/\/+$/, "");
  const m = ORIGIN_RE.exec(v);
  if (!m || m[2] === undefined) throw new Error(`@emunas/links: not an origin: ${JSON.stringify(value)}`);
  const host = m[2];
  if (host !== "localhost" && !HOSTNAME_RE.test(host) && !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
    throw new Error(`@emunas/links: bad host in origin: ${JSON.stringify(value)}`);
  }
  return v;
}

/** The production hosts for apex domain `domain` (a leading `www.` is dropped). */
export function productionHosts(domain: string): Hosts {
  const d = domain.trim().toLowerCase().replace(/^www\./, "");
  if (!HOSTNAME_RE.test(d)) throw new Error(`@emunas/links: bad domain: ${JSON.stringify(domain)}`);
  const sub = SITE_SUBDOMAINS.find((s) => d.startsWith(`${s}.`));
  if (sub !== undefined) {
    throw new Error(`@emunas/links: EMUNAS_DOMAIN is the apex, not the ${sub}. host`);
  }
  return { home: `https://${d}`, quiet: `https://${QUIET_SUBDOMAIN}.${d}`, live: `https://${LIVE_SUBDOMAIN}.${d}` };
}

export function workersDevHosts(subdomain: string, stage: "production" | "staging" = "production"): Hosts {
  const sub = subdomain.trim().toLowerCase();
  if (!LABEL_RE.test(sub)) throw new Error(`@emunas/links: bad workers.dev subdomain: ${JSON.stringify(subdomain)}`);
  const suffix = stage === "staging" ? "-staging" : "";
  return {
    home: `https://${HOME_WORKER}${suffix}.${sub}.workers.dev`,
    quiet: `https://${QUIET_WORKER}${suffix}.${sub}.workers.dev`,
    live: `https://${LIVE_WORKER}${suffix}.${sub}.workers.dev`,
  };
}

function nonEmpty(v: string | undefined): string | undefined {
  return v === undefined || v.trim() === "" ? undefined : v;
}

function fallbackHosts(env: HostEnv): Hosts | undefined {
  const stage = nonEmpty(env.EMUNAS_STAGE) === "staging" ? "staging" : "production";
  const domain = nonEmpty(env.EMUNAS_DOMAIN);
  const sub = nonEmpty(env.EMUNAS_WORKERS_SUBDOMAIN);
  if (domain !== undefined && stage === "production") return productionHosts(domain);
  if (sub !== undefined) return workersDevHosts(sub, stage);
  if (domain !== undefined) return productionHosts(domain);
  return undefined;
}

/** All three origins from the environment. Throws when one cannot be resolved or they clash. */
export function hostsFromEnv(env: HostEnv): Hosts {
  const fallback = fallbackHosts(env);
  const home = nonEmpty(env.EMUNAS_HOME_ORIGIN) ?? fallback?.home;
  const quiet = nonEmpty(env.EMUNAS_QUIET_ORIGIN) ?? fallback?.quiet;
  const live = nonEmpty(env.EMUNAS_LIVE_ORIGIN) ?? fallback?.live;
  if (home === undefined || quiet === undefined || live === undefined) {
    throw new Error(
      "@emunas/links: no hosts configured; set EMUNAS_DOMAIN, EMUNAS_WORKERS_SUBDOMAIN, or all of EMUNAS_HOME_ORIGIN, EMUNAS_QUIET_ORIGIN and EMUNAS_LIVE_ORIGIN",
    );
  }
  return validateHosts({ home, quiet, live });
}

/**
 * The Quiet and Live origins only, for code that links between those two sites and never to
 * home (Live SEO). Same precedence as `hostsFromEnv`, but `EMUNAS_HOME_ORIGIN` is not needed.
 */
export function siteHostsFromEnv(env: HostEnv): SiteHosts {
  const fallback = fallbackHosts(env);
  const quiet = nonEmpty(env.EMUNAS_QUIET_ORIGIN) ?? fallback?.quiet;
  const live = nonEmpty(env.EMUNAS_LIVE_ORIGIN) ?? fallback?.live;
  if (quiet === undefined || live === undefined) {
    throw new Error(
      "@emunas/links: no hosts configured; set EMUNAS_DOMAIN, EMUNAS_WORKERS_SUBDOMAIN, or EMUNAS_QUIET_ORIGIN and EMUNAS_LIVE_ORIGIN",
    );
  }
  return validateHosts({ quiet, live });
}

/**
 * Normalizes the origins and rejects configurations that would let a canonical URL point
 * anywhere but Quiet: every origin given must be distinct, and Quiet must not be a
 * `analyze.*` host. `home` is checked when present (cross-site links need only Quiet and Live).
 */
export function validateHosts<H extends SiteHosts & { readonly home?: string }>(hosts: H): H {
  const quiet = normalizeOrigin(hosts.quiet);
  const live = normalizeOrigin(hosts.live);
  if (quiet === live) throw new Error("@emunas/links: Quiet and Live must have different origins");
  if (hostOf(quiet).startsWith(`${LIVE_SUBDOMAIN}.`)) {
    throw new Error(`@emunas/links: the Quiet (canonical) origin must not be a ${LIVE_SUBDOMAIN}.* host`);
  }
  if (hosts.home === undefined) return { ...hosts, quiet, live };
  const home = normalizeOrigin(hosts.home);
  if (home === quiet || home === live) throw new Error("@emunas/links: home, Quiet and Live must have different origins");
  return { ...hosts, home, quiet, live };
}

export function hostOf(origin: string): string {
  const m = ORIGIN_RE.exec(origin.toLowerCase());
  return m?.[2] ?? "";
}

/**
 * False for hosts that must carry `X-Robots-Tag: noindex`: `*.workers.dev` (including
 * preview aliases), localhost and plain IPs (integration-plan §2.1, §3.4).
 */
export function isIndexableOrigin(origin: string): boolean {
  const host = hostOf(origin);
  if (host === "" || host === "localhost") return false;
  if (host === "workers.dev" || host.endsWith(".workers.dev")) return false;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return false;
  return origin.toLowerCase().startsWith("https://");
}
