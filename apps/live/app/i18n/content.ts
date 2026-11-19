/**
 * Data labels and generated text in the reader's language. Every per-language data value
 * (`LocalizedText`, `FacetLabel`) is read through here, so a language without a text of its own
 * falls back along `CONTENT_FALLBACK` (@emunas/i18n: he → yi → en, yi → en, en → yi) instead of
 * showing nothing. To render, prefer `<Text value={l} lang={ui} />`, which also takes the `lang`/`dir`
 * of the text actually shown; use this for plain-text contexts (`aria-label`, `<title>`, sorting).
 */
import { pickText, type LocalizedText, type UiLang } from "@emunas/i18n";
import { LANG_SCRIPT } from "@emunas/tokens";

/** The string of `label` to show a reader of `ui`. */
export function labelText(label: LocalizedText, ui: UiLang): string {
  return pickText(label, ui).text;
}

/**
 * Whether the edition is written in Latin script (`LANG_SCRIPT` from @emunas/tokens). Data that
 * comes as an English form and a Hebrew-script form (names, sefer titles, references, dates) shows
 * the English form in a Latin-script edition and the Hebrew-script form in every other one, so a
 * further language follows its script without a change here.
 */
export function latinEdition(ui: UiLang): boolean {
  return LANG_SCRIPT[ui] === "latin";
}

/** The `lang` of a Hebrew-script form in edition `ui` (Yiddish editions read it as loshn koydesh). */
export function hebrewFormLang(ui: UiLang): "en" | "he" {
  return latinEdition(ui) ? "en" : "he";
}
