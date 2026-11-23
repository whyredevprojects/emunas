/**
 * Language paths of the home site. Every page exists once per interface language (`UI_LANGS` of
 * `@emunas/i18n`): the default language at the root (`/about/`), every other one under its code
 * (`/yi/about/`, `/he/about/`). There is no `/en/` prefix and no redirect anywhere: each page is
 * generated statically (`langStaticPaths`, used by the pages in src/pages/[...lang]/). The 404 page
 * is a single page outside this scheme.
 */
import { UI_LANGS, isUiLang, type UiLang } from "@emunas/i18n";

/** The language served at the root, without a path prefix. `@emunas/i18n` names no default. */
export const HOME_DEFAULT_LANG = "en" as const satisfies UiLang;

/** Every prefixed language, in `UI_LANGS` order. */
const PREFIXED: readonly UiLang[] = UI_LANGS.filter((l) => l !== HOME_DEFAULT_LANG);
const PREFIX = new RegExp(`^/(${PREFIXED.join("|")})(?=/|$)`);

function assertRooted(path: string, fn: string): void {
  if (!path.startsWith("/") || /[?#]/.test(path)) throw new TypeError(`${fn}: expected a bare root-relative path, got ${JSON.stringify(path)}`);
}

/** The path of page `path` (language-neutral, e.g. `/about/`) in `lang`: `/about/`, `/he/about/`. */
export function homePath(lang: UiLang, path: string): string {
  assertRooted(path, "homePath");
  return lang === HOME_DEFAULT_LANG ? path : `/${lang}${path}`;
}

/** The language of a home path: its prefix, or the default language. */
export function langOfPath(path: string): UiLang {
  const m = PREFIX.exec(path);
  return m && isUiLang(m[1]) ? m[1] : HOME_DEFAULT_LANG;
}

/** The language-neutral page of a home path: `/he/about/` → `/about/`, `/he/` → `/`. */
export function pathInLang(path: string): string {
  assertRooted(path, "pathInLang");
  const m = PREFIX.exec(path);
  return m ? path.slice(m[0].length) || "/" : path;
}

/** The same page in language `to`: `switchHomeLang("/he/about/", "yi")` → `/yi/about/`. */
export function switchHomeLang(path: string, to: UiLang): string {
  return homePath(to, pathInLang(path));
}

export interface LangPathEntry {
  /** `undefined` for the default language: the rest parameter matches the empty path. */
  readonly params: { readonly lang: string | undefined };
  readonly props: { readonly lang: UiLang };
}

/** `getStaticPaths` of every page under src/pages/[...lang]/: one entry per `UI_LANGS` language. */
export function langStaticPaths(): LangPathEntry[] {
  return UI_LANGS.map((lang) => ({ params: { lang: lang === HOME_DEFAULT_LANG ? undefined : lang }, props: { lang } }));
}

/** Attributes for English-only text (essay and sefer titles) on a page in another language; none on an English page. */
export function englishAttrs(lang: UiLang): { lang?: "en"; dir?: "ltr" } {
  return lang === "en" ? {} : { lang: "en", dir: "ltr" };
}
