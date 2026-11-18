/**
 * Showing generated text (summaries, sections, stories, Q&A, write-ups, corpus entries) in an
 * edition. Every such text is a `LocalizedText` (`en` and `yi` always, a further language only when
 * a current translation exists); the edition shows its own language when there is one and otherwise
 * falls back along `CONTENT_FALLBACK` from `@emunas/i18n` (Hebrew → Yiddish → English). The element
 * that shows a text carries the `lang`/`dir` of the text actually shown (`langAttrs`), never the
 * edition's, so a Yiddish fallback inside the Hebrew edition is marked as Yiddish.
 */
import { pickText, type LocalizedText, type PickedText, type UiLang } from "@emunas/i18n";
import { LANG_SCRIPT } from "@emunas/tokens";
import type { Ed } from "./edition.ts";

export type { LocalizedText, PickedText };

/** The text to show in `ed`, or null when every language is blank (or there is no text). */
export function shownText(text: LocalizedText | null | undefined, ed: Ed): PickedText | null {
  if (!text) return null;
  const picked = pickText(text, ed);
  return picked.text.trim() === "" ? null : picked;
}

/** `shownText(…)?.text`, or "" (for plain-text contexts that ignore the language, e.g. sorting). */
export function plainText(text: LocalizedText | null | undefined, ed: Ed): string {
  return shownText(text, ed)?.text ?? "";
}

/** The `lang`/`dir` attributes of a shown text. */
export function langAttrs(picked: { readonly lang: UiLang; readonly dir: "ltr" | "rtl" }): { lang: UiLang; dir: "ltr" | "rtl" } {
  return { lang: picked.lang, dir: picked.dir };
}

/**
 * Attributes for an element inside a page of edition `ed` that shows `picked`: none when the text is
 * in the edition's own language (it inherits `<html lang dir>`), else its `lang`/`dir`.
 */
export function langAttrsIn(picked: { readonly lang: UiLang; readonly dir: "ltr" | "rtl" }, ed: Ed): { lang?: UiLang; dir?: "ltr" | "rtl" } {
  return picked.lang === ed ? {} : langAttrs(picked);
}

/**
 * `lang`/`dir` of an occasion's name (parsha, zman) as an edition shows it: the Yiddish and Hebrew
 * editions use the Hebrew name (loshn koydesh, `he`), the English edition the English one.
 */
export function occasionNameAttrs(ed: Ed): { lang: "he" | "en"; dir: "rtl" | "ltr" } {
  return LANG_SCRIPT[ed] === "hebrew" ? { lang: "he", dir: "rtl" } : { lang: "en", dir: "ltr" };
}
