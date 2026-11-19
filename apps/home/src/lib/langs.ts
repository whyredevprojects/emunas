/**
 * Languages on the home site. Home is written in English; every other interface language of the
 * shiur sites (`UI_LANGS` of `@emunas/i18n`: Yiddish, Hebrew, …) appears as a short aside beside
 * the English label, and the doorways link each edition of Library and Analyze. A new interface
 * language is a new `UI_LANGS` entry: tsc then asks for its text in every `Asides` table.
 */
import { UI_DIR, UI_ENDONYM, UI_LANGS, otherUiLangs, type UiLang } from "@emunas/i18n";
import { livePaths, quietPaths, type Hosts } from "@emunas/links";

/** The language the home site is written in. */
export const HOME_LANG = "en" as const satisfies UiLang;

/** Every interface language but English: the languages of the asides. */
export type AsideLang = Exclude<UiLang, typeof HOME_LANG>;

export const ASIDE_LANGS: readonly AsideLang[] = UI_LANGS.filter((l): l is AsideLang => l !== HOME_LANG);

/** One phrase in every aside language. */
export type Asides = { readonly [L in AsideLang]: string };

export interface AsideText {
  readonly text: string;
  readonly lang: AsideLang;
  readonly dir: "ltr" | "rtl";
}

/**
 * The asides to show, in `UI_LANGS` order. A phrase identical to an earlier one (ספרים is the
 * same word in Yiddish and Hebrew) is shown once, under the first language that has it.
 */
export function asideTexts(asides: Asides): AsideText[] {
  const seen = new Set<string>();
  const out: AsideText[] = [];
  for (const lang of ASIDE_LANGS) {
    const text = asides[lang].trim();
    if (text === "" || seen.has(text)) continue;
    seen.add(text);
    out.push({ text, lang, dir: UI_DIR[lang] });
  }
  return out;
}

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
