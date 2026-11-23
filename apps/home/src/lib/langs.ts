/**
 * Languages on the home site. Home has no language switch yet, so it shows only English, the
 * current language; the doorways link each edition of Library and Analyze. The other interface
 * languages (`UI_LANGS` of `@emunas/i18n`: Yiddish, Hebrew, …) have their labels ready in
 * `Translations` tables (lib/content.ts) for a future switch; a new `UI_LANGS` entry makes tsc
 * ask for its text in each of them.
 */
import { UI_DIR, UI_ENDONYM, otherUiLangs, type UiLang } from "@emunas/i18n";
import { livePaths, quietPaths, type Hosts } from "@emunas/links";

/** The language the home site is written in. */
export const HOME_LANG = "en" as const satisfies UiLang;

/** Every interface language but English: the languages home has translations for. */
export type TranslationLang = Exclude<UiLang, typeof HOME_LANG>;

/** One English label in every other interface language. */
export type Translations = { readonly [L in TranslationLang]: string };

export interface EditionLink {
  readonly lang: UiLang;
  readonly dir: "ltr" | "rtl";
  /** The language's own name (`UI_ENDONYM`): English, אידיש, עברית. */
  readonly name: string;
  readonly href: string;
}

export interface SiteLinks {
  /** The English editions, where the doorways, pills and footer send readers. */
  readonly library: string;
  readonly listen: string;
  /** The other editions of each site, in `UI_LANGS` order. */
  readonly libraryEditions: readonly EditionLink[];
  readonly listenEditions: readonly EditionLink[];
}

const editions = (origin: string, home: (lang: UiLang) => string): EditionLink[] =>
  otherUiLangs(HOME_LANG).map((lang) => ({ lang, dir: UI_DIR[lang], name: UI_ENDONYM[lang], href: origin + home(lang) }));

/** Library (Quiet) and Analyze (Live) on their own hosts, in English and in every other edition. */
export function siteLinks(hosts: Hosts): SiteLinks {
  const quiet = quietPaths();
  const live = livePaths();
  return {
    library: hosts.quiet + quiet.home(HOME_LANG),
    listen: hosts.live + live.home(HOME_LANG),
    libraryEditions: editions(hosts.quiet, quiet.home),
    listenEditions: editions(hosts.live, live.home),
  };
}
