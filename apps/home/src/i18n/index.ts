/**
 * Home's UI strings and prose, one table per interface language (`UI_LANGS` of `@emunas/i18n`),
 * and the typed `t()` built with `createT`. `MessageTables` makes `tsc` report a missing language,
 * and `MessageTable<UiKey>` a missing key. Placeholders that are markup (links) are filled by
 * components/Rich.astro from named slots.
 */
import { byUiLang, createT, type MessageTables, type TFunction, type UiLang } from "@emunas/i18n";
import { en, type UiKey } from "./en.ts";
import { he } from "./he.ts";
import { yi } from "./yi.ts";

export type { UiKey };
export const tables: MessageTables<UiKey> = { en, yi, he };

const ts = byUiLang((lang) => createT<UiKey>(tables, lang));

/** The typed `t()` for a language (tables are static). */
export function useT(lang: UiLang): TFunction<UiKey> {
  return ts[lang];
}

const PLACEHOLDER = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

/** A placeholder in a message split by `segments`. */
export interface Placeholder {
  readonly name: string;
}

/**
 * Splits a message at its `{name}` placeholders, for messages whose placeholders are markup
 * (links): components/Rich.astro renders the text and puts the slot of the same name in each place.
 */
export function segments(message: string): (string | Placeholder)[] {
  const out: (string | Placeholder)[] = [];
  let last = 0;
  for (const m of message.matchAll(PLACEHOLDER)) {
    if (m.index > last) out.push(message.slice(last, m.index));
    out.push({ name: m[1] ?? "" });
    last = m.index + m[0].length;
  }
  if (last < message.length) out.push(message.slice(last));
  return out;
}

/** The placeholder names of a message, sorted (a translation must keep the same set: test/lib.test.ts). */
export function placeholders(message: string): string[] {
  return segments(message)
    .flatMap((s) => (typeof s === "string" ? [] : [s.name]))
    .sort();
}
