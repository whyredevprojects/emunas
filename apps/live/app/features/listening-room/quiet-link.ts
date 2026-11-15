/**
 * The "Printable page" link: the same shiur on the Quiet site (integration-plan §2.2), built with
 * `@emunas/links`. The Quiet origin comes from build config (`VITE_EMUNAS_QUIET_ORIGIN`, or
 * `VITE_EMUNAS_DOMAIN` → the apex) and otherwise from the Live host itself, using the host scheme of
 * `@emunas/links` (`listen.<domain>` ↔ `<domain>`, `emunas-live[-staging].<sub>.workers.dev` ↔
 * `emunas-quiet[-staging].<sub>.workers.dev`). Null when it cannot be told (local dev): no link.
 */
import {
  LIVE_SUBDOMAIN,
  LIVE_WORKER,
  QUIET_WORKER,
  normalizeOrigin,
  productionHosts,
  quietPaths,
  type Ed,
} from "@emunas/links";

export interface QuietOriginEnv {
  VITE_EMUNAS_QUIET_ORIGIN?: string | undefined;
  VITE_EMUNAS_DOMAIN?: string | undefined;
}

function tryOrigin(fn: () => string): string | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

export function quietOrigin(env: QuietOriginEnv, here: { protocol: string; host: string } | null): string | null {
  const explicit = env.VITE_EMUNAS_QUIET_ORIGIN?.trim();
  if (explicit) return tryOrigin(() => normalizeOrigin(explicit));
  const domain = env.VITE_EMUNAS_DOMAIN?.trim();
  if (domain) return tryOrigin(() => productionHosts(domain).quiet);
  if (!here) return null;
  const host = here.host.toLowerCase();
  const scheme = here.protocol === "http:" ? "http" : "https";
  if (host.startsWith(`${LIVE_SUBDOMAIN}.`)) {
    return tryOrigin(() => normalizeOrigin(`${scheme}://${host.slice(LIVE_SUBDOMAIN.length + 1)}`));
  }
  const workers = new RegExp(`^${LIVE_WORKER}(-staging)?\\.([a-z0-9-]+)\\.workers\\.dev$`).exec(host);
  if (workers) {
    return tryOrigin(() => normalizeOrigin(`https://${QUIET_WORKER}${workers[1] ?? ""}.${workers[2]!}.workers.dev`));
  }
  return null;
}

/** Absolute URL of the shiur's Quiet page in edition `ed`, at `t` when given; null without an origin. */
export function printableUrl(origin: string | null, ed: Ed, shiurId: string, t?: number): string | null {
  if (origin === null) return null;
  try {
    return origin + quietPaths().shiur(ed, shiurId, t === undefined ? {} : { t });
  } catch {
    return null;
  }
}

/** The origin for this build and page. */
export function currentQuietOrigin(): string | null {
  const env = import.meta.env as unknown as QuietOriginEnv;
  const loc = typeof location === "undefined" ? null : location;
  return quietOrigin(env, loc);
}
