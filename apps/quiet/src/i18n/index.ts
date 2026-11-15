/**
 * Quiet's UI strings (integration-plan §1.3: UI strings stay in each app) and the typed `t()`
 * built with `createT` from `@emunas/i18n`.
 */
import { createT, type TFunction } from "@emunas/i18n";
import type { Ed } from "../lib/edition.ts";
import { en, type UiKey } from "./en.ts";
import { yi } from "./yi.ts";

export type { UiKey };
export const tables = { en, yi } as const;

const cache = new Map<Ed, TFunction<UiKey>>();

/** The typed `t()` for an edition (memoised; tables are static). */
export function useT(ed: Ed): TFunction<UiKey> {
  let t = cache.get(ed);
  if (!t) {
    t = createT<UiKey>(tables, ed);
    cache.set(ed, t);
  }
  return t;
}
