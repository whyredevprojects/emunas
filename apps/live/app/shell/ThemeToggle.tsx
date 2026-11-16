/**
 * The dark-colours toggle in the header. Light (paper) is the default whatever the OS prefers; the
 * choice is the `emunas_theme` cookie shared with the Quiet site (@emunas/tokens). The inline head
 * script in root.tsx applies a dark choice before paint; this button reflects `<html data-theme>`
 * and changes it. A fixed label with `aria-pressed` (react-aria-components ToggleButton).
 */
import type { UiLang } from "@emunas/i18n";
import { refreshThemeCookie, resyncTheme, saveTheme } from "@emunas/tokens";
import { useEffect, useSyncExternalStore, type JSX } from "react";
import { ToggleButton } from "react-aria-components";
import { tFor } from "../i18n/index.ts";
import { styles } from "./styles.ts";

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

const isDark = (): boolean => document.documentElement.dataset["theme"] === "dark";

/** Whether `<html data-theme="dark">` is set; false while prerendering. */
export function useDarkTheme(): boolean {
  return useSyncExternalStore(subscribe, isDark, () => false);
}

export function ThemeToggle({ ui }: { ui: UiLang }): JSX.Element {
  const t = tFor(ui);
  const dark = useDarkTheme();

  useEffect(() => {
    refreshThemeCookie(document, location);
    return resyncTheme(window, document);
  }, []);

  return (
    <ToggleButton
      className={styles.themeButton}
      aria-label={t("theme.dark")}
      isSelected={dark}
      onChange={(selected) => saveTheme(document, location, selected ? "dark" : "light")}
    >
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
        <path
          fill="currentColor"
          d="M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.39 5.39 0 0 1-4.4 2.26 5.4 5.4 0 0 1-3.14-9.8c-.44-.06-.9-.1-1.36-.1z"
        />
      </svg>
    </ToggleButton>
  );
}
