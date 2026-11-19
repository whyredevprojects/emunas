/**
 * Editions (concept-quiet §4, §8): one edition per interface language (`UI_LANGS` from
 * `@emunas/i18n`: `/en/…` left-to-right, `/yi/…` and `/he/…` right-to-left), identical structure.
 * The edition switch goes to the same path in another edition and keeps the query and the hash
 * (tech-quiet §2). Pure string helpers, browser-safe.
 */
import { UI_DIR, UI_LANGS, isUiLang, otherUiLangs, type UiLang } from "@emunas/i18n";
import { LANG_SCRIPT } from "@emunas/tokens";

export type Ed = UiLang;
/** Every edition, in `UI_LANGS` order (the order of the edition switch, hreflang and sitemaps). */
export const EDS: readonly Ed[] = UI_LANGS;

export const isEd = isUiLang;

export function dirOf(ed: Ed): "rtl" | "ltr" {
  return UI_DIR[ed];
}

/** Every edition except `ed`, in `EDS` order: the targets of the edition switch. */
export function otherEditions(ed: Ed): Ed[] {
  return otherUiLangs(ed);
}

const EDITION_PREFIX = new RegExp(`^/(${EDS.join("|")})(?:[/?#]|$)`);

/** The edition named by the first path segment, or null (`/`, `/audio/…`, foreign paths). */
export function editionOfPath(path: string): Ed | null {
  const m = EDITION_PREFIX.exec(path);
  return m && isEd(m[1]) ? m[1] : null;
}

/**
 * The same page in edition `to`: swaps the first path segment and keeps everything after it
 * (rest of the path, `?query`, `#hash`) byte for byte. A path without an edition (the root
 * chooser) goes to the edition home.
 */
export function switchEdition(path: string, to: Ed): string {
  if (!path.startsWith("/")) throw new TypeError(`switchEdition: expected a root-relative path, got ${JSON.stringify(path)}`);
  const from = editionOfPath(path);
  if (from === null) return `/${to}/`;
  const rest = path.slice(1 + from.length);
  return `/${to}${rest === "" ? "/" : rest}`;
}

/** The path after the edition segment (`/he/search/?q` → `/search/?q`), or null for a path with no edition. */
export function pathInEdition(path: string): string | null {
  const ed = editionOfPath(path);
  return ed === null ? null : path.slice(1 + ed.length) || "/";
}

/**
 * The order of the editions side by side in a right-to-left row (the root chooser, the 404 page):
 * the right-to-left editions first, so they stand on the right, then the left-to-right ones; each
 * group in `EDS` order.
 */
export const CHOOSER_ORDER: readonly Ed[] = [...EDS.filter((e) => dirOf(e) === "rtl"), ...EDS.filter((e) => dirOf(e) === "ltr")];

/** The edition is written in Hebrew script (Yiddish, Hebrew): names and terms in Hebrew letters come first. */
export function isHebrewScriptEdition(ed: Ed): boolean {
  return LANG_SCRIPT[ed] === "hebrew";
}

/**
 * Which name of an entry (person, topic, sefer, index headword) an edition shows, in order of
 * preference: English, Yiddish and Hebrew each first in their own edition; the Hebrew (loshn
 * koydesh) form comes next in the Yiddish and English editions, the Yiddish next in the Hebrew one.
 */
export const NAME_ORDER: Readonly<Record<Ed, readonly Ed[]>> = {
  en: ["en", "he", "yi"],
  yi: ["yi", "he", "en"],
  he: ["he", "yi", "en"],
};
