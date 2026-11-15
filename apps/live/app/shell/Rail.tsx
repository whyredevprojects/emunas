/**
 * The rail (concept-live §4.3): six destinations. On narrow screens CSS turns it into a bottom bar
 * above the dock. Mirrors with `dir` (logical CSS only).
 */
import type { UiLang } from "@emunas/i18n";
import { formatLive } from "@emunas/links";
import type { JSX } from "react";
import { NavLink } from "react-router";
import { useT, type UiKey } from "../i18n/index.ts";
import { styles } from "./styles.ts";

export interface RailItem {
  key: UiKey;
  to: string;
  /** Exact match only (Today would otherwise be active everywhere). */
  end: boolean;
}

export function railItems(ui: UiLang): RailItem[] {
  return [
    { key: "nav.today", to: formatLive({ kind: "home", ed: ui }), end: true },
    { key: "nav.explore", to: formatLive({ kind: "index", ed: ui, index: "explore" }), end: false },
    { key: "nav.seforim", to: formatLive({ kind: "index", ed: ui, index: "sources" }), end: false },
    { key: "nav.maasios", to: formatLive({ kind: "index", ed: ui, index: "stories" }), end: false },
    { key: "nav.series", to: formatLive({ kind: "index", ed: ui, index: "series" }), end: false },
    { key: "nav.shelf", to: formatLive({ kind: "index", ed: ui, index: "shelf" }), end: false },
  ];
}

export function Rail({ ui }: { ui: UiLang }): JSX.Element {
  const t = useT();
  return (
    <nav className={styles.rail} aria-label={t("shell.rail")}>
      <ul className={styles.railList}>
        {railItems(ui).map((item) => (
          <li key={item.key}>
            <NavLink to={item.to} end={item.end} className={styles.railLink}>
              {t(item.key)}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
