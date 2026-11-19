/**
 * Interface languages of both sites. This list is the one place the language set lives: every
 * per-language table is a `Record<UiLang, …>` (or `MessageTables<K>`), so adding a language here makes
 * `tsc` report each table that still lacks it. Order is the order of language menus and hreflang
 * alternates.
 *
 * `en` and `yi` are written by the pipeline; every further language gets its content from
 * translation overlays (`TRANSLATION_LANGS` in src/types.ts) and falls back along `CONTENT_FALLBACK`
 * (./content.ts) where a text has no current translation.
 */
export const UI_LANGS = ["en", "yi", "he"] as const;

export type UiLang = (typeof UI_LANGS)[number];

/** Writing direction of each interface language, for `<html dir>`. */
export const UI_DIR: Readonly<Record<UiLang, "ltr" | "rtl">> = { en: "ltr", yi: "rtl", he: "rtl" };

/** BCP 47 tag used for `lang` attributes, hreflang and `Intl` formatters. */
export const UI_LOCALE: Readonly<Record<UiLang, string>> = { en: "en", yi: "yi", he: "he" };

/** Each language's name in itself, for language menus ("English", "אידיש", "עברית"). */
export const UI_ENDONYM: Readonly<Record<UiLang, string>> = { en: "English", yi: "אידיש", he: "עברית" };

const LANG_SET: ReadonlySet<string> = new Set(UI_LANGS);

export function isUiLang(value: unknown): value is UiLang {
  return typeof value === "string" && LANG_SET.has(value);
}

/** Every interface language except `lang`, in `UI_LANGS` order (the alternates of a page). */
export function otherUiLangs(lang: UiLang): UiLang[] {
  return UI_LANGS.filter((l) => l !== lang);
}

/**
 * Builds a complete per-language record from a function, so code that needs one value per language
 * never lists the languages itself: `byUiLang((lang) => createT(tables, lang))`.
 */
export function byUiLang<T>(make: (lang: UiLang) => T): Record<UiLang, T> {
  return Object.fromEntries(UI_LANGS.map((lang) => [lang, make(lang)])) as Record<UiLang, T>;
}
