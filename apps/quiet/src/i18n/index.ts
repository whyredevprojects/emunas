/**
 * Quiet's UI strings (integration-plan §1.3: UI strings stay in each app) and the typed `t()`
 * built with `createT` from `@emunas/i18n`. One table per edition (`UI_LANGS`); `MessageTables`
 * makes `tsc` report a missing one.
 */
import { byUiLang, createT, type MessageTables, type TFunction } from "@emunas/i18n";
import type { Ed } from "../lib/edition.ts";
import { en, type UiKey } from "./en.ts";
import { he } from "./he.ts";
import { yi } from "./yi.ts";

export type { UiKey };
export const tables: MessageTables<UiKey> = { en, yi, he };

const ts = byUiLang((ed) => createT<UiKey>(tables, ed));

/** The typed `t()` for an edition (tables are static). */
export function useT(ed: Ed): TFunction<UiKey> {
  return ts[ed];
}
