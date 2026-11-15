/**
 * The last interface language used on this device, so `/` can send a returning visitor to it.
 * Stored in localStorage and in a first-party cookie the site Worker can read for its `/` redirect
 * (integration-plan C20: cookie, then Accept-Language). All storage access is guarded: the app works
 * when storage is blocked.
 */
import { isUiLang, type UiLang } from "@emunas/i18n";

export const UI_PREF_KEY = "emunas.ui";
/** Cookie name read by the Live site Worker (W2.7) for the `/` redirect. */
export const UI_COOKIE = "emunas_ui";

export function readStoredUi(): UiLang | null {
  try {
    const v = globalThis.localStorage?.getItem(UI_PREF_KEY);
    if (isUiLang(v)) return v;
  } catch {
    // storage blocked
  }
  try {
    const m = /(?:^|;\s*)emunas_ui=(en|yi)(?:;|$)/.exec(globalThis.document?.cookie ?? "");
    if (m && isUiLang(m[1])) return m[1];
  } catch {
    // cookies blocked
  }
  return null;
}

export function storeUi(ui: UiLang): void {
  try {
    globalThis.localStorage?.setItem(UI_PREF_KEY, ui);
  } catch {
    // storage blocked
  }
  try {
    if (globalThis.document) {
      globalThis.document.cookie = `${UI_COOKIE}=${ui}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`;
    }
  } catch {
    // cookies blocked
  }
}
