/**
 * The per-language meta keys of the Quiet search records, shared by the index build
 * (scripts/build-search.ts) and the browser glue (src/scripts/search.ts). One key per interface
 * language (`UI_LANGS`), so a new language adds its keys by itself: `oneLinerEn`, `oneLinerYi`,
 * `oneLinerHe`; `labelEn`, `labelYi`, `labelHe` (the same label keys corpus-guard checks,
 * `PAGEFIND_LABEL_KEYS`). Browser-safe.
 */
import { UI_LANGS, type UiLang } from "@emunas/i18n";

const cap = (lang: UiLang): string => lang.charAt(0).toUpperCase() + lang.slice(1);

export type OneLinerKey = `oneLiner${Capitalize<UiLang>}`;
export type LabelKey = `label${Capitalize<UiLang>}`;

/** Meta key of a shiur record's one-line summary in `lang`. */
export function oneLinerKey(lang: UiLang): OneLinerKey {
  return `oneLiner${cap(lang)}` as OneLinerKey;
}

/** Meta key of an entity record's label in `lang`. */
export function labelKey(lang: UiLang): LabelKey {
  return `label${cap(lang)}` as LabelKey;
}

export const ONE_LINER_KEYS: readonly OneLinerKey[] = UI_LANGS.map(oneLinerKey);
export const LABEL_KEYS: readonly LabelKey[] = UI_LANGS.map(labelKey);
