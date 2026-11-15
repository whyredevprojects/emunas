/**
 * Interface languages of both sites. There is no Hebrew edition (concept-quiet §8);
 * Hebrew appears only as a script inside data strings, see `script.ts`.
 */
export type UiLang = "en" | "yi";

export const UI_LANGS: readonly UiLang[] = ["en", "yi"];

/** Writing direction of each interface language, for `<html dir>`. */
export const UI_DIR: Readonly<Record<UiLang, "ltr" | "rtl">> = { en: "ltr", yi: "rtl" };

/** BCP 47 tag used for `lang` attributes and `Intl` formatters. */
export const UI_LOCALE: Readonly<Record<UiLang, string>> = { en: "en", yi: "yi" };

export function isUiLang(value: unknown): value is UiLang {
  return value === "en" || value === "yi";
}
