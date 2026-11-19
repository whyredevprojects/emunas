/**
 * Cloudflare Turnstile in the browser (explicit rendering). The script is loaded only when a
 * report dialog opens, so pages that never report load nothing from challenges.cloudflare.com
 * (CSP in `public/_headers` allows it in `script-src` and `frame-src`).
 *
 * Site key: `VITE_TURNSTILE_SITE_KEY` at build time. Without it, a dev build and a build served
 * from localhost use Cloudflare's always-pass test key (pairs with the always-pass test secret on a
 * local or staging `emunas-api`); any other host gets no key and the report control is not shown,
 * because a report could never pass verification there.
 */
import type { UiLang } from "@emunas/i18n";

export const TURNSTILE_SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/** Cloudflare's documented test site key that always passes (visible widget). */
export const TEST_SITE_KEY_PASS = "1x00000000000000000000AA";

export interface TurnstileRenderOptions {
  sitekey: string;
  callback: (token: string) => void;
  "error-callback": () => void;
  "expired-callback": () => void;
  "timeout-callback": () => void;
  language: string;
  appearance: "always" | "execute" | "interaction-only";
  theme: "auto" | "light" | "dark";
  size: "normal" | "flexible" | "compact";
  action: string;
}

/** The part of `window.turnstile` this feature uses. */
export interface TurnstileApi {
  render(container: HTMLElement, options: TurnstileRenderOptions): string | undefined;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export interface SiteKeyEnv {
  VITE_TURNSTILE_SITE_KEY?: string | undefined;
  DEV?: boolean | undefined;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function resolveSiteKey(env: SiteKeyEnv, hostname: string | null): string | null {
  const explicit = env.VITE_TURNSTILE_SITE_KEY?.trim();
  if (explicit) return explicit;
  if (env.DEV) return TEST_SITE_KEY_PASS;
  if (hostname !== null && LOCAL_HOSTS.has(hostname.toLowerCase())) return TEST_SITE_KEY_PASS;
  return null;
}

/** Turnstile's widget language per interface language. It has no Yiddish; "auto" follows the browser. */
const TURNSTILE_LANGUAGE: Readonly<Record<UiLang, string>> = { en: "en", yi: "auto", he: "he" };

export function turnstileLanguage(ui: UiLang): string {
  return TURNSTILE_LANGUAGE[ui];
}

let pending: Promise<TurnstileApi> | null = null;

/** Loads the Turnstile script once; a failed load can be retried. */
export function loadTurnstile(): Promise<TurnstileApi> {
  if (typeof window !== "undefined" && window.turnstile) return Promise.resolve(window.turnstile);
  if (pending) return pending;
  pending = new Promise<TurnstileApi>((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("no document"));
      return;
    }
    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT;
    script.async = true;
    script.defer = true;
    script.dataset["turnstile"] = "";
    script.onload = () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error("turnstile missing after load"));
    };
    script.onerror = () => {
      script.remove();
      reject(new Error("turnstile failed to load"));
    };
    document.head.append(script);
  }).catch((e: unknown) => {
    pending = null;
    throw e;
  });
  return pending;
}
