/**
 * Shell behaviours that are not visible components: `<html lang dir>` per interface language, focus
 * to the page `h1` after client navigation, and query-string → settings sync.
 */
import { UI_DIR, UI_LOCALE, type UiLang } from "@emunas/i18n";
import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation } from "react-router";
import { parseSettingsQuery, settingsStore } from "./settings.ts";
import { storeUi } from "./ui-preference.ts";

const useIsoLayoutEffect = typeof document === "undefined" ? useEffect : useLayoutEffect;

/**
 * Keeps `<html lang dir>` in step with the `:ui` segment and remembers the choice for `/`.
 * React renders these attributes in the root layout too; this covers hydration of the SPA fallback page, where React does not patch attribute
 * mismatches on `<html>`.
 */
export function useHtmlLang(ui: UiLang, remember = true): void {
  useIsoLayoutEffect(() => {
    const html = document.documentElement;
    html.lang = UI_LOCALE[ui];
    html.dir = UI_DIR[ui];
  }, [ui]);
  useEffect(() => {
    if (remember) storeUi(ui);
  }, [ui, remember]);
}

/** Selector for the element that receives focus after navigation. */
export const PAGE_HEADING_SELECTOR = "main h1";

/**
 * Moves focus to the page's `h1` after every client-side navigation that changes the path (not on
 * first load, not on query/hash-only changes such as `?t=` seeks), so screen-reader users hear the new
 * page title (tech-live §9). The heading gets `tabindex="-1"` so it can take focus without entering
 * the tab order.
 */
export function useFocusHeadingOnNavigate(): void {
  const { pathname } = useLocation();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const h1 = document.querySelector<HTMLElement>(PAGE_HEADING_SELECTOR);
    if (!h1) return;
    if (!h1.hasAttribute("tabindex")) h1.setAttribute("tabindex", "-1");
    h1.focus({ preventScroll: false });
  }, [pathname]);
}

/** Applies `?audio=` / `?read=` from the URL to the settings store whenever the query changes. */
export function useSettingsFromQuery(): void {
  const { search } = useLocation();
  useEffect(() => {
    const patch = parseSettingsQuery(search);
    if (Object.keys(patch).length > 0) settingsStore.getState().apply(patch);
  }, [search]);
}
