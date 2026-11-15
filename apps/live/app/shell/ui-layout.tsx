/**
 * Route module for `/:ui/*` (tech-live §1 routing): the app shell. Stays mounted for every page under
 * `/en/` and `/yi/`, including a switch between the two, so the dock and anything in it persist
 * (concept-live §4: "navigation never interrupts audio").
 *
 * Layout: header (site name, language control) · rail · main · dock slot. Logical CSS only; the
 * whole shell mirrors with `dir`.
 */
import { UI_DIR, isUiLang } from "@emunas/i18n";
import type { JSX } from "react";
import { Link, Outlet, useParams } from "react-router";
import { CommandBar } from "../features/command-bar/CommandBar.tsx";
import { tFor } from "../i18n/index.ts";
import { useFocusHeadingOnNavigate, useHtmlLang, useSettingsFromQuery } from "./behaviour.ts";
import { DockSlot } from "./dock.tsx";
import { LanguageMenu } from "./LanguageMenu.tsx";
import { NotFound } from "./PageStub.tsx";
import { Rail } from "./Rail.tsx";
import { styles } from "./styles.ts";

export const MAIN_ID = "main";

export default function UiLayout(): JSX.Element {
  const params = useParams();
  const ui = isUiLang(params["ui"]) ? params["ui"] : null;
  useHtmlLang(ui ?? "en", ui !== null);
  useFocusHeadingOnNavigate();
  useSettingsFromQuery();

  if (ui === null) {
    return (
      <main id={MAIN_ID} className={styles.bare}>
        <NotFound ui="en" />
      </main>
    );
  }

  const t = tFor(ui);
  return (
    <div className={styles.shell} data-ui={ui} dir={UI_DIR[ui]}>
      <a className={styles.skip} href={`#${MAIN_ID}`}>
        {t("shell.skip")}
      </a>
      <header className={styles.header}>
        <Link to={`/${ui}/`} className={styles.brand}>
          {t("site.short")}
        </Link>
        <CommandBar ui={ui} />
        <LanguageMenu ui={ui} />
      </header>
      <Rail ui={ui} />
      <main id={MAIN_ID} className={styles.main} tabIndex={-1}>
        <Outlet />
      </main>
      <DockSlot />
    </div>
  );
}
