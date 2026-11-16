/**
 * The rail (concept-live §4.3): six destinations, then a link out to the Quiet site's edition home
 * (new tab). On narrow screens CSS turns it into a bottom bar above the dock. Mirrors with `dir`
 * (logical CSS only).
 */
import type { UiLang } from "@emunas/i18n";
import { formatLive, quietPaths } from "@emunas/links";
import { useEffect, useState, type JSX } from "react";
import { NavLink } from "react-router";
import { currentQuietOrigin } from "../features/listening-room/quiet-link.ts";
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

/** The Quiet edition home for `ui`; null without a Quiet origin (local dev). */
export function quietHomeUrl(origin: string | null, ui: UiLang): string | null {
  return origin === null ? null : origin + quietPaths().home(ui);
}

export function Rail({ ui }: { ui: UiLang }): JSX.Element {
  const t = useT();
  // Read after mount: pages are prerendered, where there is no `location`.
  const [quietOrigin, setQuietOrigin] = useState<string | null>(null);
  useEffect(() => setQuietOrigin(currentQuietOrigin()), []);
  const quietHome = quietHomeUrl(quietOrigin, ui);
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
        {quietHome && (
          <li className={styles.railOut}>
            <a href={quietHome} hrefLang={ui} target="_blank" rel="noopener" className={styles.railLink}>
              <span>
                {t("nav.quiet")}
                <span className="visually-hidden"> {t("nav.newTab")}</span>
              </span>
              <svg className={styles.railOutIcon} viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
                <path
                  d="M14 3h7v7h-2V6.41l-9.3 9.3-1.41-1.42L17.59 5H14V3zM5 5h6v2H5v12h12v-6h2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"
                  fill="currentColor"
                />
              </svg>
            </a>
          </li>
        )}
      </ul>
    </nav>
  );
}
