/**
 * Host config (integration-plan §2.1, §3.4).
 *
 * Production: Quiet on the apex `https://<domain>/`, Live on `https://listen.<domain>/`.
 * Until the domain is chosen (O8), and on staging: the workers.dev hosts
 * `emunas-quiet[-staging].<subdomain>.workers.dev` and `emunas-live[-staging].<subdomain>.workers.dev`.
 */

export interface Hosts {
  /** Origin, e.g. `https://example.org` (no trailing slash). */
  readonly quiet: string;
  readonly live: string;
}

/**
 * Environment variables read by `hostsFromEnv`. Pass `process.env`, `import.meta.env` or a
 * Worker `env`; extra keys are ignored. Precedence: explicit origins, then the domain,
 * then the workers.dev subdomain.
 */
export interface HostEnv {
  /** Full origins, mainly for local dev (`http://localhost:4321`) and preview URLs. */
  readonly EMUNAS_QUIET_ORIGIN?: string | undefined;
  readonly EMUNAS_LIVE_ORIGIN?: string | undefined;
  /** Registrable production domain, e.g. `example.org` (Quiet = apex, Live = `listen.` + it). */
  readonly EMUNAS_DOMAIN?: string | undefined;
  /** Cloudflare account workers.dev subdomain (the `<account>` in `<worker>.<account>.workers.dev`). */
  readonly EMUNAS_WORKERS_SUBDOMAIN?: string | undefined;
  /** `staging` selects the `-staging` workers.dev hosts. Ignored when a domain is set. */
  readonly EMUNAS_STAGE?: string | undefined;
}

export const LIVE_SUBDOMAIN = "listen";
export const QUIET_WORKER = "emunas-quiet";
export const LIVE_WORKER = "emunas-live";

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

export function productionHosts(domain: string): Hosts {
  const d = domain.trim().toLowerCase().replace(/^www\./, "");
  if (!HOSTNAME_RE.test(d)) throw new Error(`@emunas/links: bad domain: ${JSON.stringify(domain)}`);
  if (d.startsWith(`${LIVE_SUBDOMAIN}.`)) {
    throw new Error(`@emunas/links: EMUNAS_DOMAIN is the apex (Quiet), not the ${LIVE_SUBDOMAIN}. host`);
  }
  return { quiet: `https://${d}`, live: `https://${LIVE_SUBDOMAIN}.${d}` };
}

export function workersDevHosts(subdomain: string, stage: "production" | "staging" = "production"): Hosts {
  const sub = subdomain.trim().toLowerCase();
  if (!LABEL_RE.test(sub)) throw new Error(`@emunas/links: bad workers.dev subdomain: ${JSON.stringify(subdomain)}`);
  const suffix = stage === "staging" ? "-staging" : "";
  return {
    quiet: `https://${QUIET_WORKER}${suffix}.${sub}.workers.dev`,
    live: `https://${LIVE_WORKER}${suffix}.${sub}.workers.dev`,
  };
}

function nonEmpty(v: string | undefined): string | undefined {
  return v === undefined || v.trim() === "" ? undefined : v;
}

export function hostsFromEnv(env: HostEnv): Hosts {
  const stage = nonEmpty(env.EMUNAS_STAGE) === "staging" ? "staging" : "production";
  const domain = nonEmpty(env.EMUNAS_DOMAIN);
  const sub = nonEmpty(env.EMUNAS_WORKERS_SUBDOMAIN);
  let fallback: Hosts | undefined;
  if (domain !== undefined && stage === "production") fallback = productionHosts(domain);
  else if (sub !== undefined) fallback = workersDevHosts(sub, stage);
  else if (domain !== undefined) fallback = productionHosts(domain);
  const quietRaw = nonEmpty(env.EMUNAS_QUIET_ORIGIN) ?? fallback?.quiet;
  const liveRaw = nonEmpty(env.EMUNAS_LIVE_ORIGIN) ?? fallback?.live;
  if (quietRaw === undefined || liveRaw === undefined) {
    throw new Error(
      "@emunas/links: no hosts configured; set EMUNAS_DOMAIN, EMUNAS_WORKERS_SUBDOMAIN, or EMUNAS_QUIET_ORIGIN and EMUNAS_LIVE_ORIGIN",
    );
  }
  return validateHosts({ quiet: normalizeOrigin(quietRaw), live: normalizeOrigin(liveRaw) });
}

/** Rejects host pairs that would let a canonical URL point at the Live site. */
export function validateHosts(hosts: Hosts): Hosts {
  const quiet = normalizeOrigin(hosts.quiet);
  const live = normalizeOrigin(hosts.live);
  if (quiet === live) throw new Error("@emunas/links: Quiet and Live must have different origins");
  if (hostOf(quiet).startsWith(`${LIVE_SUBDOMAIN}.`)) {
    throw new Error(`@emunas/links: the Quiet (canonical) origin must not be a ${LIVE_SUBDOMAIN}.* host`);
  }
  return { quiet, live };
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
