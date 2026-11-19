import type { UiLang } from "./lang.ts";
import { formatNumber } from "./numbers.ts";
import { selectPlural, type PluralMessage } from "./plural.ts";

/** One UI message: plain text with `{name}` placeholders, or plural forms. */
export type Message = string | PluralMessage;

/**
 * A complete message table for one language. Every key of `K` is required, so a
 * table that misses a key fails `tsc` (integration-plan §1.3: UI strings stay in
 * each app, typed against one key union).
 */
export type MessageTable<K extends string> = { readonly [P in K]: Message };

/** One table per interface language for one key union; a missing language fails `tsc`. */
export type MessageTables<K extends string> = { readonly [L in UiLang]: MessageTable<K> };

/** Interpolation values. `count` also selects the plural form. */
export type Params = Readonly<Record<string, string | number>>;

export interface TFunction<K extends string> {
  /** Looks up `key`, picks the plural form from `params.count`, fills `{name}` placeholders. */
  (key: K, params?: Params): string;
  readonly lang: UiLang;
  /** Narrows an untyped string (e.g. from data) to a key of this table. */
  has(key: string): key is K;
}

const PLACEHOLDER = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

function interpolate(template: string, lang: UiLang, params: Params | undefined): string {
  if (!params) return template;
  return template.replace(PLACEHOLDER, (whole, name: string) => {
    const value = params[name];
    if (value === undefined) return whole; // visible in review, never throws on a live page
    return typeof value === "number" ? formatNumber(value, lang) : value;
  });
}

/**
 * Builds a typed `t()` for one interface language.
 *
 * ```ts
 * // apps/<site>/.../i18n/en.ts
 * export const en = { "nav.home": "Home", "list.count": { one: "{count} shiur", other: "{count} shiurim" } } as const;
 * export type UiKey = keyof typeof en;
 * // yi.ts, he.ts
 * export const yi: MessageTable<UiKey> = { ... };   // a missing key is a type error
 * export const he: MessageTable<UiKey> = { ... };   // so is a missing language in createT
 * // use
 * const t = createT<UiKey>({ en, yi, he }, "he");
 * t("list.count", { count: 3 });
 * t("missing");                                     // type error
 * ```
 */
export function createT<K extends string>(tables: MessageTables<K>, lang: UiLang): TFunction<K> {
  const table: MessageTable<K> = tables[lang];
  const t = (key: K, params?: Params): string => {
    const message: Message | undefined = Object.hasOwn(table, key) ? table[key] : undefined;
    if (message === undefined) return key; // only reachable from untyped callers
    if (typeof message === "string") return interpolate(message, lang, params);
    const count = params?.["count"];
    const n = typeof count === "number" ? count : Number(count ?? Number.NaN);
    const form = Number.isFinite(n) ? selectPlural(lang, n, message) : message.other;
    return interpolate(form, lang, params);
  };
  const has = (key: string): key is K => Object.hasOwn(table, key);
  return Object.assign(t, { lang, has });
}
