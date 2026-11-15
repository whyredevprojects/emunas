/**
 * Editions (concept-quiet §4, §8): `/yi/…` right-to-left and `/en/…` left-to-right, identical
 * structure. The edition switch goes to the same path in the other edition and keeps the query
 * and the hash (tech-quiet §2). Pure string helpers, browser-safe.
 */
import { UI_DIR, isUiLang, type UiLang } from "@emunas/i18n";

export type Ed = UiLang;
export const EDS: readonly Ed[] = ["yi", "en"];

export const isEd = isUiLang;

export function dirOf(ed: Ed): "rtl" | "ltr" {
  return UI_DIR[ed];
}

export function otherEdition(ed: Ed): Ed {
  return ed === "yi" ? "en" : "yi";
}

/** The edition named by the first path segment, or null (`/`, `/audio/…`, foreign paths). */
export function editionOfPath(path: string): Ed | null {
  const m = /^\/(yi|en)(?:[/?#]|$)/.exec(path);
  return m ? (m[1] as Ed) : null;
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
