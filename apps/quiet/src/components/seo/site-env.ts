/**
 * Build configuration the Quiet pages need for absolute URLs (canonical, hreflang, OG, sitemaps,
 * robots.txt, "Open in the listening app") and for "report an error" (integration-plan §2.1, §2.3,
 * C18). Read from the build environment:
 *
 * - hosts, as `@emunas/links` `hostsFromEnv` reads them: `EMUNAS_DOMAIN` (the apex: home on it,
 *   Quiet on `library.`, Live on `listen.`), or `EMUNAS_WORKERS_SUBDOMAIN` (+ `EMUNAS_STAGE=staging`)
 *   for the workers.dev hosts, or explicit `EMUNAS_HOME_ORIGIN` + `EMUNAS_QUIET_ORIGIN` +
 *   `EMUNAS_LIVE_ORIGIN`;
 * - `EMUNAS_FEEDBACK_EMAIL`: the address error reports go to (plain `mailto:`, C18).
 *
 * Outside a deploy build, a missing value is replaced by a placeholder (`example.invalid`, a name
 * that can never resolve), the page carries `noindex`, and a warning is printed once. In a CI
 * deploy build (`CI` and `EMUNAS_DEPLOY` both set, the same switch `corpus:build` uses) a missing
 * value fails the build: a published site must never carry placeholder canonicals or addresses.
 * Values that are set but malformed always fail.
 */
import { createLinks, hostsFromEnv, productionHosts, type Hosts, type Links } from "@emunas/links";

export type SiteEnvVars = Readonly<Record<string, string | undefined>>;

/** Dev placeholder domain: `.invalid` is reserved (RFC 2606) and never resolves. */
export const PLACEHOLDER_DOMAIN = "example.invalid";
export const PLACEHOLDER_HOSTS: Hosts = productionHosts(PLACEHOLDER_DOMAIN);
export const PLACEHOLDER_FEEDBACK_EMAIL = `feedback@${PLACEHOLDER_DOMAIN}`;

const HOST_VARS = [
  "EMUNAS_DOMAIN",
  "EMUNAS_WORKERS_SUBDOMAIN",
  "EMUNAS_HOME_ORIGIN",
  "EMUNAS_QUIET_ORIGIN",
  "EMUNAS_LIVE_ORIGIN",
] as const;
const EMAIL_RE = /^[^\s@<>"?&#]+@[^\s@<>"?&#]+\.[^\s@<>"?&#]+$/;

export interface SiteEnv {
  readonly hosts: Hosts;
  /** Cross-site and absolute links over `hosts`. */
  readonly links: Links;
  /** Where error reports go. */
  readonly feedbackEmail: string;
  /** Which values are dev placeholders (never true in a deploy build). */
  readonly placeholder: { readonly hosts: boolean; readonly feedbackEmail: boolean };
}

const truthy = (v: string | undefined) => v !== undefined && /^(?:1|true|yes)$/i.test(v.trim());
const set = (v: string | undefined): v is string => v !== undefined && v.trim() !== "";

/** True for a CI deploy build (`CI` and `EMUNAS_DEPLOY`), where placeholders are not allowed. */
export function isDeployBuild(env: SiteEnvVars): boolean {
  return truthy(env["CI"]) && truthy(env["EMUNAS_DEPLOY"]);
}

/** Validates an address for a `mailto:` link; throws on anything that is not one plain address. */
export function parseFeedbackEmail(raw: string): string {
  const v = raw.trim();
  if (!EMAIL_RE.test(v)) throw new Error("EMUNAS_FEEDBACK_EMAIL is not a plain e-mail address");
  return v;
}

/** Resolves the site configuration from an environment (pure apart from the error it may throw). */
export function siteEnv(env: SiteEnvVars): SiteEnv {
  const deploy = isDeployBuild(env);
  const anyHost = HOST_VARS.some((k) => set(env[k]));
  let hosts: Hosts;
  if (anyHost) {
    hosts = hostsFromEnv(env); // throws on malformed or incomplete values
  } else if (deploy) {
    throw new Error(
      "Quiet deploy build: no site hosts configured; set EMUNAS_DOMAIN or EMUNAS_WORKERS_SUBDOMAIN (or EMUNAS_HOME_ORIGIN, EMUNAS_QUIET_ORIGIN and EMUNAS_LIVE_ORIGIN)",
    );
  } else {
    hosts = PLACEHOLDER_HOSTS;
  }
  const rawEmail = env["EMUNAS_FEEDBACK_EMAIL"];
  let feedbackEmail: string;
  if (set(rawEmail)) feedbackEmail = parseFeedbackEmail(rawEmail);
  else if (deploy) throw new Error("Quiet deploy build: EMUNAS_FEEDBACK_EMAIL is not set");
  else feedbackEmail = PLACEHOLDER_FEEDBACK_EMAIL;
  return {
    hosts,
    links: createLinks({ hosts }),
    feedbackEmail,
    placeholder: { hosts: !anyHost, feedbackEmail: !set(rawEmail) },
  };
}

let cached: SiteEnv | undefined;

/** `siteEnv(process.env)`, resolved once per build; warns once when placeholders are in use. */
export function currentSiteEnv(): SiteEnv {
  if (cached) return cached;
  cached = siteEnv(process.env);
  const missing = [
    ...(cached.placeholder.hosts ? ["site hosts (EMUNAS_DOMAIN …)"] : []),
    ...(cached.placeholder.feedbackEmail ? ["EMUNAS_FEEDBACK_EMAIL"] : []),
  ];
  if (missing.length > 0) {
    console.warn(`[quiet] not configured: ${missing.join(", ")}; using ${PLACEHOLDER_DOMAIN} placeholders and noindex`);
  }
  return cached;
}
