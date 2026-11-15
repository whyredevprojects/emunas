/**
 * Build configuration for SEO (W4.5): the two site origins, from the same variables as
 * `@emunas/links` (`EMUNAS_DOMAIN`, `EMUNAS_WORKERS_SUBDOMAIN` + `EMUNAS_STAGE`, or explicit
 * `EMUNAS_QUIET_ORIGIN` / `EMUNAS_LIVE_ORIGIN`), with the `VITE_`-prefixed spellings the listening
 * room's "Printable page" link reads as fallbacks. Null when nothing is configured (local dev): then
 * no canonical or hreflang is emitted rather than a guessed one.
 */
import { hostsFromEnv, type HostEnv, type Hosts } from "@emunas/links";

export type Env = Readonly<Record<string, string | undefined>>;

const KEYS = [
  "EMUNAS_QUIET_ORIGIN",
  "EMUNAS_LIVE_ORIGIN",
  "EMUNAS_DOMAIN",
  "EMUNAS_WORKERS_SUBDOMAIN",
  "EMUNAS_STAGE",
] as const satisfies readonly (keyof HostEnv)[];

export function seoHostEnv(env: Env): HostEnv {
  const out: Record<string, string> = {};
  for (const k of KEYS) {
    const v = env[k]?.trim() || env[`VITE_${k}`]?.trim();
    if (v) out[k] = v;
  }
  return out;
}

/** Hosts from the environment; null when none are configured. Throws on a malformed value. */
export function seoHosts(env: Env): Hosts | null {
  const h = seoHostEnv(env);
  const configured =
    h.EMUNAS_DOMAIN !== undefined ||
    h.EMUNAS_WORKERS_SUBDOMAIN !== undefined ||
    (h.EMUNAS_QUIET_ORIGIN !== undefined && h.EMUNAS_LIVE_ORIGIN !== undefined);
  return configured ? hostsFromEnv(h) : null;
}

/** A deploy build (`EMUNAS_DEPLOY=1`, set by the deploy workflow). */
export function isDeployBuild(env: Env): boolean {
  return env["EMUNAS_DEPLOY"] === "1";
}
