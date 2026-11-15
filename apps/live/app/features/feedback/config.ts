/**
 * Runtime seams of the report feature: how it posts, how it gets Turnstile, and which site key it
 * uses. Production uses the defaults; tests swap them with `configureFeedback`.
 */
import { loadTurnstile, resolveSiteKey, type TurnstileApi } from "./turnstile.ts";

export interface FeedbackConfig {
  fetch: typeof fetch;
  loadTurnstile: () => Promise<TurnstileApi>;
  /** Null hides the report control (no key for this host). */
  siteKey: () => string | null;
}

function defaultSiteKey(): string | null {
  const env = import.meta.env as unknown as { VITE_TURNSTILE_SITE_KEY?: string; DEV?: boolean };
  const host = typeof location === "undefined" ? null : location.hostname;
  return resolveSiteKey(env, host);
}

const defaults: FeedbackConfig = {
  fetch: (input, init) => globalThis.fetch(input, init),
  loadTurnstile,
  siteKey: defaultSiteKey,
};

let current: FeedbackConfig = defaults;

export function configureFeedback(partial: Partial<FeedbackConfig>): void {
  current = { ...current, ...partial };
}

export function resetFeedbackConfig(): void {
  current = defaults;
}

export function feedbackConfig(): FeedbackConfig {
  return current;
}
