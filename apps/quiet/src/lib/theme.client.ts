/**
 * Browser side of the Light · Dark switch in the header. The switch is rendered `hidden` and shown
 * here, so there are no dead buttons without script. The choice is the shared `emunas_theme` cookie
 * (@emunas/tokens), which the Live site reads too; the inline head script applied it before paint.
 */
import { currentTheme, refreshThemeCookie, resyncTheme, saveTheme, type Theme } from "@emunas/tokens";

export const THEME_SWITCH_SELECTOR = "[data-theme-switch]";

function isTheme(v: string | undefined): v is Theme {
  return v === "light" || v === "dark";
}

export function themeSwitch(
  doc: Document,
  loc: Pick<Location, "hostname" | "protocol">,
  win: Pick<Window, "addEventListener" | "removeEventListener">,
): void {
  refreshThemeCookie(doc, loc);
  const group = doc.querySelector<HTMLElement>(THEME_SWITCH_SELECTOR);
  if (!group) return;
  const buttons = Array.from(group.querySelectorAll<HTMLButtonElement>("button[data-theme-value]"));
  const show = (theme: Theme): void => {
    for (const b of buttons) b.setAttribute("aria-pressed", String(b.dataset["themeValue"] === theme));
  };
  for (const b of buttons) {
    b.addEventListener("click", () => {
      const theme = b.dataset["themeValue"];
      if (!isTheme(theme)) return;
      saveTheme(doc, loc, theme);
      show(theme);
    });
  }
  show(currentTheme(doc));
  resyncTheme(win, doc, show);
  group.hidden = false;
}
