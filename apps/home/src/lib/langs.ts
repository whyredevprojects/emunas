/**
 * Links from a home page into Library (Quiet) and Analyze (Live). A page in one language links
 * that language's edition of each site (`/{lang}/` on its host), and lists the other editions
 * (`UI_LANGS` of `@emunas/i18n`) beside it.
 */
import { UI_DIR, UI_ENDONYM, otherUiLangs, type UiLang } from "@emunas/i18n";
import { livePaths, quietPaths, type Hosts } from "@emunas/links";

export interface EditionLink {
  readonly lang: UiLang;
  readonly dir: "ltr" | "rtl";
  /** The language's own name (`UI_ENDONYM`): English, אידיש, עברית. */
  readonly name: string;
  readonly href: string;
}

export interface SiteLinks {
  /** The page language's edition of each site, where the doorways, pills and footer send readers. */
  readonly library: string;
  readonly listen: string;
  /** The other editions of each site, in `UI_LANGS` order. */
  readonly libraryEditions: readonly EditionLink[];
  readonly listenEditions: readonly EditionLink[];
}

const editions = (origin: string, home: (lang: UiLang) => string, lang: UiLang): EditionLink[] =>
  otherUiLangs(lang).map((l) => ({ lang: l, dir: UI_DIR[l], name: UI_ENDONYM[l], href: origin + home(l) }));

/** Library and Analyze on their own hosts, in `lang` and in every other edition. */
export function siteLinks(hosts: Hosts, lang: UiLang): SiteLinks {
  const quiet = quietPaths();
  const live = livePaths();
  return {
    library: hosts.quiet + quiet.home(lang),
    listen: hosts.live + live.home(lang),
    libraryEditions: editions(hosts.quiet, quiet.home, lang),
    listenEditions: editions(hosts.live, live.home, lang),
  };
}
