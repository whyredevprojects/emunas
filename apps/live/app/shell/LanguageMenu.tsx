/**
 * The language control (concept-live §4.4, §7): the interface switch is a plain link to the same page
 * in the other interface language (path, query and hash kept). Audio filter and reading language
 * are radio groups (react-aria-components, RTL-aware keyboard handling) in a popover; changes go to
 * the settings store and the current URL's query string.
 *
 * The popover is portalled into a container inside the header (not `<body>`), so it stays within the
 * banner landmark and inherits the shell's `dir`.
 */
import type { UiLang } from "@emunas/i18n";
import { useRef, type JSX } from "react";
import { UNSAFE_PortalProvider } from "react-aria";
import { Button, Dialog, DialogTrigger, Heading, Label, Popover, Radio, RadioGroup } from "react-aria-components";
import { Link, useLocation, useSearchParams } from "react-router";
import { useT } from "../i18n/index.ts";
import {
  readingLang,
  settingsStore,
  settingsToQuery,
  useSettings,
  type AudioFilter,
  type LanguageSettings,
} from "./settings.ts";
import { styles } from "./styles.ts";

/** The same location with the `:ui` segment swapped. */
export function switchUiHref(location: { pathname: string; search: string; hash: string }, to: UiLang): string {
  const rest = location.pathname.replace(/^\/(en|yi)(?=\/|$)/, "");
  const path = `/${to}${rest === "" ? "/" : rest}`;
  return `${path}${location.search}${location.hash}`;
}

const AUDIO_VALUES: readonly AudioFilter[] = ["both", "yi", "en"];

function isAudioFilter(v: string): v is AudioFilter {
  return (AUDIO_VALUES as readonly string[]).includes(v);
}

export function LanguageMenu({ ui }: { ui: UiLang }): JSX.Element {
  const t = useT();
  const location = useLocation();
  const [, setSearchParams] = useSearchParams();
  const audio = useSettings((s) => s.audio);
  const read = useSettings((s) => readingLang(s, ui));
  const other: UiLang = ui === "en" ? "yi" : "en";
  const portal = useRef<HTMLDivElement>(null);

  const update = (patch: Partial<LanguageSettings>): void => {
    settingsStore.getState().apply(patch);
    const { audio: a, read: r } = settingsStore.getState();
    setSearchParams((prev) => settingsToQuery({ audio: a, read: r }, prev), {
      replace: true,
      preventScrollReset: true,
    });
  };

  return (
    <div className={styles.lang}>
      <Link
        to={switchUiHref(location, other)}
        className={styles.langSwitch}
        lang={other}
        dir={other === "yi" ? "rtl" : "ltr"}
        hrefLang={other}
      >
        {t("lang.uiSwitch")}
      </Link>
      <div ref={portal} />
      <UNSAFE_PortalProvider getContainer={() => portal.current}>
        <DialogTrigger>
          <Button className={styles.langButton}>{t("lang.button")}</Button>
          <Popover className={styles.popover} placement="bottom end">
            <Dialog className={styles.dialog}>
              <Heading slot="title" className={styles.dialogTitle}>
                {t("lang.dialog")}
              </Heading>
              <RadioGroup
                className={styles.radioGroup}
                value={audio}
                onChange={(v) => {
                  if (isAudioFilter(v)) update({ audio: v });
                }}
              >
                <Label className={styles.radioLabel}>{t("lang.audio")}</Label>
                <Radio value="both" className={styles.radio}>
                  {t("lang.audio.both")}
                </Radio>
                <Radio value="yi" className={styles.radio}>
                  {t("lang.audio.yi")}
                </Radio>
                <Radio value="en" className={styles.radio}>
                  {t("lang.audio.en")}
                </Radio>
              </RadioGroup>
              <RadioGroup
                className={styles.radioGroup}
                value={read}
                onChange={(v) => {
                  if (v === "en" || v === "yi") update({ read: v === ui ? null : v });
                }}
              >
                <Label className={styles.radioLabel}>{t("lang.read")}</Label>
                <Radio value="en" className={styles.radio}>
                  {t("lang.read.en")}
                </Radio>
                <Radio value="yi" className={styles.radio}>
                  {t("lang.read.yi")}
                </Radio>
              </RadioGroup>
            </Dialog>
          </Popover>
        </DialogTrigger>
      </UNSAFE_PortalProvider>
    </div>
  );
}
