/**
 * Colour theme shared by both sites. Light (paper) is the default whatever the OS prefers; a toggle
 * opts into dark. The choice lives in one cookie that both subdomains read
 * (emunas.com and analyze.emunas.com), and an inline <head>
 * script (`THEME_INIT_SCRIPT`) sets `<html data-theme="dark">` before first paint.
 *
 * Typed structurally (no DOM lib here) so the module works in both apps and in Node tests.
 */

export const THEME_COOKIE = "emunas_theme";
export const SHARED_COOKIE_DOMAIN = "emunas.com";
const MAX_AGE_SECONDS = 31_536_000;

export type Theme = "light" | "dark";

/** The parts of `document` the theme code touches. */
export interface ThemeDocument {
  readonly documentElement: { readonly dataset: Record<string, string | undefined> };
  cookie: string;
}

/** The parts of `location` the cookie attributes depend on. */
export interface ThemeLocation {
  readonly hostname: string;
  readonly protocol: string;
}

interface EventSource {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

/**
 * Runs in <head> before any stylesheet. Kept byte-constant: the Quiet and home CSPs allow it by its
 * sha256 (apps/quiet/public/_headers, apps/home/public/_headers), and each app's tests recompute
 * that hash from this string.
 */
export const THEME_INIT_SCRIPT =
  '(function(){try{if(/(?:^|;\\s*)emunas_theme=dark(?:;|$)/.test(document.cookie))document.documentElement.dataset.theme="dark"}catch(e){}})()';

const COOKIE_RE = /(?:^|;\s*)emunas_theme=(dark|light)(?:;|$)/;

/** The theme stored in a `document.cookie` string; light when absent or unrecognised. */
export function readThemeCookie(cookie: string): Theme {
  return COOKIE_RE.exec(cookie)?.[1] === "dark" ? "dark" : "light";
}

/**
 * The `document.cookie` assignment for a theme. Shared across subdomains on the production domain;
 * host-only elsewhere (localhost, 127.0.0.1, *.workers.dev previews). Secure only over https.
 */
export function themeCookie(theme: Theme, loc: ThemeLocation): string {
  const host = loc.hostname.toLowerCase();
  const parts = [`${THEME_COOKIE}=${theme}`, "Path=/", `Max-Age=${MAX_AGE_SECONDS}`, "SameSite=Lax"];
  if (host === SHARED_COOKIE_DOMAIN || host.endsWith(`.${SHARED_COOKIE_DOMAIN}`)) {
    parts.push(`Domain=${SHARED_COOKIE_DOMAIN}`);
  }
  if (loc.protocol === "https:") parts.push("Secure");
  return parts.join("; ");
}

/** Sets or clears `<html data-theme="dark">`. Light is the absence of the attribute. */
export function applyTheme(doc: ThemeDocument, theme: Theme): void {
  const { dataset } = doc.documentElement;
  if (theme === "dark") dataset["theme"] = "dark";
  else delete dataset["theme"];
}

/** The theme currently applied to the page. */
export function currentTheme(doc: ThemeDocument): Theme {
  return doc.documentElement.dataset["theme"] === "dark" ? "dark" : "light";
}

/** Applies the theme and stores it (as "light" or "dark", never deleted). */
export function saveTheme(doc: ThemeDocument, loc: ThemeLocation, theme: Theme): void {
  applyTheme(doc, theme);
  try {
    doc.cookie = themeCookie(theme, loc);
  } catch {
    // Cookies blocked: the choice holds for this page only.
  }
}

/** Re-saves a dark choice so the cookie's year starts again on each visit. */
export function refreshThemeCookie(doc: ThemeDocument, loc: ThemeLocation): void {
  try {
    if (readThemeCookie(doc.cookie) === "dark") doc.cookie = themeCookie("dark", loc);
  } catch {
    // Cookies blocked: nothing to refresh.
  }
}

/**
 * Re-reads the cookie when a page comes back from the back/forward cache or a hidden tab becomes
 * visible again (the other site may have changed the choice meanwhile). Returns the unsubscribe.
 */
export function resyncTheme(
  win: EventSource,
  doc: ThemeDocument & EventSource & { readonly visibilityState: string },
  onResync?: (theme: Theme) => void,
): () => void {
  const sync = (): void => {
    let theme: Theme;
    try {
      theme = readThemeCookie(doc.cookie);
    } catch {
      return;
    }
    applyTheme(doc, theme);
    onResync?.(theme);
  };
  const onVisibility = (): void => {
    if (doc.visibilityState === "visible") sync();
  };
  win.addEventListener("pageshow", sync);
  doc.addEventListener("visibilitychange", onVisibility);
  return () => {
    win.removeEventListener("pageshow", sync);
    doc.removeEventListener("visibilitychange", onVisibility);
  };
}
