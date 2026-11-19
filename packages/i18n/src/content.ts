import { UI_DIR, UI_LANGS, type UiLang } from "./lang.ts";

/**
 * The content-language layer: how a site picks which language of a published text to show.
 *
 * Generated text (summaries, sections, stories, Q&A, write-ups, corpus entries) is written by the
 * pipeline in `en` and `yi`. Every further language comes from translation overlays
 * (`data/derived/**\/i18n/<lang>.json`, see docs/translation-runbook.md), applied by the data layer
 * only when the overlay's `sourceHash` matches the current en/yi text. A text with no current
 * translation in the reader's language falls back along `CONTENT_FALLBACK`, and the element that
 * shows it carries the `lang`/`dir` of the text actually shown (`PickedText.lang` / `.dir`), never
 * the edition's.
 */

/** Languages the pipeline always writes. Every `LocalizedText` has them. */
export const SOURCE_LANGS = ["en", "yi"] as const satisfies readonly UiLang[];
export type SourceLang = (typeof SOURCE_LANGS)[number];

/** Interface languages whose content comes from translation overlays (today `he`). */
export type TranslatedLang = Exclude<UiLang, SourceLang>;

export function isSourceLang(lang: UiLang): lang is SourceLang {
  return (SOURCE_LANGS as readonly UiLang[]).includes(lang);
}

/** Every `TranslatedLang`, in `UI_LANGS` order: the optional keys of a `Localized` value. */
export const TRANSLATED_LANGS: readonly TranslatedLang[] = UI_LANGS.filter((l): l is TranslatedLang => !isSourceLang(l));

/**
 * One published value per language: the source languages required, every other `UiLang` optional
 * (present only when a current translation exists). A new `UiLang` becomes an optional key here by
 * itself.
 */
export type Localized<T> = { readonly [L in SourceLang]: T } & { readonly [L in TranslatedLang]?: T };

/** A published text in every source language plus any current translations. */
export type LocalizedText = Localized<string>;

/**
 * A fallback chain: the reader's language first, then the languages to try in order, ending in a
 * source language so a `LocalizedText` always yields a text.
 */
export type ContentChain = readonly [UiLang, ...UiLang[], SourceLang];

/**
 * Which language to show a published text in, per reader language, in order of preference. The
 * first entry is the reader's own language. Hebrew readers get Yiddish before English (the
 * Yiddish write-up is the closer text); English and Yiddish readers fall back to each other.
 * A new `UiLang` must be given its chain here (tsc reports it).
 */
export const CONTENT_FALLBACK: Readonly<Record<UiLang, ContentChain>> = {
  en: ["en", "yi"],
  yi: ["yi", "en"],
  he: ["he", "yi", "en"],
};

/** A value picked for a reader, with the language it is actually in. */
export interface Picked<T> {
  readonly value: T;
  /** Language of `value`; put it in the element's `lang`. */
  readonly lang: UiLang;
  /** Direction of `lang`; put it in the element's `dir`. */
  readonly dir: "ltr" | "rtl";
  /** True when `lang` is not the reader's language (no current translation). */
  readonly fallback: boolean;
}

/** A text picked for a reader: `{ text, lang, dir, fallback }`. */
export interface PickedText {
  readonly text: string;
  readonly lang: UiLang;
  readonly dir: "ltr" | "rtl";
  readonly fallback: boolean;
}

/**
 * Default presence test of `pickLocalized`: null/undefined, a blank string and an empty array count
 * as missing; anything else is present.
 */
export function hasContent(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/**
 * Picks the first present value along the reader's chain from any per-language record, e.g. the
 * write-up blocks (`{ en: blocks, yi: blocks, he?: blocks }`). `null` when no language has one.
 */
export function pickLocalized<T>(
  values: Readonly<Partial<Record<UiLang, T>>> | null | undefined,
  reader: UiLang,
  isPresent: (value: T) => boolean = hasContent,
): Picked<T> | null {
  if (!values) return null;
  for (const lang of CONTENT_FALLBACK[reader]) {
    const value = values[lang];
    if (value !== undefined && isPresent(value)) {
      return { value, lang, dir: UI_DIR[lang], fallback: lang !== reader };
    }
  }
  return null;
}

/**
 * The text to show a reader of `reader`: the first non-blank text along `CONTENT_FALLBACK[reader]`.
 * When every language is blank, the chain's last (source) language is returned as it is.
 */
export function pickText(text: LocalizedText, reader: UiLang): PickedText {
  const picked = pickLocalized<string>(text, reader);
  if (picked) return { text: picked.value, lang: picked.lang, dir: picked.dir, fallback: picked.fallback };
  const chain = CONTENT_FALLBACK[reader];
  const last = chain[chain.length - 1] as SourceLang;
  return { text: text[last], lang: last, dir: UI_DIR[last], fallback: last !== reader };
}
