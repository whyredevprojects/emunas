import { UI_LOCALE, type UiLang } from "./lang.ts";

/**
 * A message with plural forms, selected by `Intl.PluralRules` for the language.
 * English and Yiddish both use `one` / `other`; the other categories are accepted
 * so that tables stay valid if rules change, and fall back to `other`.
 */
export interface PluralMessage {
  readonly zero?: string;
  readonly one?: string;
  readonly two?: string;
  readonly few?: string;
  readonly many?: string;
  readonly other: string;
}

const rulesCache = new Map<UiLang, Intl.PluralRules>();

export function pluralRules(lang: UiLang): Intl.PluralRules {
  let rules = rulesCache.get(lang);
  if (!rules) {
    rules = new Intl.PluralRules(UI_LOCALE[lang]);
    rulesCache.set(lang, rules);
  }
  return rules;
}

/** The `Intl.PluralRules` category of `n` in `lang`. */
export function pluralCategory(lang: UiLang, n: number): Intl.LDMLPluralRule {
  return pluralRules(lang).select(n);
}

/** Picks the plural form for `n`, falling back to `other`. */
export function selectPlural(lang: UiLang, n: number, forms: PluralMessage): string {
  const category = pluralCategory(lang, n);
  return forms[category] ?? forms.other;
}
